import React, { useMemo } from "react";
import type { DomainPrivacyScore } from "@veil/core";
import { PrivacyScoreCard } from "./PrivacyScoreCard.js";
import { PrivacyEventFeed } from "./PrivacyEventFeed.js";
import { PrivacyApiBreakdown } from "./PrivacyApiBreakdown.js";

interface PrivacyDashboardProps {
  scores: DomainPrivacyScore[];
  onBlockDomain?: (domain: string) => void;
}

export const PrivacyDashboard: React.FC<PrivacyDashboardProps> = ({ scores, onBlockDomain }) => {
  const [selectedDomain, setSelectedDomain] = React.useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...scores].sort((a, b) => b.totalScore - a.totalScore);
  }, [scores]);

  const selected = useMemo(() => {
    return sorted.find((s) => s.domain === selectedDomain);
  }, [sorted, selectedDomain]);

  const summary = useMemo(() => {
    const total = scores.length;
    const avg = total > 0 ? scores.reduce((sum, s) => sum + s.totalScore, 0) / total : 0;
    const extreme = scores.filter((s) => s.totalScore >= 80).length;
    const high = scores.filter((s) => s.totalScore >= 50 && s.totalScore < 80).length;
    return { total, avg, extreme, high };
  }, [scores]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Privacy Budget Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tracking and fingerprinting score across visited domains
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Domains tracked" value={String(summary.total)} color="#6366F1" />
        <StatCard label="Avg score" value={summary.avg.toFixed(1)} color="#3B82F6" />
        <StatCard label="High risk" value={String(summary.high)} color="#F59E0B" />
        <StatCard label="Extreme" value={String(summary.extreme)} color="#EF4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Domain Scores</h2>
          {sorted.length === 0 && (
            <div className="text-center py-12 text-gray-400">No tracking detected yet</div>
          )}
          {sorted.map((score) => (
            <PrivacyScoreCard
              key={score.domain}
              score={score}
              onClick={() => setSelectedDomain(score.domain)}
            />
          ))}
        </div>

        <div className="space-y-4">
          {selected && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{selected.domain}</h3>
                  {onBlockDomain && (
                    <button
                      onClick={() => onBlockDomain(selected.domain)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >
                      Block domain
                    </button>
                  )}
                </div>
                <PrivacyApiBreakdown score={selected} />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Recent Events</h3>
                <PrivacyEventFeed events={selected.events.slice(-20)} />
              </div>
            </>
          )}
          {!selected && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              Select a domain to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-3">
    <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
  </div>
);
