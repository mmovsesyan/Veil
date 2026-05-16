import React, { useMemo } from "react";
import type { FingerprintingEvent } from "@veil/core";

interface PrivacyEventFeedProps {
  events: FingerprintingEvent[];
}

const API_ICONS: Record<string, string> = {
  "canvas.getImageData": "🎨",
  "canvas.toDataURL": "🎨",
  "canvas.toBlob": "🎨",
  "webgl.getParameter": "🧊",
  "audio.oscillator": "🔊",
  "audio.getFloatFrequencyData": "🔊",
  "battery.getBattery": "🔋",
  "webrtc.localDescription": "📡",
  "performance.memory": "💾",
  "deviceorientation": "📱",
  "devicemotion": "📱",
  "navigator.userAgentData": "🆔",
  "navigator.plugins": "🔌",
};

export const PrivacyEventFeed: React.FC<PrivacyEventFeedProps> = ({ events }) => {
  const reversed = useMemo(() => [...events].reverse(), [events]);

  return (
    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
      {reversed.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-4">No events recorded</div>
      )}
      {reversed.map((ev, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span className="text-base">{API_ICONS[ev.method] ?? "⚡"}</span>
          <span className="flex-1 truncate font-medium text-gray-700">{ev.method}</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {new Date(ev.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
};
