/**
 * Automated site compatibility tester.
 * 
 * Runs in background to detect when blocking breaks sites.
 * Reports issues and auto-generates exception rules.
 * 
 * Detection methods:
 * 1. Console error monitoring — blocked scripts cause errors
 * 2. Layout shift detection — hidden elements cause CLS
 * 3. Functionality check — forms, buttons, navigation still work
 * 4. Anti-adblock detection — site shows "disable adblock" message
 */

export interface SiteIssue {
  domain: string;
  url: string;
  type: "broken-layout" | "broken-functionality" | "anti-adblock-wall" | "console-errors" | "false-positive";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  suggestedFix: string | null;
  timestamp: number;
  autoFixed: boolean;
}

/**
 * Anti-adblock detection patterns.
 * If these appear on a page, the site is showing an adblock wall.
 */
const ANTI_ADBLOCK_PATTERNS = [
  // English
  /ad\s*block/i,
  /disable.*ad\s*block/i,
  /turn\s*off.*ad\s*block/i,
  /whitelist.*this\s*site/i,
  /please\s*support.*disabling/i,
  /detected.*ad\s*block/i,

  // Russian
  /блокировщик.*рекламы/i,
  /отключите.*блокировщик/i,
  /обнаружен.*adblock/i,
  /пожалуйста.*отключите/i,

  // German
  /werbeblocker/i,
  /bitte.*deaktivieren/i,

  // French
  /bloqueur.*pub/i,
  /désactiv.*bloqueur/i,
];

/**
 * Patterns indicating broken functionality.
 */
const BROKEN_SITE_SIGNALS = [
  // JavaScript errors caused by blocked scripts
  "is not defined",
  "Cannot read properties of null",
  "Cannot read properties of undefined",
  "is not a function",
  "Failed to fetch",
  "NetworkError",
];

/**
 * Detect if a page is showing an anti-adblock wall.
 */
export function detectAntiAdblockWall(pageText: string): boolean {
  for (const pattern of ANTI_ADBLOCK_PATTERNS) {
    if (pattern.test(pageText)) return true;
  }
  return false;
}

/**
 * Detect if console errors indicate broken functionality due to blocking.
 */
export function detectBrokenByBlocking(errors: string[], blockedDomains: string[]): SiteIssue | null {
  for (const error of errors) {
    for (const signal of BROKEN_SITE_SIGNALS) {
      if (error.includes(signal)) {
        // Check if any blocked domain is referenced in the error
        for (const domain of blockedDomains) {
          if (error.includes(domain)) {
            return {
              domain: "",
              url: "",
              type: "broken-functionality",
              severity: "medium",
              description: `Blocked domain ${domain} caused error: ${error.slice(0, 100)}`,
              suggestedFix: `@@||${domain}^`,
              timestamp: Date.now(),
              autoFixed: false,
            };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Generate content script code for site compatibility monitoring.
 * Injected into pages to detect issues in real-time.
 */
export function getSiteMonitorCode(): string {
  return `
(function() {
  // Monitor console errors
  var errors = [];
  var origError = console.error;
  console.error = function() {
    errors.push(Array.from(arguments).join(" "));
    if (errors.length > 50) errors.shift();
    origError.apply(this, arguments);
  };

  // Monitor unhandled errors
  window.addEventListener("error", function(e) {
    errors.push(e.message + " at " + e.filename);
  });

  // Check for anti-adblock walls after page load
  window.addEventListener("load", function() {
    setTimeout(function() {
      var bodyText = document.body ? document.body.innerText : "";
      var patterns = ${JSON.stringify(ANTI_ADBLOCK_PATTERNS.map(r => r.source))};
      
      for (var i = 0; i < patterns.length; i++) {
        if (new RegExp(patterns[i], "i").test(bodyText)) {
          // Report anti-adblock wall
          try {
            chrome.runtime.sendMessage({
              type: "SITE_ISSUE",
              payload: {
                type: "anti-adblock-wall",
                domain: location.hostname,
                url: location.href,
                text: bodyText.slice(0, 200),
              }
            });
          } catch(e) {}
          break;
        }
      }

      // Report accumulated errors
      if (errors.length > 3) {
        try {
          chrome.runtime.sendMessage({
            type: "SITE_ISSUE",
            payload: {
              type: "console-errors",
              domain: location.hostname,
              url: location.href,
              errors: errors.slice(0, 10),
            }
          });
        } catch(e) {}
      }
    }, 3000);
  });
})();
`;
}

/**
 * Auto-fix strategies for common issues.
 */
export function generateAutoFix(issue: SiteIssue): string | null {
  switch (issue.type) {
    case "anti-adblock-wall":
      // Try scriptlet injection to bypass
      return `${issue.domain}#%#//scriptlet("prevent-adblock-modal")`;

    case "broken-functionality":
      // Create exception rule for the problematic domain
      return issue.suggestedFix;

    case "false-positive":
      // Whitelist the domain
      return `@@||${issue.domain}^`;

    default:
      return null;
  }
}

/**
 * Top 1000 sites to periodically test compatibility.
 * Subset focused on sites known to have anti-adblock.
 */
export const SITES_WITH_ANTI_ADBLOCK = [
  "forbes.com",
  "wired.com",
  "bild.de",
  "fandom.com",
  "businessinsider.com",
  "dailymail.co.uk",
  "ndtv.com",
  "weather.com",
  "accuweather.com",
  "msn.com",
  "hulu.com",
  "crunchyroll.com",
  "twitch.tv",
  "youtube.com",
  "spotify.com",
  "deezer.com",
  "lenta.ru",
  "rbc.ru",
  "ria.ru",
  "gazeta.ru",
  "mail.ru",
  "kinopoisk.ru",
  "pikabu.ru",
];
