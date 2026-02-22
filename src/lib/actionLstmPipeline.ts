import * as tf from "@tensorflow/tfjs";

const MODEL_PATH = "/models/v_fixed_v3/model.json";
const SEQUENCE_LENGTH = 30;
const FEATURE_SIZE = 1662;

// INCREASED THRESHOLD & STABILITY
const CONFIDENCE_THRESHOLD = 0.85; // Higher floor for mobile
const STABILITY_WINDOW = 8; // Must be steady for ~8 frames (~250ms)

const ACTION_CLASSES = ["hello", "thanks", "iloveyou"];

class ActionLstmPipeline {
  private model: tf.LayersModel | null = null;
  private frameBuffer: Float32Array[] = [];
  private stabilityBuffer: string[] = [];
  private _ready = false;
  private isLoading = false;
  private lastTriggeredAction: string | null = null;
  private lastTriggerTime: number = 0;

  get ready() { return this._ready; }

  async initialize(): Promise<void> {
    if (this._ready || this.isLoading) return;
    this.isLoading = true;
    try {
      await tf.ready();
      this.model = await tf.loadLayersModel(MODEL_PATH);
      this._ready = true;
    } catch (e) {
      console.error("Model load error:", e);
      throw e;
    } finally { this.isLoading = false; }
  }

  pushFrame(features: Float32Array): void {
    // FIX 1: Feature Normalization
    // Mobile sensors often provide noisy "0" values. 
    // We clean the input before it hits the buffer.
    const cleanFeatures = features.map(v => (isNaN(v) ? 0 : v));
    
    this.frameBuffer.push(cleanFeatures);
    if (this.frameBuffer.length > SEQUENCE_LENGTH) {
      this.frameBuffer.shift();
    }
  }

  async predict(): Promise<{ action: string; confidence: number } | null> {
    if (!this.model || this.frameBuffer.length < SEQUENCE_LENGTH) return null;

    // FIX 2: Cool-down period
    // Prevents "Iloveyou" from firing immediately after "Hello"
    const now = Date.now();
    if (now - this.lastTriggerTime < 1500) return null;

    const inputData = new Float32Array(SEQUENCE_LENGTH * FEATURE_SIZE);
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
      inputData.set(this.frameBuffer[i], i * FEATURE_SIZE);
    }

    const tensor = tf.tensor3d(inputData, [1, SEQUENCE_LENGTH, FEATURE_SIZE]);

    try {
      const prediction = this.model.predict(tensor) as tf.Tensor;
      const probs = await prediction.data();
      prediction.dispose();

      let maxIdx = 0;
      let maxProb = 0;
      
      // Get the highest probability
      for (let i = 0; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i];
          maxIdx = i;
        }
      }

      const currentAction = ACTION_CLASSES[maxIdx];

      // FIX 3: Stricter Stability Window
      if (maxProb >= CONFIDENCE_THRESHOLD) {
        this.stabilityBuffer.push(currentAction);
      } else {
        this.stabilityBuffer.push("searching");
      }

      if (this.stabilityBuffer.length > STABILITY_WINDOW) {
        this.stabilityBuffer.shift();
      }

      // Check if the window is 100% consistent
      const isConsistent = this.stabilityBuffer.every(val => val === currentAction);
      
      if (isConsistent && maxProb >= CONFIDENCE_THRESHOLD) {
        // Only trigger if it's different from the last one or enough time has passed
        if (currentAction !== this.lastTriggeredAction || (now - this.lastTriggerTime > 3000)) {
          this.lastTriggeredAction = currentAction;
          this.lastTriggerTime = now;
          this.stabilityBuffer = []; 
          return { action: currentAction, confidence: maxProb };
        }
      }

      return null;
    } finally { tensor.dispose(); }
  }

  clearBuffer(): void { 
    this.frameBuffer = []; 
    this.stabilityBuffer = [];
    this.lastTriggeredAction = null;
  }
}

export const actionLstmPipeline = new ActionLstmPipeline();