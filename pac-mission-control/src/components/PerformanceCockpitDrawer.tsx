'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, Loader2, Gauge, ChevronDown, ChevronUp, MousePointer2, TrendingUp } from 'lucide-react';
import clsx from 'clsx';

interface StageMetrics {
    avg: number;
    p75: number;
    p25: number;
    p10: number;
}

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
        percentiles: {
            p75: number;
            p25: number;
            p10: number;
        };
        stages: {
            agendamento: StageMetrics;
            viagem: StageMetrics;
            area_verde: StageMetrics;
            interno: StageMetrics;
            antecipacao: StageMetrics;
        };
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
    const [expandedPraca, setExpandedPraca] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setData(null);
            setExpandedPraca(null);
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
    
    // Attainment % (Atingimento)
    // For Cycle time, we want real <= meta. 
    // If real=meta, attainment=100%. If real is higher, attainment is lower.
    const atingimento = real > 0 ? (meta / real) * 100 : 0;
    
    // Scale for semi-circle (0 to 180 degrees)
    // 0% Attainment = Ruim (Left)
    // 100% Attainment = Excelente (Right)
    const rotation = Math.min(Math.max((atingimento / 100) * 180, 0), 180);

    // Color Logic for Gauge
    const getGaugeColor = (pct: number) => {
        if (pct >= 100) return '#10b981'; // Emerald
        if (pct >= 90) return '#22c55e';  // Green
        if (pct >= 80) return '#eab308';  // Yellow
        if (pct >= 70) return '#f97316';  // Orange
        return '#ef4444';                // Red
    };

    const gaugeColor = getGaugeColor(atingimento);

    return (
        <div className="fixed inset-0 z-110 flex justify-end font-sans">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in" 
                onClick={onClose}
            />
            
            <div className="relative w-full max-w-xl bg-[#090b0d] border-l border-white/5 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden text-gray-100">
                {/* Header */}
                <header className="px-6 py-5 border-b border-white/5 flex justify-between items-center shrink-0 bg-[#0d1117]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-xl">
                            <Gauge className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tight uppercase italic flex items-center gap-2">
                                Cockpit Premium
                                <span className="bg-blue-600 text-[8px] not-italic px-1.5 py-0.5 rounded text-white tracking-widest font-black">V4</span>
                            </h2>
                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Performance • Mensal • {terminal}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition text-gray-500">
                        <X className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar pb-32 focus:outline-none">
                    {loading || !data || !summary ? (
                        <div className="h-full flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">
                                Consolidando Diagnóstico...
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* VELOCIMETER - MATCHING FOTO 3 */}
                            <section className="flex flex-col items-center py-8 relative bg-[#0d1117]/40 rounded-[40px] border border-white/5 shadow-inner">
                                <div className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mb-2 opacity-80">
                                    ATINGIMENTO: {atingimento.toFixed(1)}%
                                </div>
                                
                                <div className="relative w-80 h-44">
                                    <svg viewBox="0 0 100 55" className="w-full h-full">
                                        {/* Background Track */}
                                        <path 
                                            d="M 12 45 A 38 38 0 0 1 88 45" 
                                            fill="none" 
                                            stroke="#161b22" 
                                            strokeWidth="7" 
                                            strokeLinecap="round" 
                                        />
                                        {/* Foreground Progress */}
                                        <path 
                                            d="M 12 45 A 38 38 0 0 1 88 45" 
                                            fill="none" 
                                            stroke={gaugeColor} 
                                            strokeWidth="7" 
                                            strokeLinecap="round"
                                            strokeDasharray="125.6"
                                            strokeDashoffset={125.6 * (1 - Math.min(atingimento/100, 1))}
                                            style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.5s ease-in-out' }}
                                        />
                                        
                                        {/* Cursor/Pin Point */}
                                        <g transform={`rotate(${rotation - 180}, 50, 45)`}>
                                            <circle cx="50" cy="7" r="2" fill="white" className="shadow-lg" />
                                        </g>
                                    </svg>
                                    
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-10">
                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 opacity-60 italic">Média do Período</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">{real.toFixed(1)}</span>
                                            <span className="text-2xl font-black text-gray-500">H</span>
                                        </div>
                                    </div>

                                    <div className="absolute bottom-6 left-6 text-[10px] font-black text-gray-700 uppercase tracking-[0.1em] italic">Ruim</div>
                                    <div className="absolute bottom-6 right-6 text-[10px] font-black text-gray-200 uppercase tracking-[0.1em] italic">Excelente</div>
                                </div>
                            </section>

                            {/* DIAGNÓSTICO GRID */}
                            <section>
                                <div className="flex items-center gap-2 mb-6 px-2">
                                    <Trophy className="w-4 h-4 text-yellow-500" />
                                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] italic">Diagnóstico por Praça</h3>
                                    <div className="flex-1 h-px bg-white/5 ml-2" />
                                </div>

                                <div className="space-y-4">
                                    {data.pracas?.map((p, i) => {
                                        const isExpanded = expandedPraca === p.name;
                                        return (
                                            <div key={i} className={clsx(
                                                "border transition-all duration-300 rounded-[32px] overflow-hidden",
                                                isExpanded ? "bg-[#0d1117] border-blue-500/40 shadow-blue-500/10" : "bg-[#0d1117]/30 border-white/5 hover:bg-[#0d1117]/50"
                                            )}>
                                                <button 
                                                    onClick={() => setExpandedPraca(isExpanded ? null : p.name)}
                                                    className="w-full p-6 flex items-center justify-between group focus:outline-none"
                                                >
                                                    <div className="flex flex-col items-start">
                                                        <span className="text-sm font-black text-white uppercase tracking-tight group-hover:text-blue-400 transition-colors">{p.name}</span>
                                                        <div className="flex items-center gap-2 mt-1 opacity-40">
                                                            <span className="text-[8px] font-bold uppercase tracking-widest">{p.volume} veículos</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-8">
                                                        <div className="text-right">
                                                            <div className={clsx("text-2xl font-black tracking-tighter", p.avg_h <= 40 ? "text-emerald-500" : "text-white")}>
                                                                {p.avg_h.toFixed(1)}<span className="text-xs ml-0.5 opacity-20">h</span>
                                                            </div>
                                                        </div>
                                                        <div className={clsx("p-2 rounded-xl transition-all", isExpanded ? "bg-blue-600 text-white shadow-lg" : "bg-white/5 text-gray-500 group-hover:text-gray-300")}>
                                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* EXPANDED STAGES - MATCHING FOTO 1 & 2 */}
                                                {isExpanded && (
                                                    <div className="px-6 pb-8 animate-in slide-in-from-top-4 duration-500 grid grid-cols-1 gap-4 overflow-hidden">
                                                        {[
                                                            { label: 'AGENDAMENTO', key: 'agendamento' as const, isAnticipation: false },
                                                            { label: 'VIAGEM', key: 'viagem' as const, isAnticipation: false },
                                                            { label: 'ÁREA VERDE', key: 'area_verde' as const, isAnticipation: false },
                                                            { label: 'INTERNO', key: 'interno' as const, isAnticipation: false },
                                                            { label: 'ANTECIPAÇÃO', key: 'antecipacao' as const, isAnticipation: true }
                                                        ].map((s) => {
                                                            const m = p.stages[s.key];
                                                            return (
                                                                <div key={s.label} className="bg-white/[0.015] border border-white/[0.03] rounded-[30px] p-6 relative group/card hover:border-white/10 transition-colors">
                                                                    <div className="flex justify-between items-start mb-6">
                                                                        {/* TITLE HIGHLIGHT */}
                                                                        <span className="text-[10px] font-black text-gray-200 bg-white/5 px-2 py-0.5 rounded uppercase tracking-[0.2em] shadow-sm">
                                                                            {s.label}
                                                                        </span>
                                                                        {s.isAnticipation && (
                                                                            <div className="bg-emerald-500/10 px-2 py-1 rounded-lg flex items-center gap-1">
                                                                                <TrendingUp className="w-3 h-3 text-emerald-500" />
                                                                                <span className="text-[10px] font-black text-emerald-500">POTENCIAL</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex items-baseline gap-1 mb-6">
                                                                        <span className="text-5xl font-black text-white tracking-tighter">{m.avg.toFixed(0)}</span>
                                                                        <span className="text-xl font-black text-gray-700">h</span>
                                                                    </div>

                                                                    <div className="space-y-3.5 pt-5 border-t border-white/[0.03]">
                                                                        <div className="flex justify-between items-center group/line">
                                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest group-hover/line:text-gray-300 transition-colors">Resto 75%</span>
                                                                            <span className={clsx("text-[11px] font-black", s.isAnticipation ? "text-emerald-500/70" : "text-red-500/70")}>
                                                                                {m.p75.toFixed(1)}H
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center group/line">
                                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest group-hover/line:text-gray-300 transition-colors">Bench P25</span>
                                                                            <span className="text-[11px] font-black text-emerald-500">
                                                                                {m.p25.toFixed(1)}H
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center group/line">
                                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest group-hover/line:text-gray-300 transition-colors">Elite P10</span>
                                                                            <span className="text-[11px] font-black text-emerald-400 brightness-150">
                                                                                {m.p10.toFixed(1)}H
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="mt-6 h-1 w-full bg-white/5 rounded-full overflow-hidden flex">
                                                                        <div className={clsx("h-full", s.isAnticipation ? "bg-emerald-500/20 w-1/4" : "bg-red-500/40 w-1/3")} />
                                                                        <div className={clsx("h-full", s.isAnticipation ? "bg-emerald-500/50 w-2/4" : "bg-emerald-500/40 w-1/3")} />
                                                                        <div className={clsx("h-full shadow-[0_0_10px_rgba(16,185,129,0.5)]", s.isAnticipation ? "bg-emerald-500 w-1/4" : "bg-emerald-500 w-1/3")} />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* Footer Metadata */}
                <footer className="px-6 py-4 border-t border-white/5 bg-[#090b0d] text-center flex flex-col items-center gap-3">
                    <p className="text-[9px] text-gray-800 font-black uppercase tracking-[0.5em] italic">Intelligence Cockpit • v4.1 • Mobile</p>
                    <div className="w-24 h-0.5 bg-white/5 rounded-full overflow-hidden relative">
                        <div className="absolute inset-0 bg-blue-600 w-1/3 animate-marquee" />
                    </div>
                </footer>
            </div>
        </div>
    );
}
