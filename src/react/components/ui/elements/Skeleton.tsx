/**
 * Shimmer placeholders. Showing the *shape* of the pending content beats a
 * "Loading…" line: the layout never jumps when data lands.
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Matches the footprint of a `StatTile`. */
export function SkeletonStat() {
  return (
    <div className="card flex items-center gap-4 p-4">
      <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

/** Matches the footprint of a `Card` wrapping a chart. */
export function SkeletonCard({ height = "h-56" }: { height?: string }) {
  return (
    <div className="card p-5">
      <Skeleton className="mb-4 h-3 w-32" />
      <Skeleton className={`w-full rounded-xl ${height}`} />
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-px overflow-hidden rounded-xl border border-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 bg-surface px-4 py-3.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
