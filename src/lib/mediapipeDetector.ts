import type { Holistic as HolisticType, Results } from "@mediapipe/holistic";

const FEATURE_LENGTH = 1662;

class HolisticDetector {
  private holistic: HolisticType | null = null;
  private _ready = false;
  private isLoading = false;
  private resolveDetection: ((results: Results) => void) | null = null;
  private isProcessing = false;
  public lastResults: Results | null = null;

  get ready() { return this._ready; }

  async initialize(): Promise<void> {
    if (this._ready || this.isLoading) return;
    this.isLoading = true;

    try {
      const HolisticConstructor = (window as any).Holistic;
      if (!HolisticConstructor) throw new Error("MediaPipe Holistic script not found.");

      this.holistic = new HolisticConstructor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
      });

      this.holistic!.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.holistic!.onResults((results: Results) => {
        this.lastResults = results;
        if (this.resolveDetection) {
          this.resolveDetection(results);
          this.resolveDetection = null;
        }
        this.isProcessing = false; 
      });

      await this.rebind();
      this._ready = true;
    } catch (e) {
      this.isProcessing = false;
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  // Force-rebind the model to clear hangs during camera switching
  async rebind() {
    this.isProcessing = false;
    this.resolveDetection = null;
    if (this.holistic) {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      await this.holistic.send({ image: canvas });
    }
  }

  async extractFeatures(video: HTMLVideoElement): Promise<Float32Array | null> {
    if (!this.holistic || !this._ready || this.isProcessing || video.readyState < 2) return null;

    try {
      this.isProcessing = true;
      const results = await new Promise<Results>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.isProcessing = false;
          reject("Timeout");
        }, 1500);

        this.resolveDetection = (res) => {
          clearTimeout(timeout);
          resolve(res);
        };
        
        this.holistic!.send({ image: video }).catch(err => {
          this.isProcessing = false;
          reject(err);
        });
      });

      return this.resultsToFeatures(results);
    } catch (err) {
      return null;
    }
  }

  private resultsToFeatures(results: Results): Float32Array {
    const features = new Float32Array(FEATURE_LENGTH);
    let offset = 0;
    const fill = (landmarks: any[] | undefined, count: number, dims: number, hasVis = false) => {
      if (landmarks && landmarks.length > 0) {
        for (let i = 0; i < count; i++) {
          const lm = landmarks[i];
          if (lm) {
            features[offset++] = lm.x;
            features[offset++] = lm.y;
            features[offset++] = lm.z;
            if (hasVis) features[offset++] = lm.visibility ?? 0;
          } else { offset += (dims + (hasVis ? 1 : 0)); }
        }
      } else { offset += count * (dims + (hasVis ? 1 : 0)); }
    };
    fill(results.poseLandmarks, 33, 3, true);
    fill(results.faceLandmarks, 468, 3);
    fill(results.leftHandLandmarks, 21, 3);
    fill(results.rightHandLandmarks, 21, 3);
    return features;
  }
}

export const holisticDetector = new HolisticDetector();