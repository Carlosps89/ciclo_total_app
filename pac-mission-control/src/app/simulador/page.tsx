"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
    ArrowLeft, 
    TrendingUp, 
    Gauge, 
    Activity, 
    Calendar, 
    Target, 
    ChevronRight,
    Loader2,
    CalendarClock,
    Truck
} from 'lucide-react';
import clsx from 'clsx';

interface PerformanceData {
    summary: {
        avg_h: number;
        total_volume: number;
        target_volume: number;
        best_case: number;
        meta: number;
    };
}

function SimulatorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const terminal = searchParams.get('terminal') || 'TRO';
    const produto = searchParams.get('produto');

    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);

    // Simulation Controls
    const [simDailyVol, setSimDailyVol] = useState(800);
    const [simCycleTime, setSimCycleTime] = useState(38);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const pParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
                const res = await fetch(`/api/pac/performance/monthly?terminal=${terminal}${pParam}`);
                const json = await res.json();
                setData(json);
                
                // Initialize simulation with current MTD cycle if possible
                if (json.summary?.avg_h) {
                    setSimCycleTime(Math.round(json.summary.avg_h));
                }
            } catch (err) {
                console.error("Error fetching simulation data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [terminal, produto]);

    if (loading || !data) {
        return (
            <div className="h-screen bg-[#020408] flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em] animate-pulse">Iniciando Motor de Projeção...</p>
            </div>
        );
    }

    const summary = data.summary;
    const meta = 40; // Target goal
    const realAvg = summary.avg_h || 0;
    const realVol = summary.total_volume || 0;

    // Projection Logic
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = Math.max(0, lastDayOfMonth - currentDay);
    
    const remVolTotal = daysRemaining * simDailyVol;
    const projectedVolSuffix = realVol + remVolTotal;
    const projectedAvg = ((realVol * realAvg) + (remVolTotal * simCycleTime)) / Math.max(projectedVolSuffix, 1);

    // Reverse: Needed to reach meta
    const neededCycleForMeta = remVolTotal > 0 
        ? (meta * projectedVolSuffix - (realVol * realAvg)) / remVolTotal
        : 0;

    const atingimento = projectedAvg > 0 ? (meta / projectedAvg) * 100 : 0;

    const getGaugeColor = (pct: number) => {
        if (pct >= 100) return '#10b981'; // Emerald
        if (pct >= 95) return '#22c55e';  // Green
        if (pct >= 85) return '#eab308';  // Yellow
        return '#ef4444';                // Red
    };

    return (
        <div className="min-h-screen bg-[#020408] text-white flex flex-col p-8 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => router.back()}
                        className="p-4 bg-white/2 hover:bg-white/5 border border-white/5 rounded-3xl transition-all group"
                    >
                        <ArrowLeft className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">
                            Simulador de Meta <span className="text-blue-500">40H</span>
                        </h1>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mt-1 italic">
                            Projeção de Performance • {terminal} • {produto || 'Todos Produtos'}
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-4">
                    <div className="px-6 py-3 bg-white/2 border border-white/5 rounded-2xl flex flex-col items-end">
                        <span className="text-[9px] text-white/30 font-black uppercase tracking-widest">Meta de Ciclo</span>
                        <span className="text-xl font-black text-blue-500 font-sans tracking-tighter">40.0h</span>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                
                {/* Left Panel: Real Data & Projections Controls */}
                <div className="xl:col-span-4 space-y-6">
                    
                    {/* Status MTD Card */}
                    <div className="bg-[#0a0c12] border border-white/5 rounded-[2.5rem] p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Activity size={60} /></div>
                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-6">Realizado MTD (Até Hoje)</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="flex flex-col">
                                <span className="text-3xl font-black text-white font-sans tracking-tighter">{realAvg.toFixed(1)}h</span>
                                <span className="text-[9px] font-bold text-white/20 uppercase">Ciclo Médio</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-3xl font-black text-white font-sans tracking-tighter">{realVol}</span>
                                <span className="text-[9px] font-bold text-white/20 uppercase">Volume Total</span>
                            </div>
                        </div>
                    </div>

                    {/* Simulation Controls Card */}
                    <div className="bg-white/2 border border-blue-500/20 rounded-[2.5rem] p-8 space-y-10">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-500/10 rounded-2xl">
                                <Target className="w-5 h-5 text-blue-500" />
                            </div>
                            <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Cenário Projetado (D+1 até Fim do Mês)</h3>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Volume Diário Típico</label>
                                    <span className="bg-blue-600/20 px-3 py-1 rounded-lg text-sm font-black text-blue-400 font-sans border border-blue-500/20">{simDailyVol}</span>
                                </div>
                                <input 
                                    type="range" min="100" max="1500" step="50"
                                    value={simDailyVol}
                                    onChange={(e) => setSimDailyVol(parseInt(e.target.value))}
                                    className="w-full h-2 bg-white/5 rounded-full appearance-none accent-blue-500 cursor-pointer"
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ciclo Médio Desejado</label>
                                    <span className="bg-rose-500/20 px-3 py-1 rounded-lg text-sm font-black text-rose-400 font-sans border border-rose-500/20">{simCycleTime}h</span>
                                </div>
                                <input 
                                    type="range" min="20" max="80" step="1"
                                    value={simCycleTime}
                                    onChange={(e) => setSimCycleTime(parseInt(e.target.value))}
                                    className="w-full h-2 bg-white/5 rounded-full appearance-none accent-rose-500 cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="pt-8 border-t border-white/5">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Dias Restantes</span>
                                <div className="flex items-center gap-4">
                                    <Calendar className="text-blue-500" />
                                    <span className="text-2xl font-black text-white">+{daysRemaining}</span>
                                    <span className="text-xs font-bold text-gray-500">DDIAS ÚTEIS/CALENDÁRIO</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Output & Visualization */}
                <div className="xl:col-span-8 flex flex-col gap-8">
                    
                    {/* Main Result Card */}
                    <div className="bg-[#05070a] border border-white/5 rounded-[3rem] p-12 shadow-2xl flex flex-col items-center relative overflow-hidden">
                        
                        {/* Summary Header */}
                        <div className="w-full flex justify-between items-start mb-16 z-10">
                            <div>
                                <h2 className="text-4xl font-black tracking-tighter text-white">RESULTADO PROJETADO</h2>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-2">Visão de Fechamento do Mês Atual</p>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">Volume Estimado</div>
                                <div className="text-3xl font-black text-white font-sans tracking-tighter">{projectedVolSuffix} <span className="text-sm font-bold text-gray-700 uppercase">Veh</span></div>
                            </div>
                        </div>

                        {/* Gauge Container */}
                        <div className="relative w-[32rem] h-64 flex flex-col items-center">
                            <svg viewBox="0 0 100 55" className="w-full h-full drop-shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                                <path 
                                    d="M 12 45 A 38 38 0 0 1 88 45" 
                                    fill="none" 
                                    stroke="#ffffff" 
                                    strokeOpacity="0.03"
                                    strokeWidth="8" 
                                    strokeLinecap="round" 
                                />
                                <path 
                                    d="M 12 45 A 38 38 0 0 1 88 45" 
                                    fill="none" 
                                    stroke={getGaugeColor(atingimento)}
                                    strokeWidth="8" 
                                    strokeLinecap="round"
                                    strokeDasharray="119.38" 
                                    strokeDashoffset={119.38 * (1 - Math.min(atingimento/100, 1))}
                                    style={{ transition: 'stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.8s ease' }}
                                />
                            </svg>
                            
                            <div className="absolute inset-0 flex flex-col items-center justify-center pt-12">
                                <span className="text-[11px] font-black text-white/30 uppercase tracking-[0.5em] mb-2 italic">Média Fechamento</span>
                                <div className="flex items-baseline gap-2">
                                    <span className={clsx(
                                        "text-[7rem] font-black tracking-tighter leading-none transition-colors duration-700",
                                        atingimento >= 100 ? "text-emerald-500" : "text-white"
                                    )}>
                                        {projectedAvg.toFixed(1)}
                                    </span>
                                    <span className="text-3xl font-black text-gray-700">H</span>
                                </div>
                            </div>
                        </div>

                        {/* Reverse Calculation Banner */}
                        <div className="mt-16 w-full bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-emerald-500/20 rounded-2xl shadow-xl">
                                    <CalendarClock className="w-8 h-8 text-emerald-400" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">Necessidade de Operação</span>
                                    <h4 className="text-xl font-bold text-white mt-1 italic tracking-tight">
                                        Para atingir a meta de <span className="text-emerald-400 font-extrabold">40h</span>...
                                    </h4>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] text-emerald-500/60 font-black uppercase">Ciclo das próximas {remVolTotal} cargas</span>
                                <div className="text-4xl font-black text-emerald-400 font-sans">
                                    {neededCycleForMeta > 0 ? neededCycleForMeta.toFixed(1) : '---'}<span className="text-lg ml-0.5">h</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Secondary Visual Blocks */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white/2 border border-white/5 rounded-[2.5rem] p-8 flex flex-col relative overflow-hidden group">
                           <div className="absolute -bottom-4 -right-4 text-blue-500 opacity-5 group-hover:scale-110 transition-transform"><Truck size={100} /></div>
                           <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">Volume Ponderado Diário</span>
                           <span className="text-3xl font-black text-white font-sans">{(projectedVolSuffix / lastDayOfMonth).toFixed(0)}</span>
                           <span className="text-[10px] text-gray-500 font-bold uppercase mt-1">VEÍCULOS/DIA (MÉDIA MENSAL)</span>
                        </div>
                        <div className="bg-white/2 border border-white/5 rounded-[2.5rem] p-8 flex flex-col relative overflow-hidden group">
                           <div className="absolute -bottom-4 -right-4 text-purple-500 opacity-5 group-hover:scale-110 transition-transform"><TrendingUp size={100} /></div>
                           <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">Atingimento da Meta</span>
                           <div className="flex items-baseline gap-2">
                               <span className={clsx(
                                   "text-3xl font-black font-sans",
                                   atingimento >= 100 ? "text-emerald-500" : atingimento >= 90 ? "text-yellow-500" : "text-rose-500"
                               )}>
                                   {atingimento.toFixed(1)}%
                               </span>
                           </div>
                           <span className="text-[10px] text-gray-500 font-bold uppercase mt-1">EFICIÊNCIA PROJETADA</span>
                        </div>
                    </div>

                    {/* Yearly Projection Block */}
                    <div className="bg-gradient-to-r from-blue-900/40 via-blue-950/20 to-transparent border border-blue-500/20 rounded-[2.5rem] p-8 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-blue-500/20 rounded-2xl">
                                <Calendar className="w-8 h-8 text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Previsão Acumulada Anual</span>
                                <h4 className="text-xl font-bold text-white mt-1">Se mantivermos este ritmo simulado...</h4>
                            </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[9px] text-white/30 font-black uppercase">Ciclo Médio Estimado (Ano)</div>
                           <div className="text-4xl font-black text-white font-sans">
                               {projectedAvg.toFixed(1)}<span className="text-lg ml-0.5">h</span>
                           </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SimulatorPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SimulatorContent />
        </Suspense>
    );
}
