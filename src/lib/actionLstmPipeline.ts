import * as tf from "@tensorflow/tfjs";

const MODEL_PATH = "/models/v_fixed_v3/model.json";
const SEQUENCE_LENGTH = 30;
const FEATURE_SIZE = 1662;
// Lower threshold to 0.5 to make it less "picky" while testing
const CONFIDENCE_THRESHOLD = 0.85; 

const ACTION_CLASSES = ["hello", "thanks", "iloveyou"];

class ActionLstmPipeline {
  private model: tf.LayersModel | null = null;
  private frameBuffer: Float32Array[] = [];
  private _ready = false;
  private isLoading = false;

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
    this.frameBuffer.push(features);
    if (this.frameBuffer.length > SEQUENCE_LENGTH) {
      this.frameBuffer.shift();
    }
  }

  async predict(): Promise<{ action: string; confidence: number } | null> {
    if (!this.model || this.frameBuffer.length < SEQUENCE_LENGTH) return null;

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
      let maxProb = probs[0];
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i];
          maxIdx = i;
        }
      }

      if (maxProb >= CONFIDENCE_THRESHOLD) {
        return { action: ACTION_CLASSES[maxIdx], confidence: maxProb };
      }
      return null;
    } finally { tensor.dispose(); }
  }

  clearBuffer(): void { this.frameBuffer = []; }
}

export const actionLstmPipeline = new ActionLstmPipeline();