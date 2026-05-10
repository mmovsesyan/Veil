/**
 * HTML Filtering — remove elements from HTML response before rendering.
 * 
 * This is the most powerful filtering technique, available only in Firefox
 * via webRequest.filterResponseData().
 * 
 * In Chrome MV3, this is NOT possible. We use scriptlet injection as fallback.
 * 
 * Syntax:
 *   example.com$$script[tag-content="adblock"]
 *   example.com$$div[id="ad-container"]
 * 
 * This removes matching elements from the raw HTML before the browser parses it.
 */

export interface HTMLFilterRule {
  domains: string[];
  tagName: string;
  attribute?: string;
  attributeValue?: string;
  contentMatch?: string;
}

/**
 * Parse an HTML filter rule.
 * Format: domain$$tag[attr="value"] or domain$$tag[tag-content="match"]
 */
export function parseHTMLFilterRule(raw: string): HTMLFilterRule | null {
  const sepIdx = raw.indexOf("$$");
  if (sepIdx === -1) return null;

  const domainPart = raw.slice(0, sepIdx);
  const filterPart = raw.slice(sepIdx + 2);

  const domains = domainPart.split(",").map((d) => d.trim()).filter(Boolean);

  // Parse tag[attr="value"]
  const tagMatch = filterPart.match(/^(\w+)(?:\[([^\]]+)\])?$/);
  if (!tagMatch) return null;

  const tagName = tagMatch[1]!;
  const attrPart = tagMatch[2];

  if (!attrPart) {
    return { domains, tagName };
  }

  // Parse attribute condition
  const attrMatch = attrPart.match(/^([\w-]+)="([^"]*)"$/);
  if (!attrMatch) return null;

  const attrName = attrMatch[1]!;
  const attrValue = attrMatch[2]!;

  if (attrName === "tag-content") {
    return { domains, tagName, contentMatch: attrValue };
  }

  return { domains, tagName, attribute: attrName, attributeValue: attrValue };
}

/**
 * Apply HTML filter rules to raw HTML content.
 * Removes matching elements from the HTML string.
 * 
 * This is a simplified implementation — production would use a streaming parser.
 */
export function applyHTMLFilters(html: string, rules: HTMLFilterRule[], domain: string): string {
  let result = html;

  for (const rule of rules) {
    // Check domain match
    if (rule.domains.length > 0 && !rule.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      continue;
    }

    if (rule.contentMatch) {
      // Remove tags containing specific content
      result = removeTagsByContent(result, rule.tagName, rule.contentMatch);
    } else if (rule.attribute && rule.attributeValue) {
      // Remove tags with specific attribute
      result = removeTagsByAttribute(result, rule.tagName, rule.attribute, rule.attributeValue);
    } else {
      // Remove all tags of this type (dangerous — rarely used)
      // Skip for safety
    }
  }

  return result;
}

/**
 * Remove HTML tags that contain specific text content.
 */
function removeTagsByContent(html: string, tagName: string, content: string): string {
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let result = html;
  let searchFrom = 0;

  while (true) {
    const start = result.toLowerCase().indexOf(openTag.toLowerCase(), searchFrom);
    if (start === -1) break;

    const end = result.toLowerCase().indexOf(closeTag.toLowerCase(), start);
    if (end === -1) break;

    const fullEnd = end + closeTag.length;
    const segment = result.slice(start, fullEnd);

    if (segment.includes(content)) {
      result = result.slice(0, start) + result.slice(fullEnd);
      // Don't advance searchFrom — next element might be at same position
    } else {
      searchFrom = fullEnd;
    }
  }

  return result;
}

/**
 * Remove HTML tags with a specific attribute value.
 */
function removeTagsByAttribute(html: string, tagName: string, attr: string, value: string): string {
  // Build regex to match the opening tag with the attribute
  const pattern = new RegExp(
    `<${tagName}[^>]*\\s${attr}\\s*=\\s*["']${escapeRegex(value)}["'][^>]*>`,
    "gi"
  );

  let result = html;
  let match: RegExpExecArray | null;

  // Find and remove each matching element
  while ((match = pattern.exec(result)) !== null) {
    const start = match.index;
    const closeTag = `</${tagName}>`;
    const end = result.toLowerCase().indexOf(closeTag.toLowerCase(), start);

    if (end !== -1) {
      const fullEnd = end + closeTag.length;
      result = result.slice(0, start) + result.slice(fullEnd);
      pattern.lastIndex = start; // Reset regex position
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Firefox-specific: Create a StreamFilter to modify HTML responses.
 * Returns the filter setup code for use in webRequest.onBeforeRequest.
 */
export function createStreamFilterCode(rules: HTMLFilterRule[]): string {
  // This generates code that would be used in Firefox's background script
  // with browser.webRequest.filterResponseData()
  return `
// HTML Filtering via StreamFilter (Firefox only)
function setupHTMLFilter(requestId, domain) {
  var filter = browser.webRequest.filterResponseData(requestId);
  var decoder = new TextDecoder("utf-8");
  var encoder = new TextEncoder();
  var data = [];

  filter.ondata = function(event) {
    data.push(decoder.decode(event.data, { stream: true }));
  };

  filter.onstop = function() {
    var html = data.join("");
    var rules = ${JSON.stringify(rules)};
    
    for (var rule of rules) {
      if (rule.domains.length > 0 && !rule.domains.some(d => domain === d || domain.endsWith("." + d))) continue;
      if (rule.contentMatch) {
        html = removeByContent(html, rule.tagName, rule.contentMatch);
      } else if (rule.attribute) {
        html = removeByAttr(html, rule.tagName, rule.attribute, rule.attributeValue);
      }
    }

    filter.write(encoder.encode(html));
    filter.close();
  };
}
`;
}
