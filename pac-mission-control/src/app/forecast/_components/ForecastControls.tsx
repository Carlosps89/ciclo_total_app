'use client';

import React from 'react';
import { Settings, Clock, BarChart3, AlertCircle } from 'lucide-react';

interface Props {
  // Horizon
  daysAhead: number;
  setDaysAhead: (n: number) => void;

  // New Anticipation Logic
  anticipationRate: number; // 0..1 (float)
  setAnticipationRate: (n: number) => void;
  
  anticipationWindow: number; // hours
  setAnticipationWindow: (n: number) => void;

  onRefresh: () => void;
  loading: boolean;
}

export function ForecastControls({
    daysAhead, setDaysAhead,
    anticipationRate, setAnticipationRate,
    anticipationWindow, setAnticipationWindow,
    onRefresh, loading
}: Props) {

  // Horizon Buttons
  const horizonOptions = [
      { label: 'Hoje', val: 0 },
      { label: 'D+1', val: 1 },
      { label: 'D+2', val: 2 },
      { label: 'D+3', val: 3 },
  ];

  const getSubLabel = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return `${d.getDate()}/${d.getMonth()+1}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-black/20 p-4 rounded-xl border border-gray-800/50 backdrop-blur-sm shadow-xl">
      
      {/* 1. HORIZONTE (Botões) - Span 4 */}
      <div className="md:col-span-4 bg-gray-900/40 border border-gray-800 rounded p-3 flex flex-col justify-between shadow-sm">
         <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] uppercase text-white/70 font-bold tracking-widest">Horizonte</span>
         </div>
         <div className="grid grid-cols-4 gap-1">
             {horizonOptions.map((opt) => (
                 <button
                    key={opt.val}
                    onClick={() => setDaysAhead(opt.val)}
                    className={`flex flex-col items-center justify-center py-1.5 rounded border transition-all ${
                        daysAhead === opt.val 
                        ? 'bg-purple-600/20 border-purple-500/50 text-white shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                        : 'bg-black/40 border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                 >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[9px] opacity-60">{getSubLabel(opt.val)}</span>
                 </button>
             ))}
         </div>
      </div>

      {/* 2. ANTECIPAÇÃO (Rate + Window) - Span 6 */}
      <div className="md:col-span-6 bg-gray-900/40 border border-gray-800 rounded p-3 flex flex-col justify-between shadow-sm">
         <div className="flex items-center gap-2 mb-2">
            <Settings className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] uppercase text-white/70 font-bold tracking-widest">Antecipação (Linear)</span>
         </div>
         <div className="grid grid-cols-2 gap-4">
             {/* Rate Input */}
             <div>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400">Volume (%)</span>
                    <span className="text-xs text-blue-400 font-bold">{Math.round(anticipationRate * 100)}%</span>
                </div>
                <input 
                    type="range" 
                    min="0" max="100" step="5"
                    value={Math.round(anticipationRate * 100)}
                    onChange={(e) => setAnticipationRate(Number(e.target.value) / 100.0)}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                />
             </div>

             {/* Window Dropdown */}
             <div>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400">Janela Máx (h)</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 4, 6, 8, 12].map(h => (
                        <button
                            key={h}
                            onClick={() => setAnticipationWindow(h)}
                            className={`text-[10px] font-bold py-1 rounded border transition-colors ${
                                anticipationWindow === h 
                                ? 'bg-blue-600 border-blue-500 text-white' 
                                : 'bg-black/40 border-gray-700 text-gray-400 hover:border-gray-500'
                            }`}
                        >
                            {h}h
                        </button>
                    ))}
                </div>
             </div>
         </div>
      </div>

      {/* 3. REFRESH BUTTON - Span 2 */}
       <div className="md:col-span-2 flex items-stretch">
          <button 
             onClick={onRefresh}
             disabled={loading}
             className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-widest rounded transition flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]"
          >
             {loading ? (
                 <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>...</span>
                 </>
             ) : (
                 <>
                    <BarChart3 className="w-4 h-4" />
                    <span>Atualizar</span>
                 </>
             )}
          </button>
       </div>

    </div>
  );
}
