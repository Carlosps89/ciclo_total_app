'use client';

import { useSearchParams } from 'next/navigation';
import { PlazaTrendChart } from '@/components/PlazaTrendChart';
import { Suspense } from 'react';

function ChartPage() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';
  const origem = searchParams.get('origem') || undefined;

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <PlazaTrendChart terminal={terminal} origem={origem} />
    </main>
  );
}

export default function PlazaTrendPage() {
  return (
    <Suspense fallback={<div className="bg-[#0a0a0a] min-h-screen" />}>
      <ChartPage />
    </Suspense>
  );
}
