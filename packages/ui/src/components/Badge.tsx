interface BadgeProps {
  count: number;
}

/**
 * Badge component showing a count (e.g., blocked items).
 */
export function Badge({ count }: BadgeProps) {
  const displayCount = count > 999 ? "999+" : count.toString();

  return (
    <span
      className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full min-w-[1.5rem]"
      aria-label={`${count} items blocked`}
    >
      {displayCount}
    </span>
  );
}
