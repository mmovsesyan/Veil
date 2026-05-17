/**
 * Lightweight heuristic classifier for content scripts.
 * Does NOT depend on TensorFlow.js — suitable for environments where
 * TF.js is unavailable or too heavy (e.g. browser content scripts).
 */

import type { DOMFeatures } from "./dom-features.js";

export type ClassificationLabel = "content" | "ad" | "tracker" | "social" | "annoyance";

export interface ClassificationResult {
  label: ClassificationLabel;
  confidence: number;
  probabilities: Record<ClassificationLabel, number>;
}

const LABELS: ClassificationLabel[] = ["content", "ad", "tracker", "social", "annoyance"];

const CONFIDENCE_THRESHOLDS: Record<ClassificationLabel, number> = {
  content: 0.0,
  ad: 0.85,
  tracker: 0.8,
  social: 0.85,
  annoyance: 0.9,
};

export function shouldBlock(result: ClassificationResult): boolean {
  if (result.label === "content") return false;
  return result.confidence >= CONFIDENCE_THRESHOLDS[result.label];
}

export function classifyHeuristic(features: DOMFeatures): ClassificationResult {
  const f = features.vector;

  let contentScore = 0.2;
  let adScore = 0;
  let trackerScore = 0;
  let socialScore = 0;
  let annoyanceScore = 0;

  adScore += (f[9] ?? 0) * 0.3;
  adScore += (f[10] ?? 0) * 0.2;
  adScore += (f[11] ?? 0) * 0.1;
  adScore += (f[17] ?? 0) * 0.15;
  adScore += (f[28] ?? 0) * 0.3;
  for (let i = 32; i < 48; i++) adScore += (f[i] ?? 0) * 0.4;

  trackerScore += (f[28] ?? 0) * 0.3;
  trackerScore += (f[16] ?? 0) * 0.2;
  trackerScore += (f[14] ?? 0) * 0.2;
  trackerScore += (f[15] ?? 0) * 0.2;
  for (let i = 48; i < 56; i++) trackerScore += (f[i] ?? 0) * 0.4;

  socialScore += (f[29] ?? 0) * 0.2;
  for (let i = 56; i < 64; i++) socialScore += (f[i] ?? 0) * 0.5;

  annoyanceScore += (f[9] ?? 0) * 0.3;
  annoyanceScore += (f[12] ?? 0) * 0.3;
  annoyanceScore += (f[20] ?? 0) * 0.2;
  annoyanceScore += (f[21] ?? 0) * 0.2;

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

  const maxIdx = probs.indexOf(Math.max(...probs));
  const label = LABELS[maxIdx]!;
  const confidence = probs[maxIdx] ?? 0;

  const probabilities = {} as Record<ClassificationLabel, number>;
  LABELS.forEach((l, i) => (probabilities[l] = Math.round((probs[i] ?? 0) * 1000) / 1000));

  return { label, confidence, probabilities };
}
