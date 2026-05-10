/**
 * Extended modifier support for full uBlock Origin / AdGuard compatibility.
 * 
 * Implements all major modifiers from the Adblock Plus / uBO / AdGuard syntax:
 * - Network modifiers: $third-party, $domain, $important, $badfilter
 * - Resource types: $script, $image, $stylesheet, $xmlhttprequest, etc.
 * - Action modifiers: $redirect, $removeparam, $csp, $permissions
 * - Special modifiers: $all, $popup, $document, $elemhide, $generichide
 * 
 * Reference: https://adguard.com/kb/general/ad-filtering/create-own-filters/
 */

import type { ResourceType, RuleModifiers } from "../types/index.js";

// ─── Extended Modifier Types ──────────────────────────────────────────────────

export interface ExtendedModifiers extends RuleModifiers {
  /** $important — overrides exception rules */
  important?: boolean;
  /** $badfilter — disables another rule with matching pattern */
  badfilter?: boolean;
  /** $csp — inject Content-Security-Policy header */
  csp?: string;
  /** $permissions — inject Permissions-Policy header */
  permissions?: string;
  /** $removeparam — remove URL parameters */
  removeparam?: string;
  /** $redirect — serve neutered resource instead of blocking */
  redirect?: string;
  /** $redirect-rule — redirect only if another rule blocks */
  redirectRule?: string;
  /** $replace — replace response body content (regex) */
  replace?: string;
  /** $cookie — block or modify cookies */
  cookie?: string;
  /** $method — match specific HTTP methods */
  method?: string[];
  /** $to — match specific target domains */
  to?: string[];
  /** $from — alias for $domain */
  from?: string[];
  /** $header — match response headers */
  header?: string;
  /** $denyallow — exception within a blocking rule */
  denyallow?: string[];
  /** $document — block the entire page */
  document?: boolean;
  /** $elemhide — disable cosmetic filtering on matching pages */
  elemhide?: boolean;
  /** $generichide — disable generic cosmetic rules */
  generichide?: boolean;
  /** $genericblock — disable generic blocking rules */
  genericblock?: boolean;
  /** $specifichide — disable specific cosmetic rules */
  specifichide?: boolean;
  /** $all — match all resource types */
  all?: boolean;
  /** $popup — match popup windows */
  popup?: boolean;
  /** $strict1p — strict first-party (same eTLD+1) */
  strict1p?: boolean;
  /** $strict3p — strict third-party */
  strict3p?: boolean;
  /** $match-case — case-sensitive matching */
  matchCase?: boolean;
}

// ─── All Known Resource Types ─────────────────────────────────────────────────

export const ALL_RESOURCE_TYPES: ResourceType[] = [
  "script", "image", "stylesheet", "xmlhttprequest",
  "media", "font", "iframe", "popup", "other",
];

const RESOURCE_TYPE_SET = new Set<string>(ALL_RESOURCE_TYPES);

// Negated resource types (e.g., ~script means all except script)
const NEGATED_PREFIX = "~";

// ─── Modifier Parsing ─────────────────────────────────────────────────────────

/**
 * Parse a modifier string (everything after $) into ExtendedModifiers.
 * Handles all known modifiers from uBO/AdGuard syntax.
 */
