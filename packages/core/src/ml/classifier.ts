/**
 * Smart DOM Classifier
 *
 * Lightweight TensorFlow.js model that classifies DOM elements as:
 *   0 - content (legitimate page content)
 *   1 - ad (display ad, banner, pop-up)
 *   2 - tracker (tracking pixel, analytics beacon)
 *   3 - social (social widget, share button)
 *   4 - annoyance (cookie banner, paywall, newsletter modal)
 *
 * The model is a small MLP (64 → 32 → 16 → 5) trained on synthetic + real data.
 * It runs entirely on-device via WebGL backend.
 */

import type { DOMFeatures } from "./dom-features.js";
import { createLogger } from "../logger.js";

const logger = createLogger("ml-classifier");

export type ClassificationLabel = "content" | "ad" | "tracker" | "social" | "annoyance";

export interface ClassificationResult {
  label: ClassificationLabel;
  confidence: number; // 0-1
  probabilities: Record<ClassificationLabel, number>;
}

const LABELS: ClassificationLabel[] = ["content", "ad", "tracker", "social", "annoyance"];

// Thresholds: block only if confidence >= threshold
const CONFIDENCE_THRESHOLDS: Record<ClassificationLabel, number> = {
  content: 0.0, // never block content
  ad: 0.85,
  tracker: 0.80,
  social: 0.85,
  annoyance: 0.90,
};

/**
 * Lightweight on-device classifier.
 *
 * If TensorFlow.js is not available, falls back to a heuristic rule-based
 * classifier that uses the same feature vector.
 */
import type * as tf from "@tensorflow/tfjs";

export class SmartDOMClassifier {
  private tf: typeof tf | null = null;
  private model: tf.LayersModel | null = null;
  private fallbackMode = false;

  /** Load TF.js and build/compile the model. */
  async initialize(): Promise<void> {
    try {
      this.tf = await import("@tensorflow/tfjs");
      await this.tf.setBackend("webgl");
      this.model = this.buildModel();
      await this.model.compile({
        optimizer: this.tf.train.adam(0.001),
        loss: "categoricalCrossentropy",
        metrics: ["accuracy"],
      });
    } catch {
      logger.warn("TF.js unavailable, falling back to heuristic classifier");
      this.fallbackMode = true;
    }
  }

  /** Classify a single DOM element given its feature vector. */
  classify(features: DOMFeatures): ClassificationResult {
    if (this.fallbackMode || !this.tf || !this.model) {
      return this.heuristicClassify(features);
    }

    const input = this.tf.tensor2d([Array.from(features.vector)], [1, 64]);
    const output = this.model.predict(input) as tf.Tensor;
    const probs = Array.from(output.dataSync());
    input.dispose();
    output.dispose();

    return this.formatResult(probs);
  }

  /** Batch classify multiple elements (more efficient). */
  classifyBatch(featuresList: DOMFeatures[]): ClassificationResult[] {
    if (this.fallbackMode || !this.tf || !this.model) {
      return featuresList.map((f) => this.heuristicClassify(f));
    }

    const batchSize = featuresList.length;
    const matrix = featuresList.map((f) => Array.from(f.vector));
    const input = this.tf!.tensor2d(matrix, [batchSize, 64]);
    const output = this.model.predict(input) as tf.Tensor;
    const flat = Array.from(output.dataSync());
    input.dispose();
    output.dispose();

    const results: ClassificationResult[] = [];
    for (let i = 0; i < batchSize; i++) {
      results.push(this.formatResult(flat.slice(i * 5, (i + 1) * 5)));
    }
    return results;
  }

  /**
   * Train the model on labeled data.
   * Call this periodically with user feedback (element picker blocks = positive labels).
   */
  async train(
    featuresList: DOMFeatures[],
    labels: ClassificationLabel[],
    epochs = 5,
  ): Promise<void> {
    if (!this.tf || !this.model || this.fallbackMode) return;

    const xs = this.tf.tensor2d(
      featuresList.map((f) => Array.from(f.vector)),
      [featuresList.length, 64],
    );
    const ys = this.tf.tensor2d(
      labels.map((l) => {
        const oneHot = new Array(5).fill(0);
        oneHot[LABELS.indexOf(l)] = 1;
        return oneHot;
      }),
      [labels.length, 5],
    );

    await this.model.fit(xs, ys, { epochs, verbose: 0 });
    xs.dispose();
    ys.dispose();
  }

  /** Export model weights as JSON for sync/storage. */
  async exportWeights(): Promise<Record<string, number[][]>> {
    if (!this.model) return {};
    const weights: Record<string, number[][]> = {};
    for (const layer of this.model.layers) {
      const w = layer.getWeights();
      if (w.length > 0) {
        weights[layer.name] = w.map((t) => Array.from(t.dataSync()));
      }
    }
    return weights;
  }

