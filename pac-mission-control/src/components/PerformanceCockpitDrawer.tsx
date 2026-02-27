'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, Zap, Loader2, Gauge } from 'lucide-react';
import clsx from 'clsx';

interface PerformanceData {
    summary: {
        avg_h: number;
        total_volume: number;
        target_volume: number;
        best_case: number;
        meta: number;
    };
    pracas: {
        name: string;
        avg_h: number;
        best_case: number;
        volume: number;
    }[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    terminal: string;
    produto?: string;
}

export function PerformanceCockpitDrawer({ open, onClose, terminal, produto }: Props) {
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) {
            setData(null);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const pParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
                const res = await fetch(`/api/pac/performance/monthly?terminal=${terminal}${pParam}`);
                const json = await res.json();
                setData(json);
            } catch (err) {
                console.error("Error fetching performance:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [open, terminal, produto]);

    if (!open) return null;

    const summary = data?.summary;
    const meta = summary?.meta || 40;
    const real = summary?.avg_h || 0;
    const gap = Math.max(0, real - meta);
    const atingimento = real > 0 ? (meta / real) * 100 : 0;
    
    // Scale for speedometer (0 to 180 degrees)
    // 0h is 100% (green), 80h is 0% (red)? 
    // Let's say: Meta 40h is center (90deg). 20h is 0deg (Left/Green). 60h is 180deg (Right/Red).
    const needleRotation = Math.min(Math.max(((real - 20) / 40) * 180, 0), 180);

    return (
        <div className="fixed inset-0 z-[110] flex justify-end">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in" 
                onClick={onClose}
            />
            
            <div className="relative w-full max-w-xl bg-[#0a0a0a] border-l border-gray-800 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden">
                {/* Header */}
                <header className="px-6 py-6 border-b border-gray-800 flex justify-between items-center shrink-0 bg-gray-900/40">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Gauge className="w-5 h-5 text-blue-500" />
                            <h2 className="text-xl font-black text-white tracking-tighter uppercase italic">Cockpit Premium</h2>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Análise Mensal de Performance • Ciclo 40h</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition text-gray-400">
                        <X className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Processando Athena Data...</p>
                        </div>
                    ) : (
                        <>
                            {/* SPEEDOMETER SECTION */}
                            <section className="bg-gray-900/30 border border-gray-800 rounded-3xl p-8 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Zap className="w-24 h-24 text-blue-500" />
                                </div>

                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Atingimento Global (Mês)</span>
                                    
                                    {/* SVG Speedometer */}
                                    <div className="relative w-64 h-32 mb-4">
                                        <svg viewBox="0 0 100 50" className="w-full h-full">
                                            <defs>
                                                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#22c55e" />
                                                    <stop offset="50%" stopColor="#eab308" />
                                                    <stop offset="100%" stopColor="#ef4444" />
                                                </linearGradient>
                                            </defs>
                                            <path 
                                                d="M 10 45 A 40 40 0 0 1 90 45" 
                                                fill="none" 
                                                stroke="#1a1a1a" 
                                                strokeWidth="8" 
                                                strokeLinecap="round" 
                                            />
                                            <path 
                                                d="M 10 45 A 40 40 0 0 1 90 45" 
                                                fill="none" 
                                                stroke="url(#gaugeGradient)" 
                                                strokeWidth="8" 
                                                strokeLinecap="round" 
                                                strokeDasharray="125" 
                                                strokeDashoffset="0"
                                            />
                                            {/* Needle */}
                                            <line 
                                                x1="50" y1="45" x2="50" y2="10" 
                                                stroke="white" 
                                                strokeWidth="2" 
                                                strokeLinecap="round"
                                                style={{ transform: `rotate(${needleRotation - 90}deg)`, transformOrigin: '50px 45px', transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                                            />
                                            <circle cx="50" cy="45" r="4" fill="white" />
                                        </svg>
                                        
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-4 text-center">
                                           <div className="text-3xl font-black text-white leading-none">{real.toFixed(1)}h</div>
                                           <div className={clsx("text-[9px] font-bold uppercase mt-1", atingimento >= 100 ? "text-green-500" : "text-yellow-500")}>
                                              {atingimento.toFixed(1)}% Meta
                                           </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-gray-800/50">
                                    <div>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Gap de Oportunidade</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className={clsx("text-xl font-black", gap > 0 ? "text-red-400" : "text-green-400")}>
                                                {gap > 0 ? `+${gap.toFixed(1)}h` : 'Meta Atingida'}
                                            </span>
                                            {gap > 0 && <span className="text-[9px] text-gray-500 uppercase font-bold italic">Acima da Meta</span>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Volume Mensal (Qtd)</p>
                                        <div className="flex items-center justify-end gap-3">
                                            <div>
                                                <div className="text-sm font-black text-green-500 leading-none">{summary?.target_volume}</div>
                                                <div className="text-[7px] font-black text-gray-500 uppercase">Abaixo 40h</div>
                                            </div>
                                            <div className="h-6 w-px bg-gray-800" />
                                            <div>
                                                <div className="text-sm font-black text-red-500 leading-none">{(summary?.total_volume || 0) - (summary?.target_volume || 0)}</div>
                                                <div className="text-[7px] font-black text-gray-500 uppercase">Acima 40h</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* PRAÇAS GRID */}
                            <section>
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <Trophy className="w-4 h-4 text-yellow-500" />
                                        Diagnóstico por Praças
                                    </h3>
                                    <span className="text-[9px] text-gray-500 font-bold uppercase italic">Real vs Best Case</span>
                                </div>
                                <div className="space-y-4">
                                    {data?.pracas.map((p, i) => {
                                        const pGap = Math.max(0, p.avg_h - p.best_case);
                                        return (
                                            <div key={i} className="bg-gray-900/20 border border-gray-800 rounded-2xl p-4 hover:border-blue-500/30 transition-all group overflow-hidden relative">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="text-xs font-black text-white uppercase group-hover:text-blue-400 transition-colors tracking-tight">{p.name}</div>
                                                        <div className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">{p.volume} Veículos no mês</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-black text-white">{p.avg_h.toFixed(1)}h</div>
                                                        {pGap > 0 && <div className="text-[8px] font-black text-red-500/80 uppercase">GAP {pGap.toFixed(1)}h</div>}
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-1.5 relative z-10">
                                                    {/* Real Bar */}
                                                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000" 
                                                            style={{ width: `${Math.min((p.avg_h / 80) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                    {/* Best Case Bar */}
                                                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden opacity-40">
                                                        <div 
                                                            className="h-full bg-green-500 transition-all duration-1000" 
                                                            style={{ width: `${Math.min((p.best_case / 80) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* Footer Meta */}
                <footer className="p-4 border-t border-gray-800 text-center bg-black">
                    <p className="text-[8px] text-gray-700 font-black uppercase tracking-[0.5em]">Vision Premium Analysis • v3.2</p>
                </footer>
            </div>
        </div>
    );
}
