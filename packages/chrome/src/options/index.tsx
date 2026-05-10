import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";

interface FilterListItem {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  rulesCount: number;
}

function OptionsApp() {
  const [tab, setTab] = useState<"filters" | "whitelist" | "custom">("filters");
  const [filterLists, setFilterLists] = useState<FilterListItem[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [customRules, setCustomRules] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const listsResp = await chrome.runtime.sendMessage({ type: "GET_FILTER_LISTS" });
      if (listsResp?.lists) {
        setFilterLists(listsResp.lists.map((l: any) => ({
          ...l,
          rulesCount: l.rulesCount ?? 0,
          enabled: l.enabled ?? false,
        })));
      }

      const wlResp = await chrome.runtime.sendMessage({ type: "GET_WHITELIST" });
      if (wlResp?.whitelist) setWhitelist(wlResp.whitelist);
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  }

  async function toggleFilter(id: string, enabled: boolean) {
    await chrome.runtime.sendMessage({
      type: "TOGGLE_FILTER_LIST",
      payload: { listId: id, enabled },
    });
    setFilterLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled } : l))
    );
  }

  async function addToWhitelist() {
    const domain = newDomain.trim();
    if (!domain) return;
    await chrome.runtime.sendMessage({ type: "ADD_TO_WHITELIST", payload: domain });
    setWhitelist((prev) => [...prev, domain]);
    setNewDomain("");
  }

  async function removeFromWhitelist(domain: string) {
    await chrome.runtime.sendMessage({ type: "REMOVE_FROM_WHITELIST", payload: domain });
    setWhitelist((prev) => prev.filter((d) => d !== domain));
  }

  async function saveCustomRules() {
    const lines = customRules.split("\n").filter((l) => l.trim());
    let added = 0;
    for (const line of lines) {
      const resp = await chrome.runtime.sendMessage({ type: "ADD_CUSTOM_RULE", payload: line });
      if (resp?.success) added++;
    }
    setSaveStatus(`Добавлено ${added} правил`);
    setTimeout(() => setSaveStatus(""), 3000);
  }

  const styles = {
    container: { maxWidth: 700, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" },
    tabs: { display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 24 },
    tab: (active: boolean) => ({
      padding: "8px 16px",
      border: "none",
      borderBottom: active ? "2px solid #4A90D9" : "2px solid transparent",
      background: "none",
      color: active ? "#4A90D9" : "#666",
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
      fontSize: 14,
    }),
    card: { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8 },
    toggle: (on: boolean) => ({
      width: 40, height: 22, borderRadius: 11, border: "none",
      background: on ? "#4A90D9" : "#ccc", cursor: "pointer", position: "relative" as const,
    }),
    toggleDot: (on: boolean) => ({
      width: 16, height: 16, borderRadius: 8, background: "white",
      position: "absolute" as const, top: 3, left: on ? 21 : 3, transition: "left 0.2s",
    }),
  };

  return (
    <div style={styles.container}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Content Blocker — Настройки</h1>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === "filters")} onClick={() => setTab("filters")}>Фильтры</button>
        <button style={styles.tab(tab === "whitelist")} onClick={() => setTab("whitelist")}>Белый список</button>
        <button style={styles.tab(tab === "custom")} onClick={() => setTab("custom")}>Свои правила</button>
      </div>

      {tab === "filters" && (
        <div>
          {filterLists.map((list) => (
            <div key={list.id} style={{ ...styles.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{list.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {list.category} · {(list.rulesCount ?? 0).toLocaleString()} правил
                </div>
              </div>
              <button
                style={styles.toggle(list.enabled)}
                onClick={() => toggleFilter(list.id, !list.enabled)}
                aria-label={`Toggle ${list.name}`}
              >
                <div style={styles.toggleDot(list.enabled)} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "whitelist" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addToWhitelist()}
              placeholder="example.com"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
            />
            <button
              onClick={addToWhitelist}
              style={{ padding: "8px 16px", background: "#4A90D9", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              Добавить
            </button>
          </div>
          {whitelist.length === 0 && (
            <p style={{ color: "#888", fontSize: 14 }}>Белый список пуст</p>
          )}
          {whitelist.map((domain) => (
            <div key={domain} style={{ ...styles.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontFamily: "monospace" }}>{domain}</span>
              <button
                onClick={() => removeFromWhitelist(domain)}
                style={{ border: "none", background: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13 }}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "custom" && (
        <div>
          <textarea
            value={customRules}
            onChange={(e) => setCustomRules(e.target.value)}
            placeholder={"||ads.example.com^\n##.ad-banner\n@@||safe.com^"}
            style={{
              width: "100%", height: 200, padding: 12, border: "1px solid #ddd",
              borderRadius: 8, fontFamily: "monospace", fontSize: 13, resize: "vertical",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <button
              onClick={saveCustomRules}
              style={{ padding: "8px 16px", background: "#4A90D9", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              Сохранить правила
            </button>
            {saveStatus && <span style={{ fontSize: 13, color: "#22c55e" }}>{saveStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<OptionsApp />);
}
