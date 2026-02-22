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
        modelComplexity: 1, 
        smoothLandmarks: true,
        // Adjusted for mobile sensor sensitivity
        minDetectionConfidence: 0.5, 
        minTrackingConfidence: 0.5,
        refineFaceLandmarks: false,
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

  reset() {
    this.isProcessing = false;
    this.resolveDetection = null;
    this.lastResults = null;
  }

  async rebind() {
    this.reset();
    if (this.holistic) {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      try {
        await this.holistic.send({ image: canvas });
      } catch (e) { console.warn("Rebind failed", e); }
    }
  }

  async extractFeatures(video: HTMLVideoElement, isBackCamera: boolean = false): Promise<Float32Array | null> {
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

      return this.resultsToFeatures(results, isBackCamera);
    } catch (err) { return null; }
  }

  private resultsToFeatures(results: Results, isBackCamera: boolean): Float32Array {
    const features = new Float32Array(FEATURE_LENGTH);
    let offset = 0;

    // --- MOBILE SCALING LOGIC ---
    // Calculate a standard scale based on hand size to normalize different distances
    let scaleFactor = 1.0;
    const activeHand = results.rightHandLandmarks || results.leftHandLandmarks;
    if (activeHand && activeHand.length > 0) {
      const wrist = activeHand[0];
      const middleBase = activeHand[9];
      // Calculate Euclidean distance between wrist and middle finger base
      const dist = Math.sqrt(
        Math.pow(wrist.x - middleBase.x, 2) + 
        Math.pow(wrist.y - middleBase.y, 2)
      );
      // 0.15 is an empirical "sweet spot" for distance normalization
      if (dist > 0) scaleFactor = 0.15 / dist;
    }

    const fill = (landmarks: any[] | undefined, count: number, dims: number, shouldMirror: boolean, hasVis = false) => {
      if (landmarks && landmarks.length > 0) {
        // Use the first landmark (wrist or nose) as the relative origin
        const origin = landmarks[0]; 
        
        for (let i = 0; i < count; i++) {
          const lm = landmarks[i];
          if (lm) {
            // Anchor coordinates to origin and apply scaling
            let finalX = (lm.x - origin.x) * scaleFactor + 0.5;
            let finalY = (lm.y - origin.y) * scaleFactor + 0.5;
            let finalZ = (lm.z ?? 0) * scaleFactor;

            if (isBackCamera) finalX = 1 - finalX; 
            if (shouldMirror) finalX = 1 - finalX;

            features[offset++] = finalX;
            features[offset++] = finalY;
            features[offset++] = finalZ;
            if (hasVis) features[offset++] = lm.visibility ?? 0;
          } else { 
            offset += (dims + (hasVis ? 1 : 0)); 
          }
        }
      } else { 
        offset += count * (dims + (hasVis ? 1 : 0)); 
      }
    };

    // Fill features (Pose, Face, Hands)
    fill(results.poseLandmarks, 33, 3, false, true);
    fill(results.faceLandmarks, 468, 3, false);
    fill(results.leftHandLandmarks, 21, 3, true); 
    fill(results.rightHandLandmarks, 21, 3, false); 
    
    return features;
  }
}

export const holisticDetector = new HolisticDetector();