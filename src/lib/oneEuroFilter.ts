class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.y = value;
      this.s = value;
    } else {
      this.s = alpha * value + (1 - alpha) * (this.s ?? value);
      this.y = this.s;
    }
    return this.y;
  }

  get lastValue(): number | null { return this.y; }
  reset() { this.y = null; this.s = null; }
}

export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(freq = 30, minCutoff = 0.5, beta = 0.01, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number): number {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(value: number, timestamp?: number): number {
    if (timestamp !== undefined && this.lastTime !== null) {
      const dt = (timestamp - this.lastTime) / 1000;
      if (dt > 0) this.freq = 1.0 / dt;
    }
    this.lastTime = timestamp ?? (this.lastTime !== null ? this.lastTime + 1000 / this.freq : performance.now());

    const prevX = this.xFilter.lastValue;
    const dValue = prevX !== null ? (value - prevX) * this.freq : 0;
    const edValue = this.dxFilter.filter(dValue, this.alpha(this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.xFilter.filter(value, this.alpha(cutoff));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class LandmarkSmoother {
  private filters: OneEuroFilter[];

  constructor(featureSize = 1662, freq = 30, minCutoff = 0.5, beta = 0.01) {
    this.filters = Array.from({ length: featureSize }, () => 
      new OneEuroFilter(freq, minCutoff, beta)
    );
  }

  smooth(features: Float32Array, ts?: number): Float32Array {
    const smoothed = new Float32Array(features.length);
    for (let i = 0; i < features.length; i++) {
      if (features[i] !== 0) {
        smoothed[i] = this.filters[i].filter(features[i], ts);
      } else {
        smoothed[i] = 0;
      }
    }
    return smoothed;
  }

  reset() { this.filters.forEach(f => f.reset()); }
}