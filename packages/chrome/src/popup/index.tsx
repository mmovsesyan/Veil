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
    const response = await chrome.runtime.sendMessage({ type: "TOGGLE_ENABLED" });
    setEnabled(response?.enabled ?? !enabled);
  };

  const handleWhitelist = async () => {
    if (!domain) return;
    await chrome.runtime.sendMessage({ type: "ADD_TO_WHITELIST", payload: domain });
    // Reload current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.reload(tab.id);
    }
    window.close();
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
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Content Blocker</h1>
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
        background: "#f5f5f5",
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#4A90D9" }}>
          {blocked}
        </div>
        <div style={{ fontSize: 12, color: "#666" }}>
          заблокировано на этой странице
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#888", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {domain || "—"}
      </div>

      <button
        onClick={handleWhitelist}
        disabled={!domain}
        style={{
          width: "100%",
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #ddd",
          background: "white",
          fontSize: 13,
          cursor: domain ? "pointer" : "not-allowed",
          opacity: domain ? 1 : 0.5,
        }}
      >
        Отключить для этого сайта
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
