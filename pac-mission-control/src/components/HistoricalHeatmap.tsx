'use client';

import { useEffect, useState, useCallback, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { createPortal } from "react-dom";

interface HeatmapItem {
  day: string;
  hour: number;
  ciclo_medio: number;
  volume: number;
}

interface HistoricalHeatmapProps {
    terminal: string;
    startDate: string;
    endDate: string;
    produto?: string;
    praca?: string;
    onCellClick?: (date: string, hour: number) => void;
}

const TOOLTIP_OFFSET = 14;

function HeatmapTooltip({ x, y, content }: { x: number, y: number, content: ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-9999 pointer-events-none"
      style={{
        left: x + TOOLTIP_OFFSET,
        top: y + TOOLTIP_OFFSET,
      }}
    >
      <div className="rounded-lg border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur">
        {content}
      </div>
    </div>,
    document.body
  );
}

export function HistoricalHeatmap({ 
  terminal, 
  startDate, 
  endDate, 
  produto, 
  praca,
  onCellClick
}: HistoricalHeatmapProps) {
  const [matrix, setMatrix] = useState<(HeatmapItem | null)[][]>(Array(24).fill(null).map(() => []));
  const [days, setDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, content: ReactNode } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
        const prodParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
        const pracaParam = praca ? `&praca=${encodeURIComponent(praca)}` : '';
        const res = await fetch(`/api/pac/historico/heatmap?terminal=${terminal}&startDate=${startDate}&endDate=${endDate}${prodParam}${pracaParam}`);
        if(res.ok) {
            const json = await res.json();
            const rawData: HeatmapItem[] = Array.isArray(json.data) ? json.data : [];
            
            const uniqueDays = Array.from(new Set(rawData.map(item => item?.day))).filter(Boolean).sort() as string[];
            const m: (HeatmapItem | null)[][] = Array.from({ length: 24 }, () => 
              Array.from({ length: uniqueDays.length }, () => null)
            );
            
            rawData.forEach(item => {
              if (!item) return;
              const dayIdx = uniqueDays.indexOf(item.day);
              if (dayIdx !== -1 && item.hour >= 0 && item.hour < 24) {
                m[item.hour][dayIdx] = item;
              }
            });
            
            setMatrix(m);
            setDays(uniqueDays);
        }
    } catch(e) {
        console.error("Heatmap fetch error:", e);
    } finally {
        setLoading(false);
    }
  }, [terminal, startDate, endDate, produto, praca]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMouseEnter = (e: React.MouseEvent, item: HeatmapItem) => {
      const parts = (item?.day || '').split('-');
      const [, m, d] = parts.length >= 3 ? parts : ['', '', item.day];
      setTooltip({
          x: e.clientX,
          y: e.clientY,
          content: (
              <div className="flex flex-col gap-1 min-w-[100px]">
                  <div className="flex justify-between items-center border-b border-white/10 pb-1 mb-1">
                    <span className="font-bold text-white">{d}/{m}</span>
                    <span className="text-blue-400 font-bold">{item.hour.toString().padStart(2, '0')}h</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Média:</span>
                    <span className="font-mono text-white font-bold">
                        {typeof item.ciclo_medio === 'number' ? item.ciclo_medio.toFixed(1) : item.ciclo_medio}h
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Volume:</span>
                    <span className="font-mono text-white font-bold">{item.volume}</span>
                  </div>
                  <div className="mt-1 text-[8px] text-blue-400 font-bold uppercase text-center border-t border-white/5 pt-1">
                    Clique para detalhes
                  </div>
              </div>
          )
      });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (tooltip) {
          setTooltip({ ...tooltip, x: e.clientX, y: e.clientY });
      }
  };

  const handleMouseLeave = () => setTooltip(null);

  const getColorClass = (item: HeatmapItem | null) => {
    if (!item || item.volume === 0) return 'bg-gray-800/20';
    const avg = item.ciclo_medio;
    if (avg < 40) return 'bg-emerald-500/80 hover:bg-emerald-400';
    if (avg <= 46.5) return 'bg-green-500/80 hover:bg-green-400';
    if (avg < 55) return 'bg-orange-500/80 hover:bg-orange-400';
    return 'bg-red-500/80 hover:bg-red-400';
  };

  if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3 bg-gray-900/10 rounded-xl border border-gray-800/50">
          <Loader2 className="animate-spin text-blue-500" />
          <span className="text-xs text-white/50 animate-pulse">Cruzando dados históricos...</span>
        </div>
      );
  }

  if (days.length === 0) {
      return <div className="text-white/40 text-sm h-48 flex items-center justify-center italic bg-gray-900/10 rounded-xl border border-gray-800/50">Nenhum dado encontrado para o período e filtros selecionados.</div>;
  }

  return (
    <div className="flex flex-col bg-gray-900/20 p-4 rounded-xl border border-gray-800/50 overflow-hidden">
        {tooltip && <HeatmapTooltip {...tooltip} />}
        
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] uppercase font-bold text-white/90 tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_#3b82f6]" />
            Heatmap Ciclo Médio (Horas x Dias)
          </h3>
          <div className="flex items-center gap-3 text-[9px] text-white/40 font-bold uppercase tracking-tighter">
             <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500/80 rounded-sm"></div> Premium (&lt;40h)</div>
             <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500/80 rounded-sm"></div> Na Meta (&lt;46.5h)</div>
             <div className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-500/80 rounded-sm"></div> Alerta (47-55h)</div>
             <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/80 rounded-sm"></div> Crítico (&gt;55h)</div>
          </div>
        </div>

        <div className="flex flex-col min-w-0">
            {/* Days Header */}
            <div className="flex mb-1">
                <div className="w-12 shrink-0"></div>
                <div className="flex-1 flex gap-[2px]">
                    {days.map((day) => {
                      let d = day;
                      try {
                        const parts = day.split('-');
                        d = parts.length >= 3 ? parts[2] : day;
                      } catch { d = day; }
                      return (
                        <div key={day} className="flex-1 text-[10px] text-white/70 text-center font-bold font-mono uppercase tracking-tighter">
                          {d}
                        </div>
                      );
                    })}
                </div>
            </div>
            
            {/* Grid Rows (Hours) */}
            <div className="flex flex-col gap-[2px] mt-1">
                {matrix.map((row, h) => (
                    <div key={h} className="flex items-center group/row">
                        {/* Hour Label */}
                        <div className="w-12 shrink-0 text-[11px] text-white/80 font-black font-mono text-right pr-3 group-hover/row:text-blue-400 transition-colors uppercase">
                            {h.toString().padStart(2, '0')}h
                        </div>
                        
                        {/* Day Columns */}
                        <div className="flex-1 flex gap-[2px] h-6">
                            {row.map((item, dIdx) => (
                                <div 
                                   key={dIdx} 
                                   className={`flex-1 rounded-sm transition-all duration-200 cursor-pointer border border-black/20 hover:border-white/40 ${getColorClass(item)}`}
                                   onMouseEnter={(e) => item && handleMouseEnter(e, item)}
                                   onMouseMove={handleMouseMove}
                                   onMouseLeave={handleMouseLeave}
                                   onClick={() => item && onCellClick?.(item.day, h)}
                                >
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}
