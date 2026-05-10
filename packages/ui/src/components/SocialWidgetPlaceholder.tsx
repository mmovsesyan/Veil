import { useState } from "react";

type SocialNetwork = "facebook" | "twitter" | "instagram" | "linkedin" | "vkontakte";

interface SocialWidgetPlaceholderProps {
  network: SocialNetwork;
  originalUrl: string;
  onLoad: (url: string) => void;
}

const networkConfig: Record<SocialNetwork, { name: string; color: string; icon: string }> = {
  facebook: { name: "Facebook", color: "bg-blue-600", icon: "f" },
  twitter: { name: "Twitter/X", color: "bg-black", icon: "𝕏" },
  instagram: { name: "Instagram", color: "bg-gradient-to-r from-purple-500 to-pink-500", icon: "📷" },
  linkedin: { name: "LinkedIn", color: "bg-blue-700", icon: "in" },
  vkontakte: { name: "ВКонтакте", color: "bg-blue-500", icon: "VK" },
};

/**
 * Placeholder component shown when a social widget is blocked.
 * Allows one-time loading of the widget on user click.
 */
export function SocialWidgetPlaceholder({
  network,
  originalUrl,
  onLoad,
}: SocialWidgetPlaceholderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = networkConfig[network];

  const handleLoad = async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate loading with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      await fetch(originalUrl, { signal: controller.signal, mode: "no-cors" });
      clearTimeout(timeout);

      onLoad(originalUrl);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Таймаут загрузки. Попробуйте ещё раз.");
      } else {
        setError("Не удалось загрузить виджет.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center justify-center gap-3 min-h-[120px] bg-gray-50 dark:bg-gray-800"
      role="region"
      aria-label={`Заблокированный виджет ${config.name}`}
    >
      <div className={`w-10 h-10 ${config.color} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
        {config.icon}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
        Виджет <strong>{config.name}</strong> заблокирован для защиты приватности
      </p>

      {error && (
        <p className="text-xs text-red-500" role="alert">{error}</p>
      )}

      <button
        type="button"
        onClick={handleLoad}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        aria-label={`Загрузить виджет ${config.name}`}
      >
        {loading ? "Загрузка..." : "Загрузить виджет"}
      </button>
    </div>
  );
}

export type { SocialNetwork, SocialWidgetPlaceholderProps };
