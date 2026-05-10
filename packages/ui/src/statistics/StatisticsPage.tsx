interface DailyStatItem {
  date: string;
  totalBlocked: number;
  byCategory: Record<string, number>;
}

interface StatisticsPageProps {
  dailyStats: DailyStatItem[];
  totalBlocked: number;
  topDomains: { domain: string; count: number }[];
}

/**
 * Statistics page showing blocking data over time.
 */
export function StatisticsPage({ dailyStats, totalBlocked, topDomains }: StatisticsPageProps) {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Statistics</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">Total Blocked</p>
          <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
            {totalBlocked.toLocaleString()}
          </p>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm text-green-600 dark:text-green-400">Today</p>
          <p className="text-3xl font-bold text-green-700 dark:text-green-300">
            {(dailyStats[dailyStats.length - 1]?.totalBlocked ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <p className="text-sm text-purple-600 dark:text-purple-400">Days Tracked</p>
          <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">
            {dailyStats.length}
          </p>
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Blocking History</h2>
        <div className="h-48 flex items-end gap-1">
          {dailyStats.slice(-30).map((day) => {
            const maxBlocked = Math.max(...dailyStats.map((d) => d.totalBlocked), 1);
            const height = (day.totalBlocked / maxBlocked) * 100;
            return (
              <div
                key={day.date}
                className="flex-1 bg-blue-500 rounded-t"
                style={{ height: `${height}%` }}
                title={`${day.date}: ${day.totalBlocked} blocked`}
                role="img"
                aria-label={`${day.date}: ${day.totalBlocked} blocked`}
              />
            );
          })}
        </div>
      </div>

      {/* Top domains */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Top Blocked Domains</h2>
        <ul className="space-y-2">
          {topDomains.slice(0, 10).map(({ domain, count }) => (
            <li key={domain} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <span className="text-sm font-mono">{domain}</span>
              <span className="text-sm text-gray-500">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
