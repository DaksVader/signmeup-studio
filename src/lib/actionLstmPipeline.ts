/**
 * Action LSTM Pipeline
 * 
 * Uses a TensorFlow.js LSTM model (converted from action.h5) to recognize
 * sign language actions from a 30-frame sliding window of MediaPipe Holistic
 * landmarks (1,662 features per frame).
 * 
 * Classes: hello, thanks, iloveyou
 */

import * as tf from "@tensorflow/tfjs";

const MODEL_PATH = "/models/v_fixed_v3/model.json";
const SEQUENCE_LENGTH = 30;
const FEATURE_SIZE = 1662;
// 🔥 FIX: 0.85 is too strict for many LSTM models. 0.7 is better for real-time.
const CONFIDENCE_THRESHOLD = 0.5; 

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
      console.log("Action LSTM model loaded");
    } catch (e) {
      console.error("Failed to load Action LSTM model:", e);
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  pushFrame(features: Float32Array): void {
    this.frameBuffer.push(features);
    if (this.frameBuffer.length > SEQUENCE_LENGTH) {
      this.frameBuffer.shift();
    }
  }

  async predict(): Promise<{ action: string; confidence: number } | null> {
    // Only predict if we have a full sequence of 30 frames
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
    } finally {
      tensor.dispose();
    }
  }

  clearBuffer(): void { this.frameBuffer = []; }
}

export const actionLstmPipeline = new ActionLstmPipeline();