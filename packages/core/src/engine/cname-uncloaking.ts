/**
 * CNAME Uncloaking — detect trackers hiding behind first-party CNAME records.
 * 
 * Problem: Trackers like tracker.example.com CNAME to real-tracker.com.
 * The browser sees it as first-party, bypassing third-party blocking.
 * 
 * Solution:
 * - Firefox: Use dns.resolve() API to check CNAME records
 * - Chrome: Use a pre-built list of known CNAME cloaks (no DNS API available)
 * 
 * Known CNAME trackers database sourced from:
 * - https://github.com/nickspaargaren/no-google (CNAME trackers)
 * - https://github.com/nickspaargaren/pihole-google (CNAME trackers)
 * - AdGuard CNAME tracker list
 */

/**
 * Known CNAME cloaking domains.
 * Maps first-party subdomain patterns to their real tracker domains.
 */
export const KNOWN_CNAME_CLOAKS: Record<string, string> = {
  // Adobe / Omniture
  "metrics.": "omtrdc.net",
  "smetrics.": "omtrdc.net",
  "sstats.": "omtrdc.net",

  // Eulerian
  "eulerian.": "eulerian.net",
  "ea.": "eulerian.net",

  // Criteo
  "dis.": "criteo.com",
  "gum.": "criteo.com",

  // Oracle / BlueKai
  "tags.": "bluekai.com",

  // Pardot / Salesforce
  "go.": "pardot.com",
  "pi.": "pardot.com",

  // AT Internet
  "xiti.": "at-internet.com",

  // Keyade
  "k.": "keyade.com",

  // Ingenious Technologies
  "t.": "ingenious-technologies.com",

  // Webtrekk / Mapp
  "wt-eu02.": "webtrekk.net",

  // TraceDock
  "trace.": "tracedock.com",
};

/**
 * Extended list of known tracker CNAME targets.
 * If a CNAME resolves to any of these, it's a tracker.
 */
export const TRACKER_CNAME_TARGETS = new Set([
  "omtrdc.net",
  "adobedc.net",
  "demdex.net",
  "eulerian.net",
  "criteo.com",
  "criteo.net",
  "dnsdelegation.io",
  "bluekai.com",
  "pardot.com",
  "at-internet.com",
  "keyade.com",
  "tracedock.com",
  "webtrekk.net",
  "ingenious-technologies.com",
  "affex.org",
  "intentmedia.net",
  "commanders.com",
  "exactag.com",
  "wt-eu02.net",
  "oghub.io",
  "storetail.io",
]);

export interface CNAMEResult {
  originalHostname: string;
  resolvedHostname: string;
  isTracker: boolean;
}

/**
 * Check if a hostname is a known CNAME cloak (without DNS lookup).
 * Used in Chrome where DNS API is not available.
 */
export function checkKnownCNAMECloak(hostname: string): CNAMEResult | null {
  const lower = hostname.toLowerCase();

  for (const [prefix, target] of Object.entries(KNOWN_CNAME_CLOAKS)) {
    if (lower.startsWith(prefix) || lower.includes(`.${prefix.slice(0, -1)}.`)) {
      return {
        originalHostname: hostname,
        resolvedHostname: target,
        isTracker: true,
      };
    }
  }

  return null;
}

/**
 * Firefox-specific: resolve CNAME and check against tracker list.
 * Returns the real hostname if it's a tracker, null otherwise.
 * 
 * Usage in Firefox background script:
 *   const result = await resolveCNAME(hostname);
 *   if (result?.isTracker) { block the request }
 */
export async function resolveCNAME(hostname: string): Promise<CNAMEResult | null> {
  // This function is meant to be called in Firefox where browser.dns is available
  if (typeof globalThis === "undefined") return null;

  try {
    // @ts-expect-error — browser.dns is Firefox-specific
    const dnsResult = await browser.dns.resolve(hostname, ["canonical_name"]);

    if (dnsResult.canonicalName && dnsResult.canonicalName !== hostname) {
      const resolved = dnsResult.canonicalName.toLowerCase();

      // Check if resolved hostname is a known tracker
      for (const target of TRACKER_CNAME_TARGETS) {
        if (resolved === target || resolved.endsWith(`.${target}`)) {
          return {
            originalHostname: hostname,
            resolvedHostname: resolved,
            isTracker: true,
          };
        }
      }

      return {
        originalHostname: hostname,
        resolvedHostname: resolved,
        isTracker: false,
      };
    }
  } catch {
    // DNS resolution failed — not a problem
  }

  return null;
}

/**
 * Check if a hostname's parent domain is in the tracker CNAME targets.
 */
export function isTrackerCNAMETarget(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  for (const target of TRACKER_CNAME_TARGETS) {
    if (lower === target || lower.endsWith(`.${target}`)) {
      return true;
    }
  }
  return false;
}
