/**
 * Auto-discovery and addition of new blocking rules.
 *
 * Three mechanisms:
 * 1. Heuristic detection — analyze page requests and detect ad/tracker patterns
 * 2. Community reports — users report missed ads, system generates rules
 * 3. Remote rule feed — subscribe to auto-updated rule sources
 *
 * This is what makes the blocker self-improving over time.
 */

import { createLogger } from "../logger.js";

const logger = createLogger("auto-rules");

export interface DetectedPattern {
  url: string;
  domain: string;
  type: "ad" | "tracker" | "social" | "annoyance";
  confidence: number; // 0-1
  reason: string;
  suggestedRule: string;
  timestamp: number;
}

export interface CommunityReport {
  pageUrl: string;
  elementSelector?: string;
  requestUrl?: string;
  type: "missed-ad" | "broken-site" | "false-positive";
  timestamp: number;
  deviceId: string;
}

// ─── Heuristic Detection ──────────────────────────────────────────────────────

/**
 * Known ad/tracker URL patterns for heuristic detection.
 * These are signals that a request is likely an ad or tracker.
 */
const AD_SIGNALS = [
  // URL path patterns
  /\/ads?\//i,
  /\/adserv/i,
  /\/advert/i,
  /\/banner[s]?\//i,
  /\/sponsor/i,
  /\/promo[s]?\//i,
  /\/popup/i,
  /\/interstitial/i,
  /\/prebid/i,
  /\/dfp\//i,
  /\/gpt\//i,
];

const TRACKER_SIGNALS = [
  /\/track(er|ing)?\//i,
  /\/pixel[s]?[/?]/i,
  /\/beacon/i,
  /\/analytics/i,
  /\/telemetry/i,
  /\/collect\?/i,
  /\/event[s]?\?/i,
  /\/log[s]?\?/i,
  /\/__utm/i,
  /\/fingerprint/i,
];

const TRACKER_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid",
  "msclkid", "yclid", "click_id", "tracking_id", "ref_src",
];

/**
 * Known ad network domains (partial list for heuristic boosting).
 */
const AD_NETWORK_KEYWORDS = [
  "adsrv", "adserver", "adtech", "adnxs", "doubleclick",
  "googlesyndication", "googleadservices", "moatads", "outbrain",
  "taboola", "criteo", "pubmatic", "openx", "rubiconproject",
  "amazon-adsystem", "facebook.com/tr", "mc.yandex.ru",
];

/**
 * Analyze a network request and determine if it's likely an ad/tracker.
 * Returns a detection result with confidence score.
 */
export function analyzeRequest(
  url: string,
  type: string,
  initiatorDomain: string,
  targetDomain: string,
): DetectedPattern | null {
  const isThirdParty = initiatorDomain !== targetDomain;
  let confidence = 0;
  let detectedType: "ad" | "tracker" = "ad";
  const reasons: string[] = [];

  // Check ad signals in URL
  for (const signal of AD_SIGNALS) {
    if (signal.test(url)) {
      confidence += 0.3;
      reasons.push(`URL matches ad pattern: ${signal.source}`);
      break;
    }
  }

  // Check tracker signals
  for (const signal of TRACKER_SIGNALS) {
    if (signal.test(url)) {
      confidence += 0.3;
      detectedType = "tracker";
      reasons.push(`URL matches tracker pattern: ${signal.source}`);
      break;
    }
  }

  // Check ad network keywords in domain
  for (const keyword of AD_NETWORK_KEYWORDS) {
    if (url.toLowerCase().includes(keyword)) {
      confidence += 0.4;
      reasons.push(`Known ad network: ${keyword}`);
      break;
    }
  }

  // Third-party boost
  if (isThirdParty) {
    confidence += 0.1;
    reasons.push("Third-party request");
  }

  // Resource type boost
  if (type === "script" && isThirdParty) {
    confidence += 0.1;
    reasons.push("Third-party script");
  }
  if (type === "image" && (url.includes("pixel") || url.includes("1x1") || url.includes("beacon"))) {
    confidence += 0.2;
    detectedType = "tracker";
    reasons.push("Tracking pixel pattern");
  }

  // Check tracking params in URL
  try {
    const urlObj = new URL(url);
    for (const param of TRACKER_PARAMS) {
      if (urlObj.searchParams.has(param)) {
        confidence += 0.1;
        detectedType = "tracker";
        reasons.push(`Tracking param: ${param}`);
      }
    }
  } catch {
    // Invalid URL
  }

  // Minimum confidence threshold
  if (confidence < 0.4) return null;

  // Cap at 1.0
  confidence = Math.min(confidence, 1.0);

  // Generate suggested rule
  const suggestedRule = generateRule(url, targetDomain, isThirdParty);

  return {
    url,
    domain: targetDomain,
    type: detectedType,
    confidence,
    reason: reasons.join("; "),
    suggestedRule,
    timestamp: Date.now(),
  };
}

/**
 * Generate a blocking rule from a detected pattern.
 */
function generateRule(url: string, targetDomain: string, isThirdParty: boolean): string {
  // Prefer domain-level rule if the whole domain is an ad network
  for (const keyword of AD_NETWORK_KEYWORDS) {
    if (targetDomain.includes(keyword)) {
      const modifier = isThirdParty ? "$third-party" : "";
      return `||${targetDomain}^${modifier}`;
    }
  }

  // Otherwise, use path-based rule
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // If path is short and specific, use it
    if (path.length > 3 && path.length < 50) {
      return `||${targetDomain}${path}^`;
    }
  } catch {
    // Fallback
  }

  return `||${targetDomain}^`;
}

// ─── Auto-Learning Engine ─────────────────────────────────────────────────────

