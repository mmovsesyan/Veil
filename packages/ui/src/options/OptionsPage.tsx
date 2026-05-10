import { useState } from "react";
import { Card } from "../components/Card.js";
import { Toggle } from "../components/Toggle.js";

interface FilterListItem {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  rulesCount: number;
}

interface OptionsPageProps {
  filterLists: FilterListItem[];
  whitelist: string[];
  onFilterToggle: (id: string, enabled: boolean) => void;
  onWhitelistAdd: (domain: string) => void;
  onWhitelistRemove: (domain: string) => void;
}

/**
 * Extension options/settings page.
 * Manages filter lists, whitelist, and custom rules.
 */
export function OptionsPage({
  filterLists,
  whitelist,
  onFilterToggle,
  onWhitelistAdd,
  onWhitelistRemove,
}: OptionsPageProps) {
  const [activeTab, setActiveTab] = useState<"filters" | "whitelist" | "custom">("filters");
  const [newDomain, setNewDomain] = useState("");

  const handleAddDomain = () => {
    if (newDomain.trim()) {
      onWhitelistAdd(newDomain.trim());
      setNewDomain("");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

      <nav className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
        {(["filters", "whitelist", "custom"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === "filters" && (
        <div className="space-y-3">
          {filterLists.map((list) => (
            <Card key={list.id}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{list.name}</h3>
                  <p className="text-sm text-gray-500">
                    {list.category} · {list.rulesCount.toLocaleString()} rules
                  </p>
                </div>
                <Toggle
                  checked={list.enabled}
                  onChange={(enabled) => onFilterToggle(list.id, enabled)}
                  label={`Toggle ${list.name}`}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "whitelist" && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
              placeholder="example.com"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
              aria-label="Domain to whitelist"
            />
            <button
              type="button"
              onClick={handleAddDomain}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600"
            >
              Add
            </button>
          </div>
          <ul className="space-y-2">
            {whitelist.map((domain) => (
              <li key={domain} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm">{domain}</span>
                <button
                  type="button"
                  onClick={() => onWhitelistRemove(domain)}
                  className="text-red-500 text-sm hover:text-red-700"
                  aria-label={`Remove ${domain} from whitelist`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === "custom" && (
        <div>
          <textarea
            className="w-full h-64 p-3 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded-lg"
            placeholder="Enter custom rules, one per line..."
            aria-label="Custom blocking rules"
          />
        </div>
      )}
    </div>
  );
}
