import { cx } from "@/components/ui";

export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 1;
  const full = used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted" data-testid={`usage-${label.toLowerCase()}`}>
          {used} / {limit}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div
          className={cx("h-full rounded-full", full ? "bg-danger" : "bg-accent")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
