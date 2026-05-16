/**
 * QR-Code Rule Exporter
 *
 * Compresses a batch of rules into a compact string suitable for QR codes.
 * Uses simple delta-encoding + base64 to stay under QR capacity limits.
 *
 * Typical QR v40 capacity: ~2953 bytes alphanumeric.
 * With base64 + compression we can fit ~150 rules.
 *
 * Usage:
 *   const qr = QRRulesExporter.export(rules);
 *   // render qr.text in any QR generator
 *   const imported = QRRulesExporter.import(qr.text);
 */

import type { CollaborativeRule } from "./collaborative-rules.js";
import type { RuleType } from "../types/index.js";

interface QRExport {
  text: string;
  ruleCount: number;
  version: number;
}

const VERSION = 1;
const SEP = "\n";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class QRRulesExporter {
  /**
   * Export rules to a compact QR-friendly string.
   * Format (per line): domain|type|pattern|conf
   */
  static export(rules: CollaborativeRule[]): QRExport {
    const lines: string[] = [`V${VERSION}`];

    for (const r of rules.slice(0, 150)) {
      // Compress: trim domain, round confidence to 2 decimals
      const conf = r.mlConfidence.toFixed(2);
      lines.push(`${r.domain}|${r.type}|${r.pattern}|${conf}`);
    }

    const raw = lines.join(SEP);
    const compressed = QRRulesExporter.compress(raw);

    return {
      text: compressed,
      ruleCount: rules.length,
      version: VERSION,
    };
  }

  /** Import rules from a QR string. */
  static import(text: string): CollaborativeRule[] {
    try {
      const decompressed = QRRulesExporter.decompress(text);
      const lines = decompressed.split(SEP);

      // Skip version header
      const start = lines[0]?.startsWith("V") ? 1 : 0;
      const rules: CollaborativeRule[] = [];

      for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const parts = line.split("|");
        if (parts.length < 3) continue;

        const [domain, type, pattern, conf] = parts;
        rules.push({
          domain: domain!,
          pattern: pattern!,
          type: type as unknown as RuleType,
          mlConfidence: parseFloat(conf ?? "0.8"),
          timestamp: Date.now(),
          signature: "",
          confirmations: 1,
        });
      }

      return rules;
    } catch {
      return [];
    }
  }

  /** Estimate how many rules fit in a QR code of given capacity. */
  static estimateCapacity(qrBytes: number): number {
    // Base64 overhead ~33%, version header ~4 bytes, avg line ~40 bytes
    const usable = Math.floor((qrBytes * 0.74 - 4) / 40);
    return Math.max(0, usable);
  }

  // ─── Private: simple compression ────────────────────────────────────────────

  private static compress(input: string): string {
    try {
      // Use CompressionStream if available (Chrome/Safari)
      // For sync export we do a simple dictionary replacement
      return QRRulesExporter.dictCompress(input);
    } catch {
      return btoa(input);
    }
  }

  private static decompress(input: string): string {
    try {
      return QRRulesExporter.dictDecompress(input);
    } catch {
      try {
        return atob(input);
      } catch {
        return input;
      }
    }
  }

  private static dictCompress(input: string): string {
    // Common substrings in filter rules
    const dict: string[] = [
      "||", "##", "#@#", "#?#", "^$", ".com", ".net", ".org",
      ".io", ".co.uk", "/ads", "/track", "/analytics", "/pixel",
      "/banner", "/popup", "/sponsor", "/promo", "/social",
      "display: none", "visibility: hidden", "position: fixed",
      "google", "facebook", "amazon", "youtube", "twitter",
      "doubleclick", "googlesyndication", "googleadservices",
    ];

    let out = input;
    for (let i = 0; i < dict.length; i++) {
      const token = String.fromCharCode(0xE000 + i); // Private use area
      out = out.split(dict[i]!).join(token);
    }
    return btoa(unescape(encodeURIComponent(out)));
  }

  private static dictDecompress(input: string): string {
    const dict: string[] = [
      "||", "##", "#@#", "#?#", "^$", ".com", ".net", ".org",
      ".io", ".co.uk", "/ads", "/track", "/analytics", "/pixel",
      "/banner", "/popup", "/sponsor", "/promo", "/social",
      "display: none", "visibility: hidden", "position: fixed",
      "google", "facebook", "amazon", "youtube", "twitter",
      "doubleclick", "googlesyndication", "googleadservices",
    ];

    let out = decodeURIComponent(escape(atob(input)));
    for (let i = dict.length - 1; i >= 0; i--) {
      const token = String.fromCharCode(0xE000 + i);
      out = out.split(token).join(dict[i]!);
    }
    return out;
  }
}
