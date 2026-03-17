import React from 'react';

export const SkeletonCard = React.memo(function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg animate-skeleton" />
        <div className="space-y-2">
          <div className="h-3 w-20 rounded animate-skeleton" />
          <div className="h-6 w-28 rounded animate-skeleton" />
        </div>
      </div>
      <div className="mt-2 h-3 w-32 rounded animate-skeleton" />
    </div>
  );
});

export const SkeletonTable = React.memo(function SkeletonTable() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="h-10 bg-table-header animate-skeleton" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-4 p-3 border-b border-border">
          <div className="h-4 w-8 rounded animate-skeleton" />
          <div className={`h-4 rounded animate-skeleton`} style={{ width: `${Math.random() * 30 + 20}%` }} />
          <div className="h-4 w-16 rounded animate-skeleton ml-auto" />
          <div className="h-4 w-16 rounded animate-skeleton" />
          <div className="h-4 w-12 rounded animate-skeleton" />
        </div>
      ))}
    </div>
  );
});

export const SkeletonChart = React.memo(function SkeletonChart() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="h-4 w-32 rounded animate-skeleton mb-4" />
      <div className="h-[250px] rounded animate-skeleton" />
    </div>
  );
});
