/**
 * Chrome content script for cosmetic filtering, anti-adblock bypass,
 * privacy budget monitoring, and ML-based zero-day ad detection.
 *
 * Key design decisions:
 * 1. Runs at document_start for immediate element hiding
 * 2. Falls back to chrome.storage.session if service worker is dead
 * 3. Uses MutationObserver for dynamic content (SPA, lazy loading)
 * 4. Injects scriptlets for anti-adblock bypass
 * 5. Replaces social widget iframes with placeholders
 * 6. Injects privacy budget monitor (fingerprinting detection)
 * 7. ML heuristic classifier catches ads not covered by filter lists
 */

import { extractFeatures, classifyHeuristic, shouldBlock } from "@veil/core";

const SOCIAL_DOMAINS: Record<string, string> = {
  "facebook.com": "Facebook",
  "fbcdn.net": "Facebook",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "platform.twitter.com": "Twitter/X",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "platform.linkedin.com": "LinkedIn",
  "vk.com": "ВКонтакте",
  "vkontakte.ru": "ВКонтакте",
};

let cosmeticSelectors: string[] = [];
let scriptlets: string[] = [];
let observer: MutationObserver | null = null;
let styleElement: HTMLStyleElement | null = null;
const mlEnabled = true;

// ─── Initialization ───────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  const domain = window.location.hostname;

  try {
    // First check if extension is enabled
    const statusResponse = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    if (statusResponse && !statusResponse.enabled) {
      // Extension is disabled — do not apply any cosmetic rules
      return;
    }

    // Try to get rules from service worker
    const response = await chrome.runtime.sendMessage({
      type: "GET_COSMETIC_RULES",
      payload: domain,
    });

    if (response?.selectors) {
      cosmeticSelectors = response.selectors;
    }
    if (response?.scriptlets) {
      scriptlets = response.scriptlets;
    }
  } catch {
    // Service worker is dead — fallback to storage.session
    try {
      // Check enabled state from local storage
      const settings = await chrome.storage.local.get("enabled");
      if (settings["enabled"] === false) {
        return; // Extension is disabled
      }

      const cached = await chrome.storage.session.get([`cosmetic_${domain}`]);
      const data = cached[`cosmetic_${domain}`];
      if (data) {
        cosmeticSelectors = data.selectors ?? [];
        scriptlets = data.scriptlets ?? [];
      }
    } catch {
      // No cached data available
    }
  }

  // Apply immediately
  if (cosmeticSelectors.length > 0) {
    applyCosmeticRules();
  }

  // Inject scriptlets (anti-adblock bypass)
  if (scriptlets.length > 0) {
    injectScriptlets();
  }

  // Inject privacy budget monitor (detect fingerprinting APIs)
  injectPrivacyMonitor();

  // Start observing DOM changes
  startObserver();

  // Cache for next time (in case service worker dies)
  try {
    await chrome.storage.session.set({
      [`cosmetic_${domain}`]: { selectors: cosmeticSelectors, scriptlets },
    });
  } catch {
    // storage.session not available
  }
}

// ─── Privacy Budget Monitor ───────────────────────────────────────────────────

function injectPrivacyMonitor(): void {
  // Ask background to inject the monitor script into MAIN world
  try {
    chrome.runtime.sendMessage({ type: "INJECT_PRIVACY_MONITOR" }).catch(() => {});
  } catch {
    // Extension context invalidated
  }

  // Listen for privacy events from the injected monitor
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "veil-privacy-event") return;

    // Relay to background script
    try {
      chrome.runtime.sendMessage({
        type: "PRIVACY_EVENT",
        payload: {
          method: event.data.method as string,
          timestamp: event.data.timestamp as number,
          url: event.data.url as string,
          domain: window.location.hostname,
        },
      }).catch(() => {});
    } catch {
      // Service worker dead
    }
  });
}

// ─── Cosmetic Filtering ───────────────────────────────────────────────────────

function applyCosmeticRules(): void {
  if (cosmeticSelectors.length === 0) return;

  // Remove old style if exists
  if (styleElement) styleElement.remove();

  styleElement = document.createElement("style");
  styleElement.id = "content-blocker-cosmetic";
  styleElement.textContent = cosmeticSelectors
    .map((s) => `${s} { display: none !important; }`)
    .join("\n");

  // Insert as early as possible
  const target = document.head ?? document.documentElement;
  if (target) {
    target.insertBefore(styleElement, target.firstChild);
  }
}

