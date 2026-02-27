'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, Zap, Loader2, Gauge, ChevronDown, ChevronUp, Target, TrendingDown, Clock, MousePointer2 } from 'lucide-react';
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
    const gap = Math.max(0, real - meta);
    const atingimento = real > 0 ? (meta / real) * 100 : 0;
    
    // Scale for speedometer (0 to 180 degrees)
    const needleRotation = Math.min(Math.max(((real - 20) / 40) * 180, 0), 180);

    return (
        <div className="fixed inset-0 z-110 flex justify-end font-sans">
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
                    {loading || !data || !summary ? (
                        <div className="h-full flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">
                                Sincronizando com Athena...<br/>
                                <span className="opacity-40 font-bold text-[10px]">Pode levar alguns segundos</span>
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* SPEEDOMETER SECTION */}
                            <section className="bg-gray-950 border border-gray-800 rounded-[32px] p-8 relative overflow-hidden group shadow-2xl">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Zap className="w-24 h-24 text-blue-500/50" />
                                </div>

                                <div className="flex flex-col items-center relative z-10">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Atingimento Global (Mês)</span>
                                    
                                    {/* REFINED SPEEDOMETER */}
                                    <div className="relative w-72 h-36 mb-6">
                                        <svg viewBox="0 0 100 50" className="w-full h-full">
                                            <defs>
                                                <linearGradient id="gaugeGradientRefined" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#22c55e" />     {/* Green */}
                                                    <stop offset="40%" stopColor="#eab308" />    {/* Yellow */}
                                                    <stop offset="60%" stopColor="#f97316" />    {/* Orange */}
                                                    <stop offset="100%" stopColor="#ef4444" />    {/* Red */}
                                                </linearGradient>
                                                <filter id="glow">
                                                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                                                    <feMerge>
                                                        <feMergeNode in="coloredBlur"/>
                                                        <feMergeNode in="SourceGraphic"/>
                                                    </feMerge>
                                                </filter>
                                            </defs>
                                            
                                            {/* Background Track */}
                                            <path 
                                                d="M 12 45 A 38 38 0 0 1 88 45" 
                                                fill="none" 
                                                stroke="#1a1a1a" 
                                                strokeWidth="10" 
                                                strokeLinecap="round" 
                                            />
                                            
                                            {/* Process Track */}
                                            <path 
                                                d="M 12 45 A 38 38 0 0 1 88 45" 
                                                fill="none" 
                                                stroke="url(#gaugeGradientRefined)" 
                                                strokeWidth="10" 
                                                strokeLinecap="round"
                                                strokeDasharray="125"
                                                className="shadow-inner"
                                            />

                                            {/* Ticks */}
                                            {[0, 45, 90, 135, 180].map((deg, i) => {
                                                const rad = (deg - 180) * (Math.PI / 180);
                                                const x1 = 50 + 34 * Math.cos(rad);
                                                const y1 = 45 + 34 * Math.sin(rad);
                                                const x2 = 50 + 40 * Math.cos(rad);
                                                const y2 = 45 + 40 * Math.sin(rad);
                                                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="0.5" opacity="0.3" />;
                                            })}

                                            {/* Needle */}
                                            <g style={{ transform: `rotate(${needleRotation - 90}deg)`, transformOrigin: '50px 45px', transition: 'transform 2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                                                <line 
                                                    x1="50" y1="45" x2="50" y2="10" 
                                                    stroke="white" 
                                                    strokeWidth="2.5" 
                                                    strokeLinecap="round"
                                                    filter="url(#glow)"
                                                />
                                                <circle cx="50" cy="45" r="5" fill="white" filter="url(#glow)" />
                                                <circle cx="50" cy="45" r="2" fill="#000" />
                                            </g>
                                        </svg>
                                        
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-6 text-center">
                                           <div className="text-4xl font-black text-white leading-none tracking-tighter shadow-black drop-shadow-md">{real.toFixed(1)}h</div>
                                           <div className={clsx("text-[10px] font-black uppercase mt-1 tracking-widest", atingimento >= 100 ? "text-green-500" : "text-yellow-500 shadow-yellow-500/20")}>
                                              {atingimento.toFixed(1)}% META
                                           </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8 mt-4 pt-8 border-t border-gray-800/80 items-center">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Gap de Oportunidade</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className={clsx("text-2xl font-black", gap > 0 ? "text-red-500" : "text-green-500")}>
                                                {gap > 0 ? `+${gap.toFixed(1)}h` : 'Meta Atingida'}
                                            </span>
                                            {gap > 0 && <span className="text-[8px] text-gray-600 uppercase font-black italic tracking-tighter">ACIMA DA META</span>}
                                        </div>
                                    </div>
                                    <div className="text-right space-y-2">
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Volume Mensal (Qtd)</p>
                                        <div className="flex items-center justify-end gap-4 h-8">
                                            <div className="group/stat">
                                                <div className="text-base font-black text-green-500 leading-none mb-0.5">{summary.target_volume}</div>
                                                <div className="text-[7px] font-bold text-gray-600 uppercase tracking-tighter">BOM (≤40h)</div>
                                            </div>
                                            <div className="h-4 w-px bg-gray-800" />
                                            <div className="group/stat">
                                                <div className="text-base font-black text-red-500 leading-none mb-0.5">{summary.total_volume - summary.target_volume}</div>
                                                <div className="text-[7px] font-bold text-gray-600 uppercase tracking-tighter">RUIM (&gt;40h)</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* PRAÇAS GRID - INTERACTIVE */}
                            <section>
                                <div className="flex items-center justify-between mb-6 px-2">
                                    <div className="flex flex-col">
                                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Trophy className="w-4 h-4 text-yellow-500" />
                                            Diagnóstico por Praças
                                        </h3>
                                        <span className="text-[8px] text-gray-600 font-black uppercase mt-1 flex items-center gap-1">
                                            <MousePointer2 className="w-2.5 h-2.5" /> Clique para detalhamento avançado
                                        </span>
                                    </div>
                                    <div className="bg-gray-900 px-3 py-1 rounded-full border border-gray-800">
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">Real do Mês</span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {data.pracas?.map((p, i) => {
                                        const isExpanded = expandedPraca === p.name;
                                        return (
                                            <div key={i} className={clsx(
                                                "border transition-all duration-300 rounded-[24px] overflow-hidden group shadow-lg",
                                                isExpanded ? "bg-gray-900 border-blue-500/50 shadow-blue-500/10" : "bg-gray-900/40 border-gray-800 hover:border-gray-700"
                                            )}>
                                                {/* Main Row */}
                                                <button 
                                                    onClick={() => setExpandedPraca(isExpanded ? null : p.name)}
                                                    className="w-full p-5 flex items-center justify-between transition-colors focus:outline-none"
                                                >
                                                    <div className="flex flex-col items-start gap-0.5">
                                                        <span className="text-xs font-black text-white uppercase tracking-tight group-hover:text-blue-400 transition-colors">{p.name}</span>
                                                        <span className="text-[9px] text-gray-600 font-bold uppercase">{p.volume} veículos mtd</span>
                                                    </div>

                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right">
                                                            <div className={clsx("text-lg font-black tracking-tighter", p.avg_h <= 40 ? "text-green-500" : "text-white")}>
                                                                {p.avg_h.toFixed(1)}h
                                                            </div>
                                                            <div className="text-[8px] font-black text-gray-700 uppercase tracking-tighter">Ciclo Médio</div>
                                                        </div>
                                                        <div className={clsx("p-1.5 rounded-lg transition-colors border", isExpanded ? "bg-blue-500 border-blue-400 text-white" : "bg-gray-800 border-gray-700 text-gray-600")}>
                                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Expanded Details */}
                                                {isExpanded && (
                                                    <div className="px-5 pb-6 animate-in slide-in-from-top-2 duration-300 space-y-6 border-t border-gray-800/50 pt-6">
                                                        {/* Section 1: Breakdown Stages */}
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <Clock className="w-3 h-3 text-blue-400" />
                                                                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Decomposição do Ciclo (Média e Percentis)</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {[
                                                                    { label: 'Agendamento', metrics: p.stages.agendamento, color: 'text-gray-300' },
                                                                    { label: 'Viagem', metrics: p.stages.viagem, color: 'text-gray-300' },
                                                                    { label: 'Área Verde', metrics: p.stages.area_verde, color: 'text-green-500' },
                                                                    { label: 'Interno', metrics: p.stages.interno, color: 'text-gray-300' },
                                                                    { label: 'Antecipação', metrics: p.stages.antecipacao, color: 'text-purple-400' }
                                                                ].map((s, idx) => (
                                                                    <div key={idx} className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                                                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-tighter">{s.label}</span>
                                                                        <span className={clsx("text-sm font-black tracking-tight", s.color)}>{s.metrics.avg.toFixed(1)}h</span>
                                                                        
                                                                        {/* Discrete Percentiles */}
                                                                        <div className="flex gap-2 mt-1.5 border-t border-white/5 pt-1 w-full justify-center">
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="text-[6px] text-gray-500 font-black">P75</span>
                                                                                <span className="text-[8px] text-white/70 font-bold">{s.metrics.p75.toFixed(1)}</span>
                                                                            </div>
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="text-[6px] text-gray-500 font-black">P25</span>
                                                                                <span className="text-[8px] text-white/70 font-bold">{s.metrics.p25.toFixed(1)}</span>
                                                                            </div>
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="text-[6px] text-gray-500 font-black">P10</span>
                                                                                <span className="text-[8px] text-white/70 font-bold">{s.metrics.p10.toFixed(1)}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Section 2: Percentiles (Performance Consistency) */}
                                                        <div className="bg-gray-950/50 rounded-[20px] p-5 border border-white/5 relative overflow-hidden">
                                                            <div className="absolute top-0 right-0 p-3 opacity-5">
                                                                <TrendingDown className="w-12 h-12" />
                                                            </div>
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <Target className="w-3 h-3 text-yellow-500" />
                                                                <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Garantia e Quartis (Percentis)</span>
                                                            </div>
                                                            <div className="space-y-4">
                                                                {[
                                                                    { label: 'P75 (Ciclo Total)', val: p.percentiles.p75, desc: 'Maioria dos ciclos até este valor', pct: 75 },
                                                                    { label: 'P25 (Alta Performance)', val: p.percentiles.p25, desc: 'Top 25% melhores carregamentos', pct: 25 },
                                                                    { label: 'P10 (Elite / Benchmark)', val: p.percentiles.p10, desc: 'Cenário ideal recorrente', pct: 10 }
                                                                ].map((q, idx) => (
                                                                    <div key={idx}>
                                                                        <div className="flex justify-between items-baseline mb-1">
                                                                            <span className="text-[10px] font-black text-white">{q.label}</span>
                                                                            <span className="text-xs font-black text-blue-400">{q.val.toFixed(1)}h</span>
                                                                        </div>
                                                                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                                                            <div 
                                                                                className={clsx("h-full transition-all duration-1000", q.pct <= 25 ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]" : "bg-blue-500")} 
                                                                                style={{ width: `${Math.min((q.val / 80) * 100, 100)}%` }}
                                                                            />
                                                                        </div>
                                                                        <p className="text-[8px] text-gray-600 mt-1 font-bold italic tracking-tight">{q.desc}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
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

                {/* Footer Meta */}
                <footer className="p-4 border-t border-gray-800 text-center bg-black/90">
                    <p className="text-[8px] text-gray-800 font-black uppercase tracking-[0.5em]">Vision Premium Analysis • v3.8</p>
                </footer>
            </div>
        </div>
    );
}
