'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface HeatmapData {
  hours: string[];
  origins: string[];
  matrix: number[][]; // [originIndex][hourIndex]
  volume_matrix: number[][];
}

import { createPortal } from "react-dom";

type TooltipState =
  | { open: false }
  | { open: true; x: number; y: number; content: React.ReactNode };

const TOOLTIP_OFFSET = 14;

function HeatmapTooltip({ state }: { state: TooltipState }) {
  if (!state.open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-9999 pointer-events-none"
      style={{
        left: state.x + TOOLTIP_OFFSET,
        top: state.y + TOOLTIP_OFFSET,
      }}
    >
      <div className="rounded-lg border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur">
        {state.content}
      </div>
    </div>,
    document.body
  );
}

export function OriginHourHeatmap({ terminal, date, produto, praca }: { terminal: string, date?: string, produto?: string, praca?: string }) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState>({ open: false });

  const fetchData = async () => {
    setLoading(true);
    try {
        const dParam = date ? `&date=${date}` : '';
        const pParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
        const prParam = praca ? `&praca=${encodeURIComponent(praca)}` : '';
        const res = await fetch(`/api/pac/origens/heatmap?terminal=${terminal}${dParam}${pParam}${prParam}&top=20`);
        if(res.ok) {
            setData(await res.json());
        }
    } catch(e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, date, produto, praca]);

  const handleMouseEnter = (e: React.MouseEvent, origin: string, hour: string, avg: number, vol: number) => {
      setTooltip({
          open: true,
          x: e.clientX,
          y: e.clientY,
          content: (
              <div>
                  <div className="text-white font-bold text-xs">{origin}</div>
                  <div className="text-xs text-blue-300 font-bold">{hour}h</div>
                  <div className="mt-1 text-[10px] text-white/80">
                      <div>Média: <span className="text-white font-mono">{avg.toFixed(1)}h</span></div>
                      <div>Vol: <span className="text-white font-mono">{vol}</span></div>
                  </div>
              </div>
          )
      });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      setTooltip(prev => prev.open ? { ...prev, x: e.clientX, y: e.clientY } : prev);
  };

  const handleMouseLeave = () => {
      setTooltip({ open: false });
  };

  if (loading) {
      return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-green-500" /></div>;
  }

  if (!data || data.origins.length === 0) {
      return <div className="text-white/50 text-sm h-32 flex items-center justify-center italic">Sem dados para o período.</div>;
  }



  return (
    <div className="flex flex-col overflow-hidden">
        <HeatmapTooltip state={tooltip} />
        
        {/* Header (Hours) */}
        <div className="flex">
            <div className="w-32 shrink-0"></div> {/* Origin Label Col */}
            <div className="flex-1 grid grid-cols-24 gap-px">
                {data.hours.map(h => (
                    <div key={h} className="text-[9px] text-white/50 text-center">{h}</div>
                ))}
            </div>
        </div>
        
        {/* Rows */}
        <div className="flex-col gap-1 mt-1 overflow-y-auto max-h-[600px] custom-scrollbar">
            {data.origins.map((origin, i) => (
                <div key={origin} className="flex items-center hover:bg-white/5 transition rounded-sm p-0.5">
                    {/* Y Label */}
                    <div className="w-32 shrink-0 text-[10px] text-white/90 font-bold truncate pr-2 text-right" title={origin}>
                        {origin}
                    </div>
                    
                    {/* Grid */}
                    <div className="flex-1 grid grid-cols-24 gap-px h-6">
                        {data.matrix[i].map((avg, j) => {
                            const vol = data.volume_matrix[i][j];
                            const colorClass = vol === 0 ? 'bg-gray-800/50' : 
                                               avg < 24 ? 'bg-green-500/80 hover:bg-green-400' : 
                                               avg < 48 ? 'bg-yellow-500/80 hover:bg-yellow-400' : 
                                               'bg-red-500/80 hover:bg-red-400';

                            return (
                                <div 
                                   key={j} 
                                   className={`h-full rounded-sm transition cursor-default relative ${colorClass}`}
                                   onMouseEnter={(e) => handleMouseEnter(e, origin, data.hours[j], avg, vol)}
                                   onMouseMove={handleMouseMove}
                                   onMouseLeave={handleMouseLeave}
                                >
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
        
        {/* Legend */}
        <div className="flex justify-end items-center gap-4 mt-2 text-[10px] text-white/50">
            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500/80 rounded-sm"></div> &lt; 24h</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500/80 rounded-sm"></div> 24-48h</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/80 rounded-sm"></div> &gt; 48h</div>
        </div>
    </div>
  );
}
