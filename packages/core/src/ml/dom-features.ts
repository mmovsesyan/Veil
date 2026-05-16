/**
 * DOM Feature Extractor for Smart DOM Classifier
 *
 * Extracts a fixed-size feature vector from any DOM Element for ML classification.
 * Features include: geometry, CSS, class-name embeddings, and neighbor statistics.
 */

export interface DOMFeatures {
  /** 64-dimensional float32 vector ready for TF.js */
  vector: Float32Array;
  /** Human-readable labels for debugging */
  labels: string[];
}

const FEATURE_DIM = 64;

// Common ad-related CSS class keywords (one-hot encoded into features 32-47)
const AD_KEYWORDS = [
  "ad", "ads", "advert", "banner", "sponsor", "promo", "popup",
  "modal", "overlay", "interstitial", "prebid", "dfp", "gpt",
  "outbrain", "taboola", "criteo", "revcontent", "mgid",
];

// Tracking / social keywords (one-hot encoded into features 48-63)
const TRACKING_KEYWORDS = [
  "track", "pixel", "beacon", "analytics", "social", "share",
  "facebook", "twitter", "linkedin", "instagram", "youtube",
  "widget", "follow", "like", "comment",
];

/**
 * Extract a feature vector from a DOM element.
 * This is called from the content script on every suspicious element.
 */
export function extractFeatures(el: Element): DOMFeatures {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const parent = el.parentElement;
  const parentRect = parent?.getBoundingClientRect();

  const f = new Float32Array(FEATURE_DIM);
  let idx = 0;

  // ── Geometry (0-11) ──────────────────────────────────────────────────────────
  f[idx++] = Math.min(rect.width / 1920, 1.0); // normalized width
  f[idx++] = Math.min(rect.height / 1080, 1.0); // normalized height
  f[idx++] = Math.min((rect.width * rect.height) / (1920 * 1080), 1.0); // area
  f[idx++] = rect.top < 100 ? 1.0 : 0.0; // near top (sticky header ads)
  f[idx++] = rect.bottom > window.innerHeight - 100 ? 1.0 : 0.0; // near bottom
  f[idx++] = rect.left < 50 ? 1.0 : 0.0; // left edge
  f[idx++] = rect.right > window.innerWidth - 50 ? 1.0 : 0.0; // right edge
  f[idx++] = rect.width > window.innerWidth * 0.8 ? 1.0 : 0.0; // full-width
  f[idx++] = rect.height > window.innerHeight * 0.8 ? 1.0 : 0.0; // full-height
  f[idx++] = style.position === "fixed" ? 1.0 : 0.0;
  f[idx++] = style.position === "sticky" ? 1.0 : 0.0;
  f[idx++] = style.position === "absolute" ? 1.0 : 0.0;

  // ── Z-index & visibility (12-15) ────────────────────────────────────────────
  const zIndex = parseInt(style.zIndex, 10);
  f[idx++] = Number.isFinite(zIndex) ? Math.min(zIndex / 10000, 1.0) : 0.0;
  f[idx++] = style.display === "none" ? 1.0 : 0.0;
  f[idx++] = style.visibility === "hidden" ? 1.0 : 0.0;
  f[idx++] = style.opacity === "0" ? 1.0 : 0.0;

  // ── Aspect ratio (16-19) ────────────────────────────────────────────────────
  const aspect = rect.width / (rect.height || 1);
  f[idx++] = aspect > 5 ? 1.0 : 0.0; // very wide (banner)
  f[idx++] = aspect < 0.3 ? 1.0 : 0.0; // very tall (skyscraper)
  f[idx++] = aspect > 1.5 && aspect < 3.5 ? 1.0 : 0.0; // standard banner ratio
  f[idx++] = aspect > 0.5 && aspect < 1.5 ? 1.0 : 0.0; // square-ish

  // ── Parent context (20-23) ────────────────────────────────────────────────
  f[idx++] = parent ? (parent.children.length > 20 ? 1.0 : parent.children.length / 20) : 0.0;
  f[idx++] = parentRect ? Math.min(parentRect.width / 1920, 1.0) : 0.0;
  f[idx++] = parentRect ? Math.min(parentRect.height / 1080, 1.0) : 0.0;
  f[idx++] = parent ? (parent.tagName === "IFRAME" ? 1.0 : 0.0) : 0.0;

  // ── Sibling stats (24-27) ───────────────────────────────────────────────────
  const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
  const siblingAreas = siblings.map((s) => {
    const r = s.getBoundingClientRect();
    return r.width * r.height;
  });
  const ownArea = rect.width * rect.height;
  f[idx++] = siblings.length > 0 ? Math.min(siblings.length / 50, 1.0) : 0.0;
  f[idx++] = siblingAreas.length > 0
    ? Math.min(ownArea / (siblingAreas.reduce((a, b) => a + b, 0) / siblings.length || 1), 2.0) / 2.0
    : 0.0;
  f[idx++] = siblings.filter((s) => s.tagName === "IMG" || s.tagName === "IFRAME").length / Math.max(siblings.length, 1);
  f[idx++] = siblings.filter((s) => s.tagName === "A").length / Math.max(siblings.length, 1);

  // ── Content signals (28-31) ────────────────────────────────────────────────
  f[idx++] = el.tagName === "IFRAME" ? 1.0 : 0.0;
  f[idx++] = el.tagName === "IMG" ? 1.0 : 0.0;
  f[idx++] = el.tagName === "DIV" ? 1.0 : 0.0;
  f[idx++] = el.querySelectorAll("img, iframe, video").length > 0 ? 1.0 : 0.0;

  // ── Class-name keyword embeddings (32-47) ──────────────────────────────────
  const classText = (el.className || "").toLowerCase();
  for (let k = 0; k < 16; k++) {
    const kw = AD_KEYWORDS[k];
    f[idx++] = kw && classText.includes(kw) ? 1.0 : 0.0;
  }

  // ── Tracking keyword embeddings (48-63) ────────────────────────────────────
  for (let k = 0; k < 16; k++) {
    const kw = TRACKING_KEYWORDS[k];
    f[idx++] = kw && classText.includes(kw) ? 1.0 : 0.0;
  }

  const labels = [
    "norm-width", "norm-height", "norm-area", "top-edge", "bottom-edge",
    "left-edge", "right-edge", "full-width", "full-height", "fixed",
    "sticky", "absolute", "z-index", "display-none", "visibility-hidden",
    "opacity-zero", "wide-aspect", "tall-aspect", "banner-ratio", "square-ratio",
    "sibling-count", "parent-width", "parent-height", "parent-iframe",
    "sibling-count", "relative-area", "img-iframe-ratio", "link-ratio",
    "is-iframe", "is-img", "is-div", "has-media",
    ...AD_KEYWORDS.slice(0, 16),
    ...TRACKING_KEYWORDS.slice(0, 16),
  ];

  return { vector: f, labels };
}