export function parseModifiers(modifierStr: string): {
  modifiers: ExtendedModifiers;
  domains?: { include?: string[]; exclude?: string[] };
  unknownModifiers: string[];
} {
  const modifiers: ExtendedModifiers = {};
  const unknownModifiers: string[] = [];
  let domains: { include?: string[]; exclude?: string[] } | undefined;

  const parts = splitModifiers(modifierStr);

  const resourceTypes: ResourceType[] = [];
  const excludedTypes: ResourceType[] = [];

  for (const mod of parts) {
    const parsed = parseSingleModifier(mod);

    switch (parsed.type) {
      case "third-party":
        modifiers.thirdParty = true;
        break;
      case "~third-party":
      case "first-party":
      case "1p":
        modifiers.thirdParty = false;
        break;
      case "3p":
        modifiers.thirdParty = true;
        break;
      case "strict1p":
        modifiers.strict1p = true;
        break;
      case "strict3p":
        modifiers.strict3p = true;
        break;
      case "important":
        modifiers.important = true;
        break;
      case "badfilter":
        modifiers.badfilter = true;
        break;
      case "match-case":
        modifiers.matchCase = true;
        break;
      case "document":
      case "doc":
        modifiers.document = true;
        break;
      case "elemhide":
        modifiers.elemhide = true;
        break;
      case "generichide":
      case "ghide":
        modifiers.generichide = true;
        break;
      case "genericblock":
        modifiers.genericblock = true;
        break;
      case "specifichide":
      case "shide":
        modifiers.specifichide = true;
        break;
      case "all":
        modifiers.all = true;
        break;
      case "popup":
        modifiers.popup = true;
        resourceTypes.push("popup");
        break;
      case "csp":
        modifiers.csp = parsed.value ?? "";
        break;
      case "permissions":
        modifiers.permissions = parsed.value ?? "";
        break;
      case "removeparam":
      case "queryprune":
        modifiers.removeparam = parsed.value ?? "";
        break;
      case "redirect":
      case "rewrite":
        modifiers.redirect = parsed.value ?? "";
        break;
      case "redirect-rule":
        modifiers.redirectRule = parsed.value ?? "";
        break;
      case "replace":
        modifiers.replace = parsed.value ?? "";
        break;
      case "cookie":
        modifiers.cookie = parsed.value ?? "";
        break;
      case "header":
        modifiers.header = parsed.value ?? "";
        break;
      case "domain":
      case "from":
        domains = parseDomainModifier(parsed.value ?? "");
        break;
      case "to":
        modifiers.to = (parsed.value ?? "").split("|").filter(Boolean);
        break;
      case "denyallow":
        modifiers.denyallow = (parsed.value ?? "").split("|").filter(Boolean);
        break;
      case "method":
        modifiers.method = (parsed.value ?? "").split("|").filter(Boolean);
        break;
      default:
        // Check if it's a resource type
        if (parsed.type.startsWith(NEGATED_PREFIX)) {
          const typeName = parsed.type.slice(1);
          if (RESOURCE_TYPE_SET.has(typeName)) {
            excludedTypes.push(typeName as ResourceType);
          } else {
            unknownModifiers.push(mod);
          }
        } else if (RESOURCE_TYPE_SET.has(parsed.type)) {
          resourceTypes.push(parsed.type as ResourceType);
        } else if (isResourceTypeAlias(parsed.type)) {
          const resolved = resolveResourceTypeAlias(parsed.type);
          if (resolved) resourceTypes.push(resolved);
        } else {
          unknownModifiers.push(mod);
        }
    }
  }

  // Handle resource types
  if (resourceTypes.length > 0) {
    modifiers.resourceTypes = resourceTypes;
  } else if (excludedTypes.length > 0) {
    // ~script means all types except script
    modifiers.resourceTypes = ALL_RESOURCE_TYPES.filter(
      (t) => !excludedTypes.includes(t)
    );
  }

  return { modifiers, domains, unknownModifiers };
}

// ─── Modifier Formatting ──────────────────────────────────────────────────────

/**
 * Format ExtendedModifiers back into a modifier string.
 */
