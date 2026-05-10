/**
 * Veil DNS Worker — DNS-over-HTTPS proxy with ad/tracker blocking.
 * Deployed on Cloudflare Workers (free tier: 100K requests/day).
 *
 * How it works:
 * 1. Client sends DNS query via DoH (GET or POST)
 * 2. Worker checks domain against blocklist
 * 3. If blocked → returns 0.0.0.0 (NXDOMAIN)
 * 4. If allowed → forwards to upstream DNS (Cloudflare 1.1.1.1)
 */

// ─── Blocked Domains (ad networks, trackers) ──────────────────────────────────

const BLOCKED_DOMAINS = new Set([
  // Ad networks
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "google-analytics.com",
  "adnxs.com",
  "adsrvr.org",
  "criteo.com",
  "outbrain.com",
  "taboola.com",
  "amazon-adsystem.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "casalemedia.com",
  "bidswitch.net",
  "sharethrough.com",
  "moatads.com",
  "serving-sys.com",
  "smartadserver.com",
  "2mdn.net",
  "admob.com",
  "buysellads.com",
  "media.net",
  "revcontent.com",
  "sonobi.com",
  "yieldmo.com",

  // Trackers
  "scorecardresearch.com",
  "quantserve.com",
  "comscore.com",
  "demdex.net",
  "krxd.net",
  "bluekai.com",
  "exelator.com",
  "lotame.com",
  "mixpanel.com",
  "segment.com",
  "amplitude.com",
  "hotjar.com",
  "fullstory.com",
  "mouseflow.com",
  "inspectlet.com",
  "luckyorange.com",
  "crazyegg.com",
  "clicktale.net",
  "optimizely.com",

  // Russian ad networks
  "an.yandex.ru",
  "mc.yandex.ru",
  "ads.adfox.ru",
  "banners.adfox.ru",
  "adfox.yandex.ru",
  "ad.mail.ru",
  "rs.mail.ru",
  "top-fwz1.mail.ru",

  // Social trackers
  "pixel.facebook.com",
  "connect.facebook.net",
  "analytics.twitter.com",
  "bat.bing.com",
  "sb.scorecardresearch.com",

  // Fingerprinting
  "cdn.ravenjs.com",
  "cdn.rollbar.com",
  "cdn.bugsnag.com",
]);

// ─── DNS Wire Format Helpers ──────────────────────────────────────────────────

function parseDnsQuery(buffer: ArrayBuffer): { name: string; type: number } | null {
  try {
    const view = new DataView(buffer);
    // Skip header (12 bytes)
    let offset = 12;
    const labels: string[] = [];

    while (offset < buffer.byteLength) {
      const len = view.getUint8(offset);
      if (len === 0) {
        offset++;
        break;
      }
      offset++;
      const label = new TextDecoder().decode(new Uint8Array(buffer, offset, len));
      labels.push(label);
      offset += len;
    }

    const type = view.getUint16(offset);
    return { name: labels.join("."), type };
  } catch {
    return null;
  }
}

function buildBlockedResponse(queryBuffer: ArrayBuffer): ArrayBuffer {
  // Copy the query and modify it to be a response with 0.0.0.0
  const response = new ArrayBuffer(queryBuffer.byteLength + 16);
  const src = new Uint8Array(queryBuffer);
  const dst = new Uint8Array(response);

  // Copy query
  dst.set(src);

  const view = new DataView(response);
  // Set QR bit (response), RCODE=0 (no error)
  view.setUint8(2, 0x81); // QR=1, Opcode=0, AA=0, TC=0, RD=1
  view.setUint8(3, 0x80); // RA=1, RCODE=0
  // Set answer count = 1
  view.setUint16(6, 1);

  // Append answer: pointer to name + type A + class IN + TTL 300 + 0.0.0.0
  let offset = queryBuffer.byteLength;
  view.setUint16(offset, 0xC00C); offset += 2; // Name pointer
  view.setUint16(offset, 1); offset += 2;      // Type A
  view.setUint16(offset, 1); offset += 2;      // Class IN
  view.setUint32(offset, 300); offset += 4;    // TTL
  view.setUint16(offset, 4); offset += 2;      // RDLENGTH
  view.setUint32(offset, 0); // 0.0.0.0

  return response.slice(0, offset + 4);
}

// ─── Domain Matching ──────────────────────────────────────────────────────────

function isBlocked(domain: string): boolean {
  const lower = domain.toLowerCase();
  if (BLOCKED_DOMAINS.has(lower)) return true;

  // Check parent domains (sub.ads.com → ads.com)
  const parts = lower.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    if (BLOCKED_DOMAINS.has(parent)) return true;
  }

  return false;
}

// ─── Worker Handler ───────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: { UPSTREAM_DNS: string }): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        service: "Veil DNS",
        status: "ok",
        blocked_domains: BLOCKED_DOMAINS.size,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only handle /dns-query
    if (url.pathname !== "/dns-query") {
      return new Response("Not Found", { status: 404 });
    }

    let queryBuffer: ArrayBuffer;

    if (request.method === "GET") {
      // GET: ?dns=base64url
      const dnsParam = url.searchParams.get("dns");
      if (!dnsParam) return new Response("Missing dns parameter", { status: 400 });

      // Base64url decode
      const base64 = dnsParam.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(base64);
      queryBuffer = new ArrayBuffer(binary.length);
      const view = new Uint8Array(queryBuffer);
      for (let i = 0; i < binary.length; i++) {
        view[i] = binary.charCodeAt(i);
      }
    } else if (request.method === "POST") {
      queryBuffer = await request.arrayBuffer();
    } else {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Parse the DNS query
    const query = parseDnsQuery(queryBuffer);

    if (query && isBlocked(query.name)) {
      // Return blocked response (0.0.0.0)
      const blocked = buildBlockedResponse(queryBuffer);
      return new Response(blocked, {
        headers: {
          "Content-Type": "application/dns-message",
          "X-Veil-Blocked": "true",
          "X-Veil-Domain": query.name,
        },
      });
    }

    // Forward to upstream DNS
    const upstreamResponse = await fetch(env.UPSTREAM_DNS, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        "Accept": "application/dns-message",
      },
      body: queryBuffer,
    });

    return new Response(upstreamResponse.body, {
      headers: {
        "Content-Type": "application/dns-message",
        "X-Veil-Blocked": "false",
      },
    });
  },
};