  /** Import model weights from JSON. */
  async importWeights(weights: Record<string, number[][]>): Promise<void> {
    if (!this.tf || !this.model) return;
    for (const layer of this.model.layers) {
      const w = weights[layer.name];
      if (w) {
        const tensors = w.map((arr, i) => {
          const shape = layer.getWeights()[i]?.shape ?? [arr.length];
          return this.tf!.tensor(arr, shape);
        });
        layer.setWeights(tensors);
        tensors.forEach((t) => t.dispose());
      }
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private buildModel(): tf.LayersModel {
    if (!this.tf) throw new Error("TF.js not loaded");
    return this.tf.sequential({
      layers: [
        this.tf.layers.dense({ inputShape: [64], units: 32, activation: "relu" }),
        this.tf.layers.dropout({ rate: 0.3 }),
        this.tf.layers.dense({ units: 16, activation: "relu" }),
        this.tf.layers.dropout({ rate: 0.2 }),
        this.tf.layers.dense({ units: 5, activation: "softmax" }),
      ],
    });
  }

  private formatResult(probs: number[]): ClassificationResult {
    const maxIdx = probs.indexOf(Math.max(...probs));
    const label = LABELS[maxIdx]!;
    const confidence = probs[maxIdx] ?? 0;

    const probabilities = {} as Record<ClassificationLabel, number>;
    LABELS.forEach((l, i) => (probabilities[l] = Math.round((probs[i] ?? 0) * 1000) / 1000));

    return { label, confidence, probabilities };
  }

  /** Heuristic fallback when TF.js is unavailable. */
  private heuristicClassify(features: DOMFeatures): ClassificationResult {
    const f = features.vector;

    // Score each class heuristically
    let contentScore = 0.2; // baseline — most elements are content
    let adScore = 0;
    let trackerScore = 0;
    let socialScore = 0;
    let annoyanceScore = 0;

    // Ad signals
    adScore += (f[9] ?? 0) * 0.3; // fixed position
    adScore += (f[10] ?? 0) * 0.2; // sticky
    adScore += (f[11] ?? 0) * 0.1; // absolute
    adScore += (f[17] ?? 0) * 0.15; // wide aspect
    adScore += (f[28] ?? 0) * 0.3; // iframe
    for (let i = 32; i < 48; i++) adScore += (f[i] ?? 0) * 0.4; // ad keywords

    // Tracker signals
    trackerScore += (f[28] ?? 0) * 0.3; // iframe
    trackerScore += (f[16] ?? 0) * 0.2; // small area
    trackerScore += (f[14] ?? 0) * 0.2; // display none (invisible pixel)
    trackerScore += (f[15] ?? 0) * 0.2; // visibility hidden
    for (let i = 48; i < 56; i++) trackerScore += (f[i] ?? 0) * 0.4; // tracking keywords

    // Social signals
    socialScore += (f[29] ?? 0) * 0.2; // img
    for (let i = 56; i < 64; i++) socialScore += (f[i] ?? 0) * 0.5; // social keywords

    // Annoyance signals
    annoyanceScore += (f[9] ?? 0) * 0.3; // fixed
    annoyanceScore += (f[12] ?? 0) * 0.3; // high z-index
    annoyanceScore += (f[20] ?? 0) * 0.2; // full-width
    annoyanceScore += (f[21] ?? 0) * 0.2; // full-height

    // Content boost when no negative signals
    const hasAdKeywords = f.slice(32, 48).some((v) => (v ?? 0) > 0);
    const hasTrackingKeywords = f.slice(48, 64).some((v) => (v ?? 0) > 0);
    const isMedia = (f[28] ?? 0) > 0 || (f[29] ?? 0) > 0 || (f[31] ?? 0) > 0;
    const isPositioned = (f[9] ?? 0) > 0 || (f[10] ?? 0) > 0 || (f[11] ?? 0) > 0;
    if (!hasAdKeywords && !hasTrackingKeywords && !isMedia && !isPositioned) {
      contentScore += 0.6;
    }

    const scores = [contentScore, adScore, trackerScore, socialScore, annoyanceScore];
    const maxScore = Math.max(...scores);

    const probs = scores.map((s) => {
      const exp = Math.exp(s - maxScore);
      return exp / scores.reduce((sum, v) => sum + Math.exp(v - maxScore), 0);
    });

    return this.formatResult(probs);
  }
}

/**
 * Check whether a classification result should trigger blocking.
 * Content is never blocked regardless of confidence.
 */
export function shouldBlock(result: ClassificationResult): boolean {
  if (result.label === "content") return false;
  return result.confidence >= CONFIDENCE_THRESHOLDS[result.label];
}

/**
 * Heuristic-only classification without TensorFlow.js.
 * Suitable for content scripts where TF.js may be unavailable or too heavy.
 */
export function classifyHeuristic(features: DOMFeatures): ClassificationResult {
  const classifier = new SmartDOMClassifier();
  classifier["fallbackMode"] = true;
  return classifier.classify(features);
}
