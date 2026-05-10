/**
 * Token-based bucket matching engine.
 * 
 * This is the core algorithm used by uBlock Origin's SNFE (Static Network Filtering Engine).
 * 
 * How it works:
 * 1. Each rule is analyzed to extract a "token" — the longest static alphanumeric
 *    substring that must appear in any matching URL.
 * 2. Rules are stored in "buckets" keyed by their token.
 * 3. When matching a URL, we extract all tokens from the URL and only check
 *    rules in the corresponding buckets.
 * 
 * This reduces the number of rules checked per URL from N (total rules) to
 * typically 1-5 rules per token match, giving O(1) amortized performance.
 * 
 * Additional optimizations:
 * - Hostname-only rules use a separate hash set (O(1) lookup)
 * - Rules with no good token go into a "generic" bucket (checked for every URL)
 * - Bitmap-based resource type pre-filtering
 */

import type { Rule } from "../types/index.js";
import { RuleType } from "../types/index.js";

// Minimum token length to be useful for indexing
const MIN_TOKEN_LENGTH = 4;

// Special bucket for rules with no good token
const GENERIC_TOKEN = "";

export interface TokenBucket {
  token: string;
  ruleIds: number[];
}

/**
 * Extract the best token from a filter pattern.
 * The "best" token is the longest static alphanumeric substring.
 */
export function extractBestToken(pattern: string): string {
  // Remove anchors and special chars
  let cleaned = pattern;
  if (cleaned.startsWith("||")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("@@")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("|")) cleaned = cleaned.slice(1);
  if (cleaned.endsWith("|")) cleaned = cleaned.slice(0, -1);

  // Split by non-alphanumeric (except dot and dash which are part of domains)
  const tokens = cleaned.split(/[^a-zA-Z0-9.-]+/).filter(Boolean);

  // Find the longest token that's good for indexing
  let best = "";
  for (const token of tokens) {
    // Skip very common tokens that would create huge buckets
    if (isCommonToken(token)) continue;
    if (token.length > best.length) {
      best = token;
    }
  }

  return best.length >= MIN_TOKEN_LENGTH ? best.toLowerCase() : GENERIC_TOKEN;
}

/**
 * Extract all tokens from a URL for matching.
 */
export function extractUrlTokens(url: string): string[] {
  const lower = url.toLowerCase();
  const tokens: string[] = [];
  const seen = new Set<string>();

  // Extract alphanumeric sequences
  let start = -1;
  for (let i = 0; i <= lower.length; i++) {
    const c = i < lower.length ? lower.charCodeAt(i) : 0;
    const isAlphaNum = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 46 || c === 45;

    if (isAlphaNum) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        const token = lower.slice(start, i);
        if (token.length >= MIN_TOKEN_LENGTH && !seen.has(token)) {
          tokens.push(token);
          seen.add(token);
        }
        start = -1;
      }
    }
  }

  return tokens;
}

/**
 * Extract hostname from URL for hostname-only rule matching.
 */
export function extractHostname(url: string): string {
  const lower = url.toLowerCase();
  let start = lower.indexOf("://");
  if (start === -1) return "";
  start += 3;

  // Skip auth (user:pass@)
  const atSign = lower.indexOf("@", start);
  if (atSign !== -1 && atSign < lower.indexOf("/", start)) {
    start = atSign + 1;
  }

  let end = lower.indexOf("/", start);
  if (end === -1) end = lower.indexOf("?", start);
  if (end === -1) end = lower.indexOf("#", start);
  if (end === -1) end = lower.length;

  // Remove port
  const hostname = lower.slice(start, end);
  const colonIdx = hostname.lastIndexOf(":");
  if (colonIdx !== -1) {
    return hostname.slice(0, colonIdx);
  }

  return hostname;
}

/**
 * Check if a token is too common to be useful for indexing.
 */
function isCommonToken(token: string): boolean {
  const common = new Set([
    "http", "https", "www", "com", "net", "org", "html", "php",
    "asp", "aspx", "jsp", "json", "xml", "css", "png", "jpg",
    "gif", "svg", "ico", "woff", "woff2", "ttf", "eot",
  ]);
  return common.has(token.toLowerCase());
}

/**
 * Determine if a rule is a "hostname-only" rule.
 * These are rules like ||example.com^ that only match the hostname.
 */
export function isHostnameOnlyRule(rule: Rule): boolean {
  if (rule.type !== RuleType.NetworkBlock && rule.type !== RuleType.NetworkAllow) {
    return false;
  }

  const pattern = rule.pattern;
  if (!pattern.startsWith("||")) return false;

  const rest = pattern.slice(2);
  // Must end with ^ or nothing, and contain only hostname chars
  const cleaned = rest.replace(/\^$/, "");
  return /^[a-zA-Z0-9.-]+$/.test(cleaned);
}

/**
 * Extract hostname from a hostname-only rule pattern.
 */
export function extractRuleHostname(pattern: string): string {
  let cleaned = pattern;
  if (cleaned.startsWith("||")) cleaned = cleaned.slice(2);
  cleaned = cleaned.replace(/\^$/, "");
  return cleaned.toLowerCase();
}
