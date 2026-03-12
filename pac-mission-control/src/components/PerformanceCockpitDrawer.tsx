'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, Loader2, Gauge, ChevronDown, TrendingUp } from 'lucide-react';
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
    initialIsSimulating?: boolean;
}

export function PerformanceCockpitDrawer({ open, onClose, terminal, produto, initialIsSimulating = false }: Props) {
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedPraca, setExpandedPraca] = useState<string | null>(null);
    
    // Simulation State
    const [isSimulating, setIsSimulating] = useState(initialIsSimulating);

    useEffect(() => {
        if (open && initialIsSimulating) {
            setIsSimulating(true);
        }
    }, [open, initialIsSimulating]);
    const [simDailyVol, setSimDailyVol] = useState(800);
    const [simCycleTime, setSimCycleTime] = useState(35);

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
    const realAvg = summary?.avg_h || 0;
    const realVol = summary?.total_volume || 0;

    // Simulation Math
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = Math.max(0, lastDayOfMonth - currentDay);
    
    const projectedVol = realVol + (daysRemaining * simDailyVol);
    const projectedAvg = isSimulating 
        ? ((realVol * realAvg) + (daysRemaining * simDailyVol * simCycleTime)) / Math.max(projectedVol, 1)
        : realAvg;

    // Reverse Math: What cycle do we need for the rest of the month to hit 40h?
    // 40 = (realVol * realAvg + remVol * x) / (realVol + remVol)
    // 40 * (realVol + remVol) - realVol * realAvg = remVol * x
    // x = (40 * totalVol - realVol * realAvg) / remVol
    const remVolTotal = daysRemaining * simDailyVol;
    const neededCycleForMeta = remVolTotal > 0 
        ? (meta * projectedVol - (realVol * realAvg)) / remVolTotal
        : 0;

    const displayAvg = isSimulating ? projectedAvg : realAvg;
    const atingimento = displayAvg > 0 ? (meta / displayAvg) * 100 : 0;
    
    // Color Logic for Gauge (Matching Web Palette)
    const getGaugeColor = (pct: number) => {
        if (pct >= 100) return '#10b981'; // Emerald (Strictly <= 40h)
        if (pct >= 95) return '#22c55e';  // Green (Close to target)
        if (pct >= 85) return '#eab308';  // Yellow
        if (pct >= 75) return '#f97316';  // Orange
        return '#ef4444';                // Red
    };

    const gaugeColor = getGaugeColor(atingimento);

    return (
        <div className="fixed inset-0 z-110 flex justify-end font-sans">
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" 
                onClick={onClose}
            />
            
            <div className="relative w-full max-w-xl bg-[#05070a] border-l border-white/10 h-full shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden text-gray-100">
                {/* Header */}
                <header className="px-6 py-6 border-b border-white/5 flex justify-between items-center shrink-0 bg-[#0d1117]">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                            <Gauge className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight uppercase italic leading-none flex items-center gap-2">
                                Cockpit Premium
                                <span className="bg-blue-600 text-[9px] not-italic px-1.5 py-0.5 rounded text-white tracking-widest font-black shadow-lg">V4.5</span>
                            </h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 opacity-60">
                                {isSimulating ? 'MODO SIMULAÇÃO ATIVO' : `Performance • Mensal • ${terminal}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mr-2">
                        <button 
                            onClick={() => setIsSimulating(!isSimulating)}
                            className={clsx(
                                "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all",
                                isSimulating 
                                    ? "bg-rose-500 border-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]" 
                                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                            )}
                        >
                            {isSimulating ? 'Sair da Simulação' : 'Simular Meta'}
                        </button>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition text-gray-500 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-12 custom-scrollbar pb-32 focus:outline-none">
                    {loading || !data || !summary ? (
                        <div className="h-full flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.5em] text-center animate-pulse">
                                Auditoria de Dados em Tempo Real...
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* CLEAN VELOCIMETER - NO NEEDLES, JUST PROGRESS */}
                            <section className="flex flex-col items-center py-10 relative">
                                <div className="text-[11px] text-gray-400 font-black uppercase tracking-[0.4em] mb-4 opacity-70">
                                    {isSimulating ? 'PROJEÇÃO FECHAMENTO' : 'ATINGIMENTO'}: {atingimento.toFixed(1)}%
                                </div>
                                
                                <div className="relative w-80 h-44 group">
                                    <svg viewBox="0 0 100 55" className="w-full h-full drop-shadow-2xl">
                                        <defs>
                                            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#ef4444" />
                                                <stop offset="50%" stopColor="#eab308" />
                                                <stop offset="100%" stopColor="#10b981" />
                                            </linearGradient>
                                        </defs>
                                        {/* Background Track */}
                                        <path 
                                            d="M 12 45 A 38 38 0 0 1 88 45" 
                                            fill="none" 
                                            stroke="#ffffff" 
                                            strokeOpacity="0.05"
                                            strokeWidth="8" 
                                            strokeLinecap="round" 
                                        />
                                        {/* Foreground Progress Arc */}
                                        <path 
                                            d="M 12 45 A 38 38 0 0 1 88 45" 
                                            fill="none" 
                                            stroke={gaugeColor} 
                                            strokeWidth="8" 
                                            strokeLinecap="round"
                                            strokeDasharray="119.38" 
                                            strokeDashoffset={119.38 * (1 - Math.min(atingimento/100, 1))}
                                            style={{ transition: 'stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.8s ease' }}
                                        />
                                    </svg>
                                    
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-1 opacity-60 italic">
                                            {isSimulating ? 'Média Projetada' : 'Média do Período'}
                                        </span>
                                        <div className="flex items-baseline gap-1">
                                            <span className={clsx(
                                                "text-6xl font-black tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-colors duration-500",
                                                isSimulating ? "text-rose-400" : "text-white"
                                            )}>
                                                {displayAvg.toFixed(1)}
                                            </span>
                                            <span className="text-xl font-black text-gray-500">H</span>
                                        </div>
                                    </div>

                                    <div className="absolute bottom-5 left-6 text-[9px] font-bold text-gray-700 uppercase tracking-widest italic">Ruim</div>
                                    <div className="absolute bottom-5 right-6 text-[9px] font-bold text-gray-200 uppercase tracking-widest italic">Excelente</div>
                                </div>

                                {isSimulating && (
                                    <div className="mt-8 w-full max-w-sm space-y-8 p-6 bg-white/5 border border-white/10 rounded-3xl animate-in zoom-in-95 duration-300">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cargas Diárias (Futuro)</label>
                                                <span className="text-sm font-black text-blue-400 font-sans">{simDailyVol}</span>
                                            </div>
                                            <input 
                                                type="range" min="100" max="1500" step="50"
                                                value={simDailyVol}
                                                onChange={(e) => setSimDailyVol(parseInt(e.target.value))}
                                                className="w-full accent-blue-500 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ciclo Médio (Futuro)</label>
                                                <span className="text-sm font-black text-rose-400 font-sans">{simCycleTime}h</span>
                                            </div>
                                            <input 
                                                type="range" min="20" max="100" step="1"
                                                value={simCycleTime}
                                                onChange={(e) => setSimCycleTime(parseInt(e.target.value))}
                                                className="w-full accent-rose-500 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>

                                        <div className="pt-4 border-t border-white/5">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                                                </div>
                                                <div>
                                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Necessidade Dia</span>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Para fechar em <span className="text-white font-bold">40h</span>, as próximas <span className="text-white font-bold font-sans">{remVolTotal}</span> cargas precisam de média <span className="text-emerald-400 font-bold font-sans">{neededCycleForMeta > 0 ? neededCycleForMeta.toFixed(1) : '---'}h</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* DIAGNÓSTICO GRID */}
                            <section>
                                <div className="flex items-center gap-3 mb-8 px-2">
                                    <Trophy className="w-5 h-5 text-yellow-500/80 shadow-lg" />
                                    <h3 className="text-xs font-black text-white uppercase tracking-[0.3em] italic">Diagnóstico por Praça</h3>
                                    <div className="flex-1 h-px bg-white/10 ml-2" />
                                </div>

                                <div className="space-y-6">
                                    {data.pracas?.map((p, i) => {
                                        const isExpanded = expandedPraca === p.name;
                                        return (
                                            <div key={i} className={clsx(
                                                "border transition-all duration-300 rounded-[36px] overflow-hidden",
                                                isExpanded ? "bg-[#0d1117] border-blue-500/40 shadow-2xl scale-[1.02]" : "bg-[#0d1117]/30 border-white/5 hover:bg-[#0d1117]/50"
                                            )}>
                                                <button 
                                                    onClick={() => setExpandedPraca(isExpanded ? null : p.name)}
                                                    className="w-full p-7 flex items-center justify-between group focus:outline-none"
                                                >
                                                    <div className="flex flex-col items-start translate-x-0 group-hover:translate-x-1 transition-transform">
                                                        <span className="text-base font-black text-white uppercase tracking-tight group-hover:text-blue-400 transition-colors">{p.name}</span>
                                                        <div className="flex items-center gap-2 mt-1.5 opacity-40">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                            <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{p.volume} veículos auditados</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-8">
                                                        <div className="text-right">
                                                            <div className={clsx("text-3xl font-black tracking-tighter drop-shadow-lg", p.avg_h <= 40 ? "text-emerald-500" : "text-white")}>
                                                                {p.avg_h.toFixed(1)}<span className="text-sm ml-0.5 opacity-20">h</span>
                                                            </div>
                                                        </div>
                                                        <div className={clsx("p-2.5 rounded-2xl transition-all", isExpanded ? "bg-blue-600 text-white shadow-xl rotate-180" : "bg-white/5 text-gray-500 group-hover:bg-white/10 group-hover:text-gray-300")}>
                                                            <ChevronDown className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* EXPANDED STAGES - HIGHLIGHTED CARDS */}
                                                {isExpanded && (
                                                    <div className="px-7 pb-10 animate-in slide-in-from-top-4 duration-500 grid grid-cols-1 gap-5 overflow-hidden">
                                                        {[
                                                            { label: 'AGENDAMENTO', key: 'agendamento' as const, isAnticipation: false },
                                                            { label: 'VIAGEM', key: 'viagem' as const, isAnticipation: false },
                                                            { label: 'ÁREA VERDE', key: 'area_verde' as const, isAnticipation: false },
                                                            { label: 'TEMPO INTERNO', key: 'interno' as const, isAnticipation: false },
                                                            { label: 'ANTECIPAÇÃO', key: 'antecipacao' as const, isAnticipation: true }
                                                        ].map((s) => {
                                                            const m = p.stages[s.key];
                                                            return (
                                                                <div key={s.label} className="bg-white/2 border border-white/5 rounded-[32px] p-7 relative group/card hover:border-white/10 hover:bg-white/4 transition-all">
                                                                    <div className="flex justify-between items-start mb-6">
                                                                        {/* TITLE HIGHLIGHT - ENHANCED FOCUS */}
                                                                        <span className="text-[11px] font-black text-white bg-blue-600/20 px-3 py-1 rounded-lg uppercase tracking-[0.3em] border border-blue-500/20 shadow-sm">
                                                                            {s.label}
                                                                        </span>
                                                                        {s.isAnticipation && (
                                                                            <div className="bg-emerald-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-emerald-500/20">
                                                                                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                                                                <span className="text-[10px] font-black text-emerald-500">POTENCIAL</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex items-baseline gap-2 mb-8 translate-x-1">
                                                                        <span className="text-6xl font-black text-white tracking-tighter">{m.avg.toFixed(0)}</span>
                                                                        <span className="text-2xl font-black text-gray-700 italic">h</span>
                                                                    </div>

                                                                    <div className="space-y-4 pt-6 border-t border-white/5">
                                                                        <div className="flex justify-between items-center group/line">
                                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover/line:text-gray-300 transition-colors italic">Resto 75%</span>
                                                                            <span className={clsx("text-sm font-black transition-colors", s.isAnticipation ? "text-emerald-500/50" : "text-red-500/60 group-hover/line:text-red-500")}>
                                                                                {m.p75.toFixed(1)}<span className="text-[10px] ml-0.5">h</span>
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center group/line">
                                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover/line:text-gray-300 transition-colors italic">Bench P25</span>
                                                                            <span className="text-sm font-black text-emerald-500/80 group-hover/line:text-emerald-400">
                                                                                {m.p25.toFixed(1)}<span className="text-[10px] ml-0.5">h</span>
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center group/line">
                                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/line:text-gray-200 transition-colors italic">Elite P10</span>
                                                                            <span className="text-sm font-black text-emerald-400 brightness-125 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                                                                                {m.p10.toFixed(1)}<span className="text-[10px] ml-0.5">h</span>
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* PROGRESS BAR - WEB DASHBOARD STYLE */}
                                                                    <div className="mt-8 h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex gap-1 animate-in fade-in duration-700">
                                                                        <div className={clsx("h-full rounded-full transition-all duration-1000", s.isAnticipation ? "bg-emerald-500/10 w-1/4" : "bg-red-500/30 w-1/3")} />
                                                                        <div className={clsx("h-full rounded-full transition-all duration-1000", s.isAnticipation ? "bg-emerald-500/40 w-2/4" : "bg-emerald-500/30 w-1/3")} />
                                                                        <div className={clsx("h-full rounded-full transition-all duration-1000 shadow-lg", s.isAnticipation ? "bg-emerald-500 w-1/4" : "bg-emerald-500 w-1/3")} />
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

                <footer className="px-8 py-5 border-t border-white/5 bg-[#090b0d] flex flex-col items-center gap-4">
                <button 
                    onClick={() => {
                        const pParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
                        window.location.href = `/simulador?terminal=${terminal}${pParam}`;
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    <TrendingUp className="w-4 h-4" />
                    Abrir Simulador Avançado
                </button>
                    <p className="text-[10px] text-gray-800 font-black uppercase tracking-[0.6em] italic opacity-80">Intelligence Engine • Analytics v4.2</p>
                </footer>
            </div>
        </div>
    );
}