// ─── Scriptlet Injection ──────────────────────────────────────────────────────

function injectScriptlets(): void {
  if (scriptlets.length === 0) return;

  // Use chrome.scripting.executeScript via service worker (bypasses page CSP)
  try {
    chrome.runtime.sendMessage({
      type: "INJECT_SCRIPTLETS",
      payload: scriptlets,
    }).catch(() => {});
  } catch {
    // Extension context invalidated
  }
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function startObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    let needsUpdate = false;
    const mlCandidates: HTMLElement[] = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check for social widget iframes
        if (node.tagName === "IFRAME") {
          handleSocialWidget(node as HTMLIFrameElement);
        }
        const iframes = node.querySelectorAll("iframe");
        for (const iframe of iframes) {
          handleSocialWidget(iframe);
        }

        // Apply cosmetic rules to new elements
        for (const selector of cosmeticSelectors) {
          try {
            if (node.matches(selector)) {
              (node as HTMLElement).style.setProperty("display", "none", "important");
              needsUpdate = true;
            }
            const matches = node.querySelectorAll(selector);
            if (matches.length > 0) {
              for (const match of matches) {
                (match as HTMLElement).style.setProperty("display", "none", "important");
              }
              needsUpdate = true;
            }
          } catch {
            // Invalid selector — skip
          }
        }

        // Collect ML candidates (elements not hidden by cosmetic rules)
        if (mlEnabled && node.isConnected && (node as HTMLElement).style.display !== "none") {
          const tag = node.tagName;
          if (tag === "IFRAME" || tag === "IMG" || tag === "DIV" || tag === "SECTION" || tag === "ASIDE") {
            mlCandidates.push(node as HTMLElement);
          }
          // Also check children
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
            needsUpdate = true;
          }
        } catch {
          // Skip unclassifiable elements
        }
      }
    }

    // Batch badge update
    if (needsUpdate) {
      try {
        chrome.runtime.sendMessage({ type: "COSMETIC_APPLIED" }).catch(() => {});
      } catch {
        // Service worker dead
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// ─── Social Widget Placeholders ───────────────────────────────────────────────

function handleSocialWidget(iframe: HTMLIFrameElement): void {
  const src = iframe.src || iframe.getAttribute("data-src") || "";
  if (!src) return;

  try {
    const url = new URL(src);
    const hostname = url.hostname;

    for (const [domain, networkName] of Object.entries(SOCIAL_DOMAINS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        replaceSocialWidget(iframe, networkName, src);
        return;
      }
    }
  } catch {
    // Invalid URL
  }
}

function replaceSocialWidget(iframe: HTMLIFrameElement, networkName: string, originalSrc: string): void {
  const placeholder = document.createElement("div");
  placeholder.className = "cb-social-placeholder";
  placeholder.style.cssText = `
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 80px;
    background: #f9fafb;
    font-family: system-ui, sans-serif;
  `;

  const label = document.createElement("span");
  label.style.cssText = "font-size: 14px; color: #6b7280;";
  label.textContent = `Виджет ${networkName} заблокирован`;

  const button = document.createElement("button");
  button.style.cssText = `
    padding: 6px 16px;
    font-size: 13px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-family: inherit;
  `;
  button.textContent = "Загрузить";

  placeholder.appendChild(label);
  placeholder.appendChild(button);

  button.addEventListener("click", () => {
    const restored = document.createElement("iframe");
    restored.src = originalSrc;
    restored.style.width = iframe.width ? `${iframe.width}px` : "100%";
    restored.style.height = iframe.height ? `${iframe.height}px` : "300px";
    restored.style.border = "none";
    placeholder.replaceWith(restored);
  });

  iframe.replaceWith(placeholder);
}

// ─── Start ────────────────────────────────────────────────────────────────────

// Run immediately at document_start
if (document.readyState === "loading") {
  // Apply cosmetic rules ASAP, before DOM is ready
  initialize().catch(() => {});
  // Also listen for DOMContentLoaded for late initialization
  document.addEventListener("DOMContentLoaded", () => {
    if (cosmeticSelectors.length > 0) applyCosmeticRules();
  });
} else {
  initialize().catch(() => {});
}

export { initialize, applyCosmeticRules, injectScriptlets, startObserver };
