/**
 * $csp and $permissions modifier implementation.
 * 
 * Injects Content-Security-Policy and Permissions-Policy headers
 * to restrict page capabilities (inline scripts, camera, geolocation, etc.)
 * 
 * Usage in filter rules:
 *   ||example.com^$csp=script-src 'self'
 *   ||example.com^$permissions=camera=(),microphone=()
 */

export interface CSPRule {
  urlPattern: string;
  directive: string; // e.g., "script-src 'self'" or "worker-src 'none'"
  domains?: { include?: string[]; exclude?: string[] };
}

export interface PermissionsPolicyRule {
  urlPattern: string;
  policy: string; // e.g., "camera=()", "microphone=()"
  domains?: { include?: string[]; exclude?: string[] };
}

/**
 * Parse a $csp modifier value from a filter rule.
 */
export function parseCSPModifier(rulePattern: string, cspValue: string): CSPRule {
  return {
    urlPattern: rulePattern,
    directive: cspValue,
  };
}

/**
 * Parse a $permissions modifier value.
 */
export function parsePermissionsModifier(rulePattern: string, value: string): PermissionsPolicyRule {
  return {
    urlPattern: rulePattern,
    policy: value,
  };
}

/**
 * Compile CSP rules into Chrome declarativeNetRequest modifyHeaders format.
 */
export function compileCSPToDNR(rules: CSPRule[]): {
  id: number;
  priority: number;
  action: { type: "modifyHeaders"; responseHeaders: { header: string; operation: string; value: string }[] };
  condition: { urlFilter: string; resourceTypes: string[] };
}[] {
  return rules.map((rule, i) => ({
    id: 900000 + i,
    priority: 1,
    action: {
      type: "modifyHeaders" as const,
      responseHeaders: [
        {
          header: "Content-Security-Policy",
          operation: "append",
          value: rule.directive,
        },
      ],
    },
    condition: {
      urlFilter: rule.urlPattern || "*",
      resourceTypes: ["main_frame", "sub_frame"],
    },
  }));
}

/**
 * Compile Permissions-Policy rules into DNR format.
 */
export function compilePermissionsToDNR(rules: PermissionsPolicyRule[]): {
  id: number;
  priority: number;
  action: { type: "modifyHeaders"; responseHeaders: { header: string; operation: string; value: string }[] };
  condition: { urlFilter: string; resourceTypes: string[] };
}[] {
  return rules.map((rule, i) => ({
    id: 950000 + i,
    priority: 1,
    action: {
      type: "modifyHeaders" as const,
      responseHeaders: [
        {
          header: "Permissions-Policy",
          operation: "set",
          value: rule.policy,
        },
      ],
    },
    condition: {
      urlFilter: rule.urlPattern || "*",
      resourceTypes: ["main_frame", "sub_frame"],
    },
  }));
}

/**
 * Default privacy-enhancing CSP directives.
 */
export const DEFAULT_CSP_RULES: CSPRule[] = [
  // Block inline scripts on known ad domains
  { urlPattern: "||doubleclick.net^", directive: "script-src 'none'" },
  { urlPattern: "||googlesyndication.com^", directive: "script-src 'none'" },
];

/**
 * Default Permissions-Policy restrictions.
 */
export const DEFAULT_PERMISSIONS_RULES: PermissionsPolicyRule[] = [
  // Restrict fingerprinting APIs on third-party frames
  { urlPattern: "*", policy: "interest-cohort=()" }, // Block FLoC/Topics
];

/**
 * For Firefox: generate header modification instructions for webRequest.
 */
export function generateFirefoxCSPHeaders(
  rules: CSPRule[],
  url: string,
): { name: string; value: string }[] {
  const headers: { name: string; value: string }[] = [];

  for (const rule of rules) {
    if (matchesUrlPattern(rule.urlPattern, url)) {
      headers.push({
        name: "Content-Security-Policy",
        value: rule.directive,
      });
    }
  }

  return headers;
}

function matchesUrlPattern(pattern: string, url: string): boolean {
  if (!pattern || pattern === "*") return true;
  const lower = url.toLowerCase();
  let pat = pattern.toLowerCase();
  if (pat.startsWith("||")) {
    pat = pat.slice(2).replace(/\^$/, "");
    return lower.includes(pat);
  }
  return lower.includes(pat);
}