export function formatModifiers(
  modifiers: ExtendedModifiers,
  domains?: { include?: string[]; exclude?: string[] }
): string {
  const parts: string[] = [];

  if (modifiers.thirdParty === true) parts.push("third-party");
  if (modifiers.thirdParty === false) parts.push("~third-party");
  if (modifiers.important) parts.push("important");
  if (modifiers.badfilter) parts.push("badfilter");
  if (modifiers.matchCase) parts.push("match-case");
  if (modifiers.document) parts.push("document");
  if (modifiers.elemhide) parts.push("elemhide");
  if (modifiers.generichide) parts.push("generichide");
  if (modifiers.genericblock) parts.push("genericblock");
  if (modifiers.all) parts.push("all");
  if (modifiers.strict1p) parts.push("strict1p");
  if (modifiers.strict3p) parts.push("strict3p");

  if (modifiers.resourceTypes) {
    parts.push(...modifiers.resourceTypes.filter((t) => t !== "popup"));
  }
  if (modifiers.popup) parts.push("popup");

  if (modifiers.csp !== undefined) parts.push(`csp=${modifiers.csp}`);
  if (modifiers.permissions !== undefined) parts.push(`permissions=${modifiers.permissions}`);
  if (modifiers.removeparam !== undefined) parts.push(`removeparam=${modifiers.removeparam}`);
  if (modifiers.redirect !== undefined) parts.push(`redirect=${modifiers.redirect}`);
  if (modifiers.redirectRule !== undefined) parts.push(`redirect-rule=${modifiers.redirectRule}`);
  if (modifiers.replace !== undefined) parts.push(`replace=${modifiers.replace}`);
  if (modifiers.cookie !== undefined) parts.push(`cookie=${modifiers.cookie}`);
  if (modifiers.header !== undefined) parts.push(`header=${modifiers.header}`);

  if (domains) {
    const domainParts: string[] = [];
    if (domains.include) domainParts.push(...domains.include);
    if (domains.exclude) domainParts.push(...domains.exclude.map((d) => `~${d}`));
    if (domainParts.length > 0) parts.push(`domain=${domainParts.join("|")}`);
  }

  if (modifiers.denyallow) parts.push(`denyallow=${modifiers.denyallow.join("|")}`);
  if (modifiers.method) parts.push(`method=${modifiers.method.join("|")}`);
  if (modifiers.to) parts.push(`to=${modifiers.to.join("|")}`);

  return parts.join(",");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ParsedModifier {
  type: string;
  value?: string;
}

function parseSingleModifier(mod: string): ParsedModifier {
  const eqIdx = mod.indexOf("=");
  if (eqIdx === -1) {
    return { type: mod.toLowerCase().trim() };
  }
  return {
    type: mod.slice(0, eqIdx).toLowerCase().trim(),
    value: mod.slice(eqIdx + 1).trim(),
  };
}

/**
 * Split modifier string by commas, respecting nested regex patterns.
 * E.g., "removeparam=/^utm_[a-z]+/,third-party" → ["removeparam=/^utm_[a-z]+/", "third-party"]
 */
function splitModifiers(str: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inRegex = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;

    if (ch === "/" && !inRegex) {
      inRegex = true;
      current += ch;
    } else if (ch === "/" && inRegex) {
      inRegex = false;
      current += ch;
    } else if (ch === "," && !inRegex) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseDomainModifier(value: string): { include?: string[]; exclude?: string[] } {
  const separator = value.includes("|") ? "|" : ",";
  const parts = value.split(separator).map((d) => d.trim()).filter(Boolean);
  const include: string[] = [];
  const exclude: string[] = [];

  for (const part of parts) {
    if (part.startsWith("~")) {
      exclude.push(part.slice(1));
    } else {
      include.push(part);
    }
  }

  const result: { include?: string[]; exclude?: string[] } = {};
  if (include.length > 0) result.include = include;
  if (exclude.length > 0) result.exclude = exclude;
  return result;
}

function isResourceTypeAlias(type: string): boolean {
  return RESOURCE_TYPE_ALIASES.has(type);
}

function resolveResourceTypeAlias(alias: string): ResourceType | null {
  return RESOURCE_TYPE_ALIASES.get(alias) ?? null;
}

const RESOURCE_TYPE_ALIASES = new Map<string, ResourceType>([
  ["xhr", "xmlhttprequest"],
  ["css", "stylesheet"],
  ["frame", "iframe"],
  ["subdocument", "iframe"],
  ["sub_frame", "iframe"],
  ["object", "other"],
  ["object-subrequest", "other"],
  ["websocket", "other"],
  ["webrtc", "other"],
  ["ping", "other"],
  ["beacon", "other"],
]);