export class AutoRulesEngine {
  private detectedPatterns: DetectedPattern[] = [];
  private confirmedRules = new Set<string>();
  private rejectedRules = new Set<string>();
  private maxPatterns = 1000;
  private confirmThreshold = 5; // Need 5 detections to auto-confirm (was 3 — too aggressive)

  // Minimum confidence for auto-confirmation
  private confirmConfidence = 0.6;

  // Maximum auto-learned rules to prevent unbounded growth
  private maxConfirmedRules = 200;

  /**
   * Process a request and potentially detect a new rule.
   */
  processRequest(
    url: string,
    type: string,
    initiatorDomain: string,
    targetDomain: string,
    wasBlocked: boolean,
  ): DetectedPattern | null {
    // Only analyze requests that weren't already blocked
    if (wasBlocked) return null;

    const detection = analyzeRequest(url, type, initiatorDomain, targetDomain);
    if (!detection) return null;

    // Check if we already have this rule
    if (this.confirmedRules.has(detection.suggestedRule)) return null;

    // Add to detected patterns
    this.detectedPatterns.push(detection);

    // Trim old patterns
    if (this.detectedPatterns.length > this.maxPatterns) {
      this.detectedPatterns = this.detectedPatterns.slice(-this.maxPatterns);
    }

    // Check if this pattern has been seen enough times to auto-confirm
    const sameRule = this.detectedPatterns.filter(
      (p) => p.suggestedRule === detection.suggestedRule
    );

    if (sameRule.length >= this.confirmThreshold && detection.confidence >= this.confirmConfidence) {
      // Safety: don't exceed max auto-learned rules
      if (this.confirmedRules.size >= this.maxConfirmedRules) {
        return null;
      }
      // Safety: don't confirm rules that were previously rejected
      if (this.rejectedRules.has(detection.suggestedRule)) {
        return null;
      }
      this.confirmedRules.add(detection.suggestedRule);
      return detection;
    }

    return null;
  }

  /**
   * Get all auto-confirmed rules ready to be added.
   */
  getConfirmedRules(): string[] {
    return Array.from(this.confirmedRules);
  }

  /**
   * Get pending detections (not yet confirmed).
   */
  getPendingDetections(): DetectedPattern[] {
    return this.detectedPatterns.filter(
      (p) => !this.confirmedRules.has(p.suggestedRule)
    );
  }

  /**
   * Manually confirm a detected pattern.
   */
  confirmRule(rule: string): void {
    this.confirmedRules.add(rule);
  }

  /**
   * Reject a detection (false positive).
   * Permanently blacklists the rule so it won't be auto-confirmed again.
   */
  rejectRule(rule: string): void {
    this.detectedPatterns = this.detectedPatterns.filter(
      (p) => p.suggestedRule !== rule
    );
    this.confirmedRules.delete(rule);
    this.rejectedRules.add(rule);
  }

  /**
   * Rollback: remove a confirmed rule (undo auto-learning).
   */
  rollbackRule(rule: string): void {
    this.confirmedRules.delete(rule);
    this.rejectedRules.add(rule);
  }

  /**
   * Export confirmed rules as filter list text.
   */
  exportAsFilterList(): string {
    const header = [
      "! Title: Auto-detected rules",
      `! Last modified: ${new Date().toISOString()}`,
      `! Total rules: ${this.confirmedRules.size}`,
      "",
    ];
    return [...header, ...this.confirmedRules].join("\n");
  }

  /**
   * Get statistics about auto-detection.
   */
  getStats(): {
    totalDetections: number;
    confirmedRules: number;
    pendingDetections: number;
    topDomains: { domain: string; count: number }[];
  } {
    const domainCounts: Record<string, number> = {};
    for (const p of this.detectedPatterns) {
      domainCounts[p.domain] = (domainCounts[p.domain] ?? 0) + 1;
    }

    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    return {
      totalDetections: this.detectedPatterns.length,
      confirmedRules: this.confirmedRules.size,
      pendingDetections: this.detectedPatterns.filter(
        (p) => !this.confirmedRules.has(p.suggestedRule)
      ).length,
      topDomains,
    };
  }
}

// ─── Remote Rule Feed ─────────────────────────────────────────────────────────

export interface RuleFeedConfig {
  url: string;
  updateInterval: number; // hours
  enabled: boolean;
  /** Base64-encoded Ed25519 public key for signature verification */
  publicKey?: string;
}

/**
 * Default community rule feeds.
 */
export const DEFAULT_RULE_FEEDS: RuleFeedConfig[] = [
  {
    url: "https://raw.githubusercontent.com/nickspaargaren/no-google/master/pihole-google.txt",
    updateInterval: 24,
    enabled: false,
  },
  {
    url: "https://raw.githubusercontent.com/nickspaargaren/pihole-google/master/categories/analytics.txt",
    updateInterval: 24,
    enabled: false,
  },
];

/**
 * Fetch and parse a remote rule feed.
 * If a publicKey is configured, requires a valid Ed25519 signature
 * in the X-Veil-Signature response header.
 */
export async function fetchRuleFeed(config: RuleFeedConfig): Promise<string[]> {
  if (!config.enabled) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(config.url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const text = await response.text();

    // Signature verification (optional but recommended for remote feeds)
    if (config.publicKey) {
      const signature = response.headers.get("X-Veil-Signature");
      if (!signature) {
        logger.warn("Feed missing signature", { url: config.url });
        return [];
      }
      const { verifyFeedSignature } = await import("./signature-verifier.js");
      const valid = await verifyFeedSignature(text, signature, config.publicKey);
      if (!valid) {
        logger.warn("Feed signature invalid", { url: config.url });
        return [];
      }
    }

    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
  } catch {
    return [];
  }
}
