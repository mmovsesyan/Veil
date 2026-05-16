/**
 * Privacy Budget Tracker
 *
 * Monitors fingerprinting API usage across tabs and assigns a "privacy budget"
 * score per domain. Inspired by the Privacy Budget concept from Google's Privacy
 * Sandbox, but implemented as a defensive measurement tool for users.
 *
 * Tracks APIs:
 *   - Canvas 2D / WebGL fingerprinting
 *   - AudioContext (OscillatorNode + AnalyserNode)
 *   - Battery API
 *   - Screen / window metrics
 *   - Navigator properties (plugins, mimeTypes, userAgentData)
 *   - Font enumeration (client-side)
 *   - WebRTC (local IP leak)
 *   - Performance.memory
 *   - DeviceOrientation / DeviceMotion
 *
 * Score ranges: 0 (clean) → 100 (extreme fingerprinting)
 */

export interface FingerprintingEvent {
  api: string;
  method: string;
  entropyBits: number; // estimated bits of identifying info
  timestamp: number;
}

export interface DomainPrivacyScore {
  domain: string;
  totalScore: number; // 0-100 capped
  events: FingerprintingEvent[];
  apiCounts: Record<string, number>;
  lastUpdated: number;
}

// Estimated entropy per API call (empirical values from AmIUnique / FPJS studies)
const ENTROPY_TABLE: Record<string, number> = {
  "canvas.getImageData": 8.5,
  "canvas.toDataURL": 8.5,
  "canvas.toBlob": 8.5,
  "webgl.getParameter": 6.0,
  "webgl.getShaderPrecisionFormat": 4.0,
  "webgl.readPixels": 5.0,
  "audio.oscillator": 5.5,
  "audio.analyser": 5.5,
  "audio.getFloatFrequencyData": 5.5,
  "battery.getBattery": 3.0,
  "navigator.plugins": 4.5,
  "navigator.mimeTypes": 3.5,
  "navigator.userAgentData": 5.0,
  "screen.width": 2.5,
  "screen.height": 2.5,
  "screen.colorDepth": 1.5,
  "screen.availWidth": 2.0,
  "screen.availHeight": 2.0,
  "window.devicePixelRatio": 2.0,
  "window.outerWidth": 1.5,
  "window.outerHeight": 1.5,
  "performance.memory": 2.5,
  "webrtc.localDescription": 6.0,
  "deviceorientation": 3.0,
  "devicemotion": 3.0,
  "font.enumeration": 7.0,
  "timezone": 1.5,
  "language": 1.5,
};

// Decay: old events lose weight over time (exponential decay half-life = 1 hour)
const DECAY_HALF_LIFE_MS = 60 * 60 * 1000;

export class PrivacyBudgetTracker {
  private scores = new Map<string, DomainPrivacyScore>();
  private maxEventsPerDomain = 500;

  /** Record a fingerprinting event for a domain. */
  recordEvent(domain: string, event: Omit<FingerprintingEvent, "timestamp">): void {
    const now = Date.now();
    const fullEvent: FingerprintingEvent = {
      ...event,
      timestamp: now,
    };

    let score = this.scores.get(domain);
    if (!score) {
      score = {
        domain,
        totalScore: 0,
        events: [],
        apiCounts: {},
        lastUpdated: now,
      };
      this.scores.set(domain, score);
    }

    score.events.push(fullEvent);
    if (score.events.length > this.maxEventsPerDomain) {
      score.events = score.events.slice(-this.maxEventsPerDomain);
    }

    score.apiCounts[event.api] = (score.apiCounts[event.api] ?? 0) + 1;
    score.lastUpdated = now;
    score.totalScore = this.computeScore(score);
  }

  /** Get the current privacy score for a domain (0-100). */
  getScore(domain: string): DomainPrivacyScore | undefined {
    const score = this.scores.get(domain);
    if (!score) return undefined;
    // Recompute with time decay
    score.totalScore = this.computeScore(score);
    return { ...score };
  }

  /** Get top offending domains sorted by score. */
  getTopDomains(limit = 10): DomainPrivacyScore[] {
    return Array.from(this.scores.values())
      .map((s) => ({ ...s, totalScore: this.computeScore(s) }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
  }

  /** Clear all data. */
  clear(): void {
    this.scores.clear();
  }

  /** Export as JSON for sync/storage. */
  export(): Record<string, DomainPrivacyScore> {
    const result: Record<string, DomainPrivacyScore> = {};
    for (const [domain, score] of this.scores) {
      result[domain] = { ...score, totalScore: this.computeScore(score) };
    }
    return result;
  }

  /** Import from JSON. */
  import(data: Record<string, DomainPrivacyScore>): void {
    for (const [domain, score] of Object.entries(data)) {
      this.scores.set(domain, score);
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private computeScore(score: DomainPrivacyScore): number {
    const now = Date.now();
    let raw = 0;

    for (const ev of score.events) {
      const bits = ENTROPY_TABLE[ev.method] ?? 1.0;
      const ageMs = now - ev.timestamp;
      const decayFactor = Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);
      raw += bits * decayFactor;
    }

    // Apply diminishing returns: each additional bit contributes less
    const diminished = 100 * (1 - Math.exp(-raw / 25));
    return Math.min(100, Math.round(diminished * 10) / 10);
  }
}

/**
 * Generate a content-script injectable monitor that wraps fingerprinting APIs
 * and reports usage back to the extension via postMessage.
 *
 * Usage: inject the returned string as a script tag with world: MAIN.
 */
export function generatePrivacyMonitorScript(): string {
  return `
(function() {
  if (window.__veilPrivacyMonitor) return;
  window.__veilPrivacyMonitor = true;

  var trackedApis = ${JSON.stringify(ENTROPY_TABLE)};

  function report(method) {
    window.postMessage({
      type: "veil-privacy-event",
      method: method,
      timestamp: Date.now(),
      url: location.href,
    }, "*");
  }

  // Canvas
  var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function() {
    report("canvas.getImageData");
    return origGetImageData.apply(this, arguments);
  };
  var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function() {
    report("canvas.toDataURL");
    return origToDataURL.apply(this, arguments);
  };
  var origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function() {
    report("canvas.toBlob");
    return origToBlob.apply(this, arguments);
  };

  // WebGL
  var origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(p) {
    report("webgl.getParameter");
    return origGetParameter.apply(this, arguments);
  };

  // AudioContext
  var origCreateOscillator = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function() {
    report("audio.oscillator");
    return origCreateOscillator.apply(this, arguments);
  };
  var origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
  AnalyserNode.prototype.getFloatFrequencyData = function() {
    report("audio.getFloatFrequencyData");
    return origGetFloatFreq.apply(this, arguments);
  };

  // Battery
  if (navigator.getBattery) {
    var origGetBattery = navigator.getBattery;
    navigator.getBattery = function() {
      report("battery.getBattery");
      return origGetBattery.apply(this, arguments);
    };
  }

  // WebRTC
  var origCreateOffer = RTCPeerConnection.prototype.createOffer;
  RTCPeerConnection.prototype.createOffer = function() {
    report("webrtc.localDescription");
    return origCreateOffer.apply(this, arguments);
  };

  // Performance.memory
  if (performance.memory) {
    Object.defineProperty(performance, "memory", {
      get: function() {
        report("performance.memory");
        return performance.__veilOrigMemory;
      }
    });
    performance.__veilOrigMemory = performance.memory;
  }

  // Device orientation / motion
  window.addEventListener("deviceorientation", function() {
    report("deviceorientation");
  }, { once: true });
  window.addEventListener("devicemotion", function() {
    report("devicemotion");
  }, { once: true });
})();
`;
}
