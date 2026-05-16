import React, { useMemo } from "react";
import type { DomainPrivacyScore } from "@veil/core";

interface PrivacyApiBreakdownProps {
  score: DomainPrivacyScore;
}

export const PrivacyApiBreakdown: React.FC<PrivacyApiBreakdownProps> = ({ score }) => {
  const entries = useMemo(() => {
    return Object.entries(score.apiCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [score.apiCounts]);

  const maxCount = (entries[0]?.[1] as number | undefined) ?? 1;

  return (
    <div className="space-y-2">
      {entries.map(([api, count]) => {
        const c = count as number;
        const pct = (c / maxCount) * 100;
        return (
          <div key={api} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-32 truncate">{api}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums w-6 text-right">{count}</span>
          </div>
        );
      })}
      {entries.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-2">No API calls recorded</div>
      ) : null}
    </div>
  );
};
