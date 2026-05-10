import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";

interface TabStats {
  blocked: number;
  byCategory: Record<string, number>;
}

function PopupApp() {
  const [enabled, setEnabled] = useState(true);
  const [domain, setDomain] = useState("");
  const [blocked, setBlocked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isWhitelisted, setIsWhitelisted] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          try {
            const url = new URL(tab.url);
            setDomain(url.hostname);
          } catch {
            setDomain(tab.url);
          }
        }

        // Get status
        const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
        setEnabled(status?.enabled ?? true);

        // Get whitelist to check if current domain is whitelisted
        const wlResp = await chrome.runtime.sendMessage({ type: "GET_WHITELIST" });
        if (wlResp?.whitelist && tab?.url) {
          try {
            const hostname = new URL(tab.url).hostname;
            const wl = wlResp.whitelist as string[];
            setIsWhitelisted(wl.includes(hostname));
          } catch { /* ignore */ }
        }

        // Get tab stats
        if (tab?.id) {
          const stats: TabStats = await chrome.runtime.sendMessage({
            type: "GET_TAB_STATS",
            payload: tab.id,
          });
          setBlocked(stats?.blocked ?? 0);
        }
      } catch (e) {
        console.error("Popup load error:", e);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleToggle = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "TOGGLE_ENABLED" });
      setEnabled(response?.enabled ?? !enabled);

      // Reload current tab to apply the change immediately
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.reload(tab.id);
      }
    } catch (e) {
      console.error("Toggle error:", e);
    }
  };

  const handleWhitelistToggle = async () => {
    if (!domain) return;

    try {
      if (isWhitelisted) {
        // Remove from whitelist
        await chrome.runtime.sendMessage({ type: "REMOVE_FROM_WHITELIST", payload: domain });
        setIsWhitelisted(false);
      } else {
        // Add to whitelist
        await chrome.runtime.sendMessage({ type: "ADD_TO_WHITELIST", payload: domain });
        setIsWhitelisted(true);
      }

      // Reload current tab to apply changes
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.reload(tab.id);
      }
    } catch (e) {
      console.error("Whitelist toggle error:", e);
    }
  };

  if (loading) {
    return (
      <div style={{ width: 320, padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: "#666", textAlign: "center" }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div style={{ width: 320, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Veil</h1>
        <button
          onClick={handleToggle}
          style={{
            padding: "4px 12px",
            borderRadius: 12,
            border: "none",
            background: enabled ? "#4A90D9" : "#ccc",
            color: "white",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      <div style={{
        background: isWhitelisted ? "#f0fdf4" : "#f5f5f5",
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        textAlign: "center",
      }}>
        {isWhitelisted ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>✓</div>
            <div style={{ fontSize: 12, color: "#666" }}>блокировка отключена для этого сайта</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#4A90D9" }}>{blocked}</div>
            <div style={{ fontSize: 12, color: "#666" }}>заблокировано на этой странице</div>
          </>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#888", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {domain || "—"}
      </div>

      <button
        onClick={handleWhitelistToggle}
        disabled={!domain}
        style={{
          width: "100%",
          padding: "8px 16px",
          borderRadius: 8,
          border: isWhitelisted ? "1px solid #4A90D9" : "1px solid #ddd",
          background: isWhitelisted ? "#EBF5FF" : "white",
          color: isWhitelisted ? "#4A90D9" : "#333",
          fontSize: 13,
          cursor: domain ? "pointer" : "not-allowed",
          opacity: domain ? 1 : 0.5,
        }}
      >
        {isWhitelisted ? "Включить блокировку" : "Отключить для этого сайта"}
      </button>

      <button
        onClick={async () => {
          // Inject element picker into the active tab
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                // Element picker overlay
                const overlay = document.createElement("div");
                overlay.id = "veil-picker-overlay";
                overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;";
                
                let highlighted: HTMLElement | null = null;
                
                // Blocked tags — never hide these
                const BLOCKED_TAGS = new Set(["HTML", "BODY", "HEAD", "MAIN", "ARTICLE", "SECTION", "NAV", "HEADER", "FOOTER"]);
                
                overlay.addEventListener("mousemove", (e) => {
                  overlay.style.pointerEvents = "none";
                  let el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
                  overlay.style.pointerEvents = "auto";
                  
                  // Skip large containers — find the smallest visible child
                  if (el && el.children.length > 3 && el.offsetHeight > 300) {
                    // Try to find a smaller child at this point
                    for (const child of el.children) {
                      const rect = child.getBoundingClientRect();
                      if (e.clientX >= rect.left && e.clientX <= rect.right &&
                          e.clientY >= rect.top && e.clientY <= rect.bottom) {
                        el = child as HTMLElement;
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
                    
                    // Safety: don't block root elements
                    if (BLOCKED_TAGS.has(highlighted.tagName)) {
                      alert("Нельзя заблокировать корневой элемент");
                      return;
                    }
                    
                    // Safety: don't block elements larger than 80% of viewport
                    const rect = highlighted.getBoundingClientRect();
                    if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
                      alert("Элемент слишком большой — выберите конкретный баннер внутри");
                      return;
                    }
                    
                    // Generate specific selector
                    let selector = "";
                    if (highlighted.id && highlighted.id.length > 2) {
                      selector = `#${highlighted.id}`;
                    } else if (highlighted.className && typeof highlighted.className === "string") {
                      // Use the most specific class (longest, not generic)
                      const classes = highlighted.className.split(" ").filter(Boolean);
                      const specific = classes.find(c => c.length > 3 && !["container", "wrapper", "content", "main", "page", "app", "root"].includes(c.toLowerCase()));
                      if (specific) selector = `.${specific}`;
                    }
                    
                    // Fallback: use tag + nth-child for precision
                    if (!selector) {
                      const parent = highlighted.parentElement;
                      if (parent) {
                        const siblings = Array.from(parent.children);
                        const index = siblings.indexOf(highlighted) + 1;
                        const tag = highlighted.tagName.toLowerCase();
                        selector = `${tag}:nth-child(${index})`;
                      } else {
                        alert("Не удалось определить селектор");
                        return;
                      }
                    }
                    
                    // Confirm before applying
                    const domain = window.location.hostname;
                    const rule = `${domain}##${selector}`;
                    if (confirm(`Заблокировать элемент?\n\nПравило: ${rule}`)) {
                      highlighted.style.display = "none";
                      chrome.runtime.sendMessage({ type: "ADD_CUSTOM_RULE", payload: rule });
                    }
                  }
                });
                
                // ESC to cancel
                document.addEventListener("keydown", (e) => {
                  if (e.key === "Escape") {
                    if (highlighted) highlighted.style.outline = "";
                    overlay.remove();
                  }
                }, { once: true });
                
                document.body.appendChild(overlay);
              },
            });
            window.close();
          }
        }}
        style={{
          width: "100%",
          padding: "8px 16px",
          marginTop: 8,
          borderRadius: 8,
          border: "1px dashed #ddd",
          background: "white",
          fontSize: 12,
          color: "#666",
          cursor: "pointer",
        }}
      >
        🎯 Заблокировать элемент
      </button>

      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        style={{
          width: "100%",
          padding: "8px 16px",
          marginTop: 8,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          fontSize: 12,
          color: "#4A90D9",
          cursor: "pointer",
        }}
      >
        Настройки
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<PopupApp />);
}
