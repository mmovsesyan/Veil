import { useState } from "react";
import { Badge } from "../components/Badge.js";
import { Toggle } from "../components/Toggle.js";

interface PopupProps {
  domain: string;
  blockedCount: number;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onWhitelistToggle: (domain: string) => void;
}

/**
 * Extension popup component.
 * Shows blocking status, count, and quick controls.
 */
export function Popup({
  domain,
  blockedCount,
  isEnabled,
  onToggle,
  onWhitelistToggle,
}: PopupProps) {
  const [enabled, setEnabled] = useState(isEnabled);

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    onToggle(value);
  };

  return (
    <div className="w-80 p-4 bg-white dark:bg-gray-900">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Content Blocker
        </h1>
        <Toggle checked={enabled} onChange={handleToggle} label="Enable blocking" />
      </header>

      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Blocked on this page</span>
          <Badge count={blockedCount} />
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{domain}</p>
      </div>

      <button
        type="button"
        onClick={() => onWhitelistToggle(domain)}
        className="w-full py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label={`Disable blocking for ${domain}`}
      >
        Disable for this site
      </button>
    </div>
  );
}
