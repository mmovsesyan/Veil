import React from "react";
import type { DomainPrivacyScore } from "@veil/core";

interface PrivacyScoreCardProps {
  score: DomainPrivacyScore;
  onClick?: () => void;
}

const COLORS: Record<string, string> = {
  low: "#10B981", // green
  medium: "#F59E0B", // amber
  high: "#EF4444", // red
  extreme: "#7C3AED", // purple
};

function getLevel(score: number): string {
  if (score < 20) return "low";
  if (score < 50) return "medium";
  if (score < 80) return "high";
  return "extreme";
}

function getLabel(score: number): string {
  if (score < 20) return "Clean";
  if (score < 50) return "Some tracking";
  if (score < 80) return "Heavy tracking";
  return "Extreme fingerprinting";
}

export const PrivacyScoreCard: React.FC<PrivacyScoreCardProps> = ({ score, onClick }) => {
  const level = getLevel(score.totalScore);
  const color = COLORS[level]!;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl border border-gray-200 bg-white hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900 truncate max-w-[60%]">{score.domain}</span>
        <span className="text-sm font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>
          {getLabel(score.totalScore)}
        </span>
      </div>

      <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${score.totalScore}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>Score: {score.totalScore.toFixed(1)}/100</span>
        <span>{score.events.length} events</span>
      </div>
    </button>
  );
};
