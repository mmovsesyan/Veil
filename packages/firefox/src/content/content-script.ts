/**
 * Firefox content script for cosmetic filtering, privacy monitoring,
 * social widget placeholders, and ML-based zero-day ad detection.
 */

import { extractFeatures } from "../../../core/src/ml/dom-features";
import { classifyHeuristic, shouldBlock } from "../../../core/src/ml/heuristic";
import { generatePrivacyMonitorScript } from "../../../core/src/privacy-budget/tracker";

const SOCIAL_DOMAINS: Record<string, string> = {
  "facebook.com": "facebook",
  "fbcdn.net": "facebook",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "vk.com": "vkontakte",
};

let cosmeticSelectors: string[] = [];
const mlEnabled = true;

async function initialize(): Promise<void> {
  const domain = window.location.hostname;

  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_COSMETIC_RULES",
      payload: domain,
    });

    if (response?.selectors && Array.isArray(response.selectors)) {
      cosmeticSelectors = response.selectors;
      applyCosmeticRules(cosmeticSelectors);
      startObserver();
    }
  } catch {
    // Context invalidated
  }

  // Inject privacy budget monitor directly (Firefox allows script tag injection from content script)
  injectPrivacyMonitor();
}

function applyCosmeticRules(selectors: string[]): void {
  if (selectors.length === 0) return;

  const style = document.createElement("style");
  style.id = "content-blocker-cosmetic";
  style.textContent = selectors.map((s) => `${s} { display: none !important; }`).join("\n");

  (document.head ?? document.documentElement).appendChild(style);
}

function injectPrivacyMonitor(): void {
  try {
    const code = generatePrivacyMonitorScript();
    const script = document.createElement("script");
    script.textContent = code;
    script.dataset.veil = "privacy-monitor";
    (document.head ?? document.documentElement).appendChild(script);
  } catch {
    // Injection may fail on restricted pages
  }

  // Listen for privacy events from the injected monitor
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "veil-privacy-event") return;

    try {
      browser.runtime
        .sendMessage({
          type: "PRIVACY_EVENT",
          payload: {
            method: event.data.method as string,
            timestamp: event.data.timestamp as number,
            url: event.data.url as string,
            domain: window.location.hostname,
          },
        })
        .catch(() => {});
    } catch {
      // Background dead
    }
  });
}

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    const mlCandidates: HTMLElement[] = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        for (const selector of cosmeticSelectors) {
          try {
            if (node.matches(selector)) {
              node.style.display = "none";
            }
            node.querySelectorAll(selector).forEach((el) => {
              (el as HTMLElement).style.display = "none";
            });
          } catch {
            // Invalid selector — skip
          }
        }

        // Social widget iframes
        if (node.tagName === "IFRAME") {
          handleSocialIframe(node as HTMLIFrameElement);
        }
        node.querySelectorAll("iframe").forEach((iframe) => {
          handleSocialIframe(iframe);
        });

        // Collect ML candidates
        if (mlEnabled && node.isConnected && node.style.display !== "none") {
          const tag = node.tagName;
          if (
            tag === "IFRAME" ||
            tag === "IMG" ||
            tag === "DIV" ||
            tag === "SECTION" ||
            tag === "ASIDE"
          ) {
            mlCandidates.push(node);
          }
          const children = node.querySelectorAll("iframe, img, div, section, aside");
          for (const child of children) {
            if (child.isConnected && (child as HTMLElement).style.display !== "none") {
              mlCandidates.push(child as HTMLElement);
            }
          }
        }
      }
    }

    // ML-based zero-day detection (throttled)
    if (mlEnabled && mlCandidates.length > 0) {
      for (const el of mlCandidates.slice(0, 20)) {
        try {
          const features = extractFeatures(el);
          const result = classifyHeuristic(features);
          if (shouldBlock(result)) {
            el.style.setProperty("display", "none", "important");
            el.setAttribute("data-veil-ml-blocked", result.label);
          }
        } catch {
          // Skip unclassifiable elements
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function handleSocialIframe(iframe: HTMLIFrameElement): void {
  const src = iframe.src || "";
  if (!src) return;

  try {
    const hostname = new URL(src).hostname;
    for (const [domain, network] of Object.entries(SOCIAL_DOMAINS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        const placeholder = document.createElement("div");
        const wrapper = document.createElement("div");
        wrapper.style.cssText =
          "border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;background:#f9fafb;";

        const text = document.createElement("p");
        text.style.cssText = "margin:0 0 8px;font-size:14px;color:#6b7280;";
        text.textContent = `Виджет ${network} заблокирован`;

        const button = document.createElement("button");
        button.style.cssText =
          "padding:6px 16px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;";
        button.textContent = "Загрузить";

        wrapper.appendChild(text);
        wrapper.appendChild(button);
        placeholder.appendChild(wrapper);

        button.addEventListener("click", () => {
          const restored = document.createElement("iframe");
          restored.src = src;
          restored.style.width = iframe.width || "100%";
          restored.style.height = iframe.height || "300px";
          restored.style.border = "none";
          placeholder.replaceWith(restored);
        });
        iframe.replaceWith(placeholder);
        return;
      }
    }
  } catch {
    // Invalid URL
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initialize());
} else {
  void initialize();
}

export { initialize, applyCosmeticRules };
