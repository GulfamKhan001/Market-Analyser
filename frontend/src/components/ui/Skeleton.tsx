export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-800 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonChart({ height = "h-64" }: { height?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
      <Skeleton className="h-3 w-24 mb-2" />
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function SkeletonScoreBar() {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-10" />
      </div>
      <Skeleton className="h-2 w-full" />
    </div>
  );
}

export function SkeletonRegimeGrid() {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
