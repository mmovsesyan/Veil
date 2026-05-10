/**
 * Firefox content script for cosmetic filtering and social widget placeholders.
 */

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

async function initialize(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_COSMETIC_RULES",
      payload: window.location.hostname,
    });

    if (response?.selectors && Array.isArray(response.selectors)) {
      cosmeticSelectors = response.selectors;
      applyCosmeticRules(cosmeticSelectors);
      startObserver();
    }
  } catch {
    // Context invalidated
  }
}

function applyCosmeticRules(selectors: string[]): void {
  if (selectors.length === 0) return;

  const style = document.createElement("style");
  style.id = "content-blocker-cosmetic";
  style.textContent = selectors
    .map((s) => `${s} { display: none !important; }`)
    .join("\n");

  (document.head ?? document.documentElement).appendChild(style);
}

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        for (const selector of cosmeticSelectors) {
          if (node.matches(selector)) {
            node.style.display = "none";
          }
          node.querySelectorAll(selector).forEach((el) => {
            (el as HTMLElement).style.display = "none";
          });
        }

        // Social widget iframes
        if (node.tagName === "IFRAME") {
          handleSocialIframe(node as HTMLIFrameElement);
        }
        node.querySelectorAll("iframe").forEach((iframe) => {
          handleSocialIframe(iframe);
        });
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
        placeholder.innerHTML = `
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;background:#f9fafb;">
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Виджет <b>${network}</b> заблокирован</p>
            <button style="padding:6px 16px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;">Загрузить</button>
          </div>
        `;
        placeholder.querySelector("button")?.addEventListener("click", () => {
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
