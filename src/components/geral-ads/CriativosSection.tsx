import React, { lazy, Suspense } from 'react';
import { FileImage } from 'lucide-react';
import { SkeletonCard } from '@/components/dashboard/SkeletonCard';

// Reuse the full Criativos page but strip the h1 via a wrapper
const CriativosPage = lazy(() => import('@/pages/Criativos'));

export default function CriativosSection() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileImage className="h-4 w-4 text-primary" />
        Criativos
      </h3>
      <Suspense fallback={<div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}>
        <CriativosPage embedded />
      </Suspense>
    </div>
  );
}
