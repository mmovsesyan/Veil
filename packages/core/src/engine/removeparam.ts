/**
 * $removeparam implementation.
 * Removes tracking parameters from URLs without blocking the request.
 * 
 * Examples:
 *   ||example.com^$removeparam=utm_source
 *   ||example.com^$removeparam=fbclid
 *   *$removeparam=/^utm_/
 */

// Common tracking parameters to remove by default
export const DEFAULT_TRACKING_PARAMS = [
  // Google Analytics / Ads
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",

  // Facebook
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "fb_ref",

  // Microsoft / Bing
  "msclkid",

  // Yandex
  "yclid",
  "ymclid",
  "_openstat",

  // Mailchimp
  "mc_cid",
  "mc_eid",

  // HubSpot
  "hsa_cam",
  "hsa_grp",
  "hsa_mt",
  "hsa_src",
  "hsa_ad",
  "hsa_acc",
  "hsa_net",
  "hsa_ver",
  "hsa_la",
  "hsa_ol",
  "hsa_kw",
  "hsa_tgt",

  // General tracking
  "ref",
  "referrer",
  "clickid",
  "click_id",
  "trk",
  "tracking",
  "source",
  "campaign_id",
  "ad_id",
];

export interface RemoveParamRule {
  /** URL pattern to match (empty = all URLs) */
  urlPattern: string;
  /** Parameter name or regex pattern to remove */
  param: string;
  /** Whether param is a regex */
  isRegex: boolean;
}

/**
 * Parse a $removeparam modifier value.
 */
export function parseRemoveParam(value: string): RemoveParamRule {
  const isRegex = value.startsWith("/") && value.endsWith("/");
  const param = isRegex ? value.slice(1, -1) : value;

  return {
    urlPattern: "",
    param,
    isRegex,
  };
}

/**
 * Remove matching parameters from a URL.
 * Returns the cleaned URL or null if no changes were made.
 */
export function removeParams(url: string, rules: RemoveParamRule[]): string | null {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return null;
  }

  if (!urlObj.search) return null;

  const params = new URLSearchParams(urlObj.search);
  let modified = false;

  for (const rule of rules) {
    if (rule.isRegex) {
      const regex = new RegExp(rule.param);
      const toDelete: string[] = [];
      for (const key of params.keys()) {
        if (regex.test(key)) {
          toDelete.push(key);
        }
      }
      for (const key of toDelete) {
        params.delete(key);
        modified = true;
      }
    } else {
      if (params.has(rule.param)) {
        params.delete(rule.param);
        modified = true;
      }
    }
  }

  if (!modified) return null;

  urlObj.search = params.toString();
  return urlObj.toString();
}

/**
 * Remove all default tracking parameters from a URL.
 */
export function removeTrackingParams(url: string): string | null {
  const rules = DEFAULT_TRACKING_PARAMS.map((param) => ({
    urlPattern: "",
    param,
    isRegex: false,
  }));
  return removeParams(url, rules);
}
