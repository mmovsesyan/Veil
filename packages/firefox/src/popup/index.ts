/**
 * Firefox extension popup UI (plain DOM, no React dependency).
 */

interface TabStats {
  blocked: number;
  byCategory: Record<string, number>;
}

function reportError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  try {
    browser.runtime.sendMessage({ type: "LOG_CLIENT_ERROR", payload: { context, error: message } }).catch(() => {});
  } catch {
    // Extension context invalid
  }
}

async function init() {
  const container = document.getElementById("root");
  if (!container) return;

  container.style.cssText = "width:320px;padding:16px;font-family:system-ui,sans-serif;";

  let domain = "";
  let isWhitelisted = false;
  let enabled = true;
  let blocked = 0;
  let lastPickerRule: { raw: string; timestamp: number } | null = null;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.url) {
      try {
        domain = new URL(tab.url).hostname;
      } catch {
        domain = tab.url;
      }
    }

    const status = await browser.runtime.sendMessage({ type: "GET_STATUS" });
    enabled = status?.enabled ?? true;

    const wlResp = await browser.runtime.sendMessage({ type: "GET_WHITELIST" });
    if (wlResp?.whitelist && tab?.url) {
      try {
        const hostname = new URL(tab.url).hostname;
        const wl = wlResp.whitelist as string[];
        isWhitelisted = wl.includes(hostname);
      } catch { /* ignore */ }
    }

    if (tab?.id !== undefined) {
      const stats: TabStats = await browser.runtime.sendMessage({
        type: "GET_TAB_STATS",
        payload: tab.id,
      });
      blocked = stats?.blocked ?? 0;
    }

    const recent = await browser.runtime.sendMessage({ type: "GET_RECENT_PICKER_RULES" });
    if (recent?.last) {
      lastPickerRule = recent.last as { raw: string; timestamp: number };
    }
  } catch (e) {
    reportError("firefox-popup-load", e);
  }

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;";

  const title = document.createElement("h1");
  title.textContent = "Veil";
  title.style.cssText = "margin:0;font-size:16px;font-weight:600;";

  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = enabled ? "ON" : "OFF";
  toggleBtn.style.cssText = `padding:4px 12px;border-radius:12px;border:none;background:${enabled ? "#4A90D9" : "#ccc"};color:white;font-size:12px;cursor:pointer;`;
  toggleBtn.addEventListener("click", async () => {
    const resp = await browser.runtime.sendMessage({ type: "TOGGLE_ENABLED" });
    enabled = resp?.enabled ?? !enabled;
    toggleBtn.textContent = enabled ? "ON" : "OFF";
    toggleBtn.style.background = enabled ? "#4A90D9" : "#ccc";
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) browser.tabs.reload(tabs[0].id);
  });

  header.appendChild(title);
  header.appendChild(toggleBtn);
  container.appendChild(header);

  // Stats block
  const statsBlock = document.createElement("div");
  statsBlock.style.cssText = `background:${isWhitelisted ? "#f0fdf4" : "#f5f5f5"};border-radius:8px;padding:12px;margin-bottom:12px;text-align:center;`;

  if (isWhitelisted) {
    const check = document.createElement("div");
    check.style.cssText = "font-size:20px;font-weight:700;color:#22c55e";
    check.textContent = "✓";
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:12px;color:#666";
    msg.textContent = "блокировка отключена для этого сайта";
    statsBlock.appendChild(check);
    statsBlock.appendChild(msg);
  } else {
    const count = document.createElement("div");
    count.style.cssText = "font-size:28px;font-weight:700;color:#4A90D9";
    count.textContent = String(blocked);
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:12px;color:#666";
    msg.textContent = "заблокировано на этой странице";
    statsBlock.appendChild(count);
    statsBlock.appendChild(msg);
  }
  container.appendChild(statsBlock);

  // Domain
  const domainEl = document.createElement("div");
  domainEl.textContent = domain || "—";
  domainEl.style.cssText = "font-size:13px;color:#888;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  container.appendChild(domainEl);

  // Whitelist toggle
  const wlBtn = document.createElement("button");
  wlBtn.textContent = isWhitelisted ? "Включить блокировку" : "Отключить для этого сайта";
  wlBtn.style.cssText = `width:100%;padding:8px 16px;border-radius:8px;border:${isWhitelisted ? "1px solid #4A90D9" : "1px solid #ddd"};background:${isWhitelisted ? "#EBF5FF" : "white"};color:${isWhitelisted ? "#4A90D9" : "#333"};font-size:13px;cursor:pointer;`;
  wlBtn.addEventListener("click", async () => {
    if (!domain) return;
    if (isWhitelisted) {
      await browser.runtime.sendMessage({ type: "REMOVE_FROM_WHITELIST", payload: domain });
      isWhitelisted = false;
    } else {
      await browser.runtime.sendMessage({ type: "ADD_TO_WHITELIST", payload: domain });
      isWhitelisted = true;
    }
    wlBtn.textContent = isWhitelisted ? "Включить блокировку" : "Отключить для этого сайта";
    wlBtn.style.border = isWhitelisted ? "1px solid #4A90D9" : "1px solid #ddd";
    wlBtn.style.background = isWhitelisted ? "#EBF5FF" : "white";
    wlBtn.style.color = isWhitelisted ? "#4A90D9" : "#333";
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) browser.tabs.reload(tabs[0].id);
  });
  container.appendChild(wlBtn);

  // Block element button
  const pickerBtn = document.createElement("button");
  pickerBtn.textContent = "🎯 Заблокировать элемент";
  pickerBtn.style.cssText = "width:100%;padding:8px 16px;margin-top:8px;border-radius:8px;border:1px dashed #ddd;background:white;font-size:12px;color:#666;cursor:pointer;";
  pickerBtn.addEventListener("click", async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return;
    browser.tabs.executeScript(tab.id, {
      code: `
        (function() {
          if (document.getElementById("veil-picker-overlay")) return;
          const overlay = document.createElement("div");
          overlay.id = "veil-picker-overlay";
          overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;";
          let highlighted = null;
          const BLOCKED_TAGS = new Set(["HTML","BODY","HEAD","MAIN","ARTICLE","SECTION","NAV","HEADER","FOOTER"]);
          overlay.addEventListener("mousemove", (e) => {
            overlay.style.pointerEvents = "none";
            let el = document.elementFromPoint(e.clientX, e.clientY);
            overlay.style.pointerEvents = "auto";
            if (el && el.children.length > 3 && el.offsetHeight > 300) {
              for (const child of el.children) {
                const rect = child.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                  el = child;
                  break;
                }
              }
            }
            if (el && el !== highlighted && el !== overlay && !BLOCKED_TAGS.has(el.tagName)) {
              if (highlighted) highlighted.style.outline = "";
              highlighted = el;
              highlighted.style.outline = "2px solid red";
            }
          });
          overlay.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.remove();
            if (highlighted) {
              highlighted.style.outline = "";
              if (BLOCKED_TAGS.has(highlighted.tagName)) {
                alert("Нельзя заблокировать корневой элемент");
                return;
              }
              const rect = highlighted.getBoundingClientRect();
              if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
                alert("Элемент слишком большой — выберите конкретный баннер внутри");
                return;
              }
              let selector = "";
              if (highlighted.id && highlighted.id.length > 2) {
                selector = "#" + highlighted.id;
              } else if (highlighted.className && typeof highlighted.className === "string") {
                const classes = highlighted.className.split(" ").filter(Boolean);
                const specific = classes.find(c => c.length > 3 && !["container","wrapper","content","main","page","app","root"].includes(c.toLowerCase()));
                if (specific) selector = "." + specific;
              }
              if (!selector) {
                const parent = highlighted.parentElement;
                if (parent) {
                  const siblings = Array.from(parent.children);
                  const index = siblings.indexOf(highlighted) + 1;
                  selector = highlighted.tagName.toLowerCase() + ":nth-child(" + index + ")";
                } else {
                  alert("Не удалось определить селектор");
                  return;
                }
              }
              const domain = window.location.hostname;
              const rule = domain + "##" + selector;
              if (confirm("Заблокировать элемент?\\n\\nПравило: " + rule)) {
                highlighted.style.display = "none";
                browser.runtime.sendMessage({ type: "ADD_CUSTOM_RULE", payload: rule });
              }
            }
          });
          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
              if (highlighted) highlighted.style.outline = "";
              overlay.remove();
            }
          }, { once: true });
          document.body.appendChild(overlay);
        })();
      `,
    });
    window.close();
  });
  container.appendChild(pickerBtn);

  // Undo button
  if (lastPickerRule) {
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "↩ Отменить блокировку (" + (lastPickerRule.raw.length > 30 ? lastPickerRule.raw.slice(0, 30) + "…" : lastPickerRule.raw) + ")";
    undoBtn.style.cssText = "width:100%;padding:8px 16px;margin-top:8px;border-radius:8px;border:1px solid #fca5a5;background:#fef2f2;font-size:12px;color:#dc2626;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    undoBtn.addEventListener("click", async () => {
      const resp = await browser.runtime.sendMessage({ type: "UNDO_LAST_PICKER_RULE" });
      if (resp?.success) {
        undoBtn.remove();
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) browser.tabs.reload(tabs[0].id);
      }
    });
    container.appendChild(undoBtn);
  }

  // Options button
  const optionsBtn = document.createElement("button");
  optionsBtn.textContent = "Настройки";
  optionsBtn.style.cssText = "width:100%;padding:8px 16px;margin-top:8px;border-radius:8px;border:none;background:transparent;font-size:12px;color:#4A90D9;cursor:pointer;";
  optionsBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
  container.appendChild(optionsBtn);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
