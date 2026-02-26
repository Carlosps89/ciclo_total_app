'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ForecastControls } from './_components/ForecastControls';
import { ForecastChartArrivals } from './_components/ForecastChartArrivals';
import { ForecastDrilldownDrawer } from './_components/ForecastDrilldownDrawer';

export default function ForecastPage() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Carregando...</div>}>
       <ForecastContent />
    </Suspense>
  );
}

function ForecastContent() {
  // --- STATE ---
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  
  // Params
  const [daysAhead, setDaysAhead] = useState(0); // Default D=0 (Hoje)
  
  // New Logic Params
  const [anticipationRate, setAnticipationRate] = useState(0.0); // 0%
  const [anticipationWindow, setAnticipationWindow] = useState(6); // 6h default

  // Drilldown
  const [selectedHourIndex, setSelectedHourIndex] = useState<number | null>(null);

  // --- FETCH MAIN FORECAST ---
  const fetchData = async () => {
      setLoading(true);
      setData(null);
      setSelectedHourIndex(null);
      
      try {
          const params = new URLSearchParams();
          params.set('terminal', 'TRO');
          params.set('days_ahead', daysAhead.toString());
          
          // New Params
          const rateVal = Math.round(anticipationRate * 100);
          params.set('anticipation_rate', rateVal.toString());
          params.set('anticipation_window', anticipationWindow.toString());

          const res = await fetch(`/api/pac/forecast?${params.toString()}`);
          const json = await res.json();
          
          if (json.ok) {
              setData(json);
          } else {
              console.error("Forecast API Error:", json);
          }
      } catch (err) {
          console.error("Fetch Error:", err);
      } finally {
          setLoading(false);
      }
  };

  // Fetch on mount and when params change
  useEffect(() => {
     fetchData();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysAhead, anticipationRate, anticipationWindow]); 

  // Derived
  const dateLabel = useMemo(() => {
      if (!data?.date) return '...';
      const [y, m, d] = data.date.split('-');
      // format "D (dd/mm)"
      const suffix = daysAhead === 0 ? 'D' : `D+${daysAhead}`;
      return `${suffix} (${d}/${m})`;
  }, [data, daysAhead]);

  // Construct drilldown target
  // We need full timestamp for the drawer.
  // The API expects 'YYYY-MM-DD HH:00:00'.
  // data.date is 'YYYY-MM-DD'
  // data.hours[index] is 'HH'
  const drilldownTarget = useMemo(() => {
      if (selectedHourIndex === null || !data) return '';
      return `${data.date} ${data.hours[selectedHourIndex]}:00:00`;
  }, [data, selectedHourIndex]);

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 p-4 font-sans selection:bg-purple-500/30 overflow-hidden flex flex-col gap-4 max-w-[100vw] overflow-x-hidden">
      {/* HEADER */}
      <header className="flex justify-between items-center border-b border-gray-800 pb-2 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-gray-800 rounded-full transition text-white/70 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-3">
               <span className="text-purple-400">PROJEÇÃO DE CHEGADAS</span>
            </h1>
            <p className="text-white/60 text-xs mt-0.5 uppercase tracking-widest font-sans">
               Terminal TRO • {data?.date ? new Date(data.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day:'numeric', month:'long' }) : '...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
        </div>
      </header>

      {/* CONTROLS */}
      <ForecastControls 
         daysAhead={daysAhead}
         setDaysAhead={setDaysAhead}

         anticipationRate={anticipationRate}
         setAnticipationRate={setAnticipationRate}

         anticipationWindow={anticipationWindow}
         setAnticipationWindow={setAnticipationWindow}

         onRefresh={fetchData}
         loading={loading}
      />

      {/* CONTENT GRID */}
      <div className="flex-1 grid gap-4 min-h-0 grid-cols-1 md:grid-cols-12">
          {/* MAIN CHART (Full Width 12/12) */}
          <div className="col-span-12 flex flex-col min-h-0 h-full border border-gray-800 rounded bg-gray-900/10 p-4 relative">
             {(!data || loading) && !data ? (
                 <div className="flex-1 flex items-center justify-center">
                    <span className="text-white/30 animate-pulse uppercase tracking-widest text-xs">Carregando dados...</span>
                 </div>
             ) : (
                 <ForecastChartArrivals 
                    hours={data.hours}
                    programmed={data.series.programmed}
                    predicted={data.series.predicted}
                    totals={data.totals}
                    dateLabel={dateLabel}
                    onBarClick={setSelectedHourIndex} 
                />
             )}
          </div>
      </div>

      {/* FIXED DRAWER FOR DRILLDOWN */}
      <ForecastDrilldownDrawer 
          isOpen={selectedHourIndex !== null}
          onClose={() => setSelectedHourIndex(null)}
          terminal="TRO"
          targetHour={drilldownTarget}
      />
    </div>
  );
}
