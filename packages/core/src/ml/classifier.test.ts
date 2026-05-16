/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { SmartDOMClassifier, shouldBlock } from "./classifier.js";
import { extractFeatures } from "./dom-features.js";

describe("SmartDOMClassifier heuristic fallback", () => {
  it("classifies an iframe with ad keywords as ad", () => {
    const classifier = new SmartDOMClassifier();
    // Simulate initialization failure to force heuristic mode
    (classifier as unknown as Record<string, unknown>).fallbackMode = true;

    const el = document.createElement("div");
    el.className = "ad-banner sponsor";
    el.style.position = "fixed";
    el.style.zIndex = "9999";
    el.style.width = "728px";
    el.style.height = "90px";
    document.body.appendChild(el);

    const features = extractFeatures(el);
    const result = classifier.classify(features);

    document.body.removeChild(el);
    expect(result.label).toBe("ad");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("does not block content by default", () => {
    const classifier = new SmartDOMClassifier();
    (classifier as unknown as Record<string, unknown>).fallbackMode = true;

    const el = document.createElement("p");
    el.textContent = "Hello world";
    el.style.width = "200px";
    document.body.appendChild(el);

    const features = extractFeatures(el);
    const result = classifier.classify(features);

    document.body.removeChild(el);
    expect(result.label).toBe("content");
    expect(shouldBlock(result)).toBe(false);
  });

  it("batch classifies multiple elements", () => {
    const classifier = new SmartDOMClassifier();
    (classifier as unknown as Record<string, unknown>).fallbackMode = true;

    const els = [
      document.createElement("div"),
      document.createElement("iframe"),
      document.createElement("p"),
    ];
    els[0].className = "ad-container";
    els[1].className = "tracker-pixel";
    els.forEach((e) => document.body.appendChild(e));

    const features = els.map(extractFeatures);
    const results = classifier.classifyBatch(features);

    els.forEach((e) => document.body.removeChild(e));
    expect(results).toHaveLength(3);
    expect(results[0].label).toBe("ad");
    expect(results[1].label).toBe("tracker");
    expect(results[2].label).toBe("content");
  });
});
