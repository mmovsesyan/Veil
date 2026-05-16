/**
 * AdBlock pattern compiler.
 *
 * Converts ABP/uBlock Origin filter patterns into optimised RegExp objects.
 * Handles anchors (|, ||), wildcards (*), separators (^) and literal text.
 *
 * Reference:
 *   https://help.adblockplus.org/hc/en-us/articles/360062733293-How-to-write-filters
 */

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(str: string): string {
  return str.replace(REGEX_SPECIAL, "\\$&");
}

/**
 * Compile an AdBlock pattern into a case-insensitive RegExp.
 *
 * Supported syntax:
 *   ||domain/path  – domain anchor
 *   |http://…      – start anchor
 *   …|             – end anchor
 *   *              – any sequence of characters
 *   ^              – separator (non-alphanumeric + not _ - . %)
 */
export function compileAdBlockPattern(pattern: string): RegExp {
  let regex = "";
  let i = 0;
  let isDomainAnchor = false;

  // ── Anchors ───────────────────────────────────────────────────────────
  if (pattern.startsWith("||")) {
    isDomainAnchor = true;
    regex += "^[\\w-]+:\\/\\/(?:[^\\/]*\\.)?";
    i = 2;
  } else if (pattern.startsWith("|")) {
    regex += "^";
    i = 1;
  }

  const endAnchor = pattern.endsWith("|") && !pattern.endsWith("||");
  const len = endAnchor ? pattern.length - 1 : pattern.length;

  // ── Domain anchor body ────────────────────────────────────────────────
  if (isDomainAnchor) {
    // Extract domain part (up to first ^ or end)
    let domainEnd = len;
    let hasSeparator = false;
    for (let k = i; k < len; k++) {
      if (pattern[k] === "^") {
        domainEnd = k;
        hasSeparator = true;
        break;
      }
      if (pattern[k] === "*") {
        domainEnd = k;
        break;
      }
    }

    const domain = pattern.slice(i, domainEnd);
    regex += escapeRegExp(domain);

    if (hasSeparator) {
      // ^ after domain acts as a zero-width boundary before path
      regex += "(?=[\\/\\?:=&]|$)";
      i = domainEnd + 1;
    } else {
      // No separator and no wildcard — domain-only rule
      regex += "(?=[\\/\\?:=&]|$)";
      i = len;
    }
  }

  // ── Remaining body ──────────────────────────────────────────────────────
  while (i < len) {
    const c = pattern[i];
    if (!c) break;
    if (c === "*") {
      regex += ".*";
      i++;
    } else if (c === "^") {
      // Separator: anything that is NOT [a-zA-Z0-9_-.%] or end of string
      regex += "(?:[^a-zA-Z0-9_\\-.%]|$)";
      i++;
    } else {
      regex += escapeRegExp(c);
      i++;
    }
  }

  if (endAnchor) {
    regex += "$";
  }

  return new RegExp(regex, "i");
}

/**
 * Check whether a URL matches an AdBlock pattern.
 */
export function matchAdBlockPattern(pattern: string, url: string): boolean {
  if (pattern === "*") return true;

  const re = compileAdBlockPattern(pattern);
  return re.test(url);
}
