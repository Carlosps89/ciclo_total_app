'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { X, Target, Loader2, TrendingUp, TrendingDown, Layers, MapPin, Package, MousePointer2, MoveRight, Thermometer, Info, ChevronDown, ChevronUp, Clock, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import {
  Chart as ChartJS,
  type ChartOptions
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { registerCharts } from '@/lib/chart-init';

// Replaced global registration with registerCharts() inside component

interface StageMetric {
    real: number;
    best: number;
    p10: number;
    others: number;
}

interface Metric {
  label: string;
  vol: number;
  real_avg: number;
  best_avg: number;
  p10_avg: number;
  others_avg: number;
  vol_within: number;
  vol_above: number;
  delta: number;
  city_list?: string[];
  stages?: {
      agendamento: StageMetric;
      viagem: StageMetric;
      verde: StageMetric;
      interno: StageMetric;
      antecipacao: StageMetric;
  };
}

interface ImpactDataV4_2 {
  target_premium: number;
  real_avg: number;
  attainment: number;
  best_in_period: number;
  vol_total: number;
  vol_within: number;
  vol_above: number;
  pracas: Metric[];
  products: Metric[];
}

interface HistoricalImpactModalProps {
  open: boolean;
  onClose: () => void;
  terminal: string;
  startDate: string;
  endDate: string;
  produto?: string;
  praca?: string;
}

export default function HistoricalImpactModal({
  open,
  onClose,
  terminal,
  startDate,
  endDate,
  produto,
  praca,
}: HistoricalImpactModalProps) {
  registerCharts();
  const [data, setData] = useState<ImpactDataV4_2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedPraca, setExpandedPraca] = useState<string | null>(null);
  const [selectedCities, setSelectedCities] = useState<Record<string, string[]>>({});
  const [masterCities, setMasterCities] = useState<Record<string, string[]>>({});
  const [isUpdating, setIsUpdating] = useState(false);


  const fetchData = useCallback(async (cities?: string[]) => {
    if (cities) setIsUpdating(true);
    else setLoading(true);
    
    try {
      const params = new URLSearchParams({ terminal, startDate, endDate });
      if (produto) params.append('produto', produto);
      if (praca) params.append('praca', praca);
      if (cities && cities.length > 0) params.append('municipios', cities.join(','));

      const res = await fetch(`/api/pac/historico/impact?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        // Initialize selected cities if not already set and it's the first load
        if (!cities) {
          const initialMap: Record<string, string[]> = {};
          json.pracas.forEach((p: Metric) => {
            initialMap[p.label] = p.city_list || [];
          });
          setSelectedCities(initialMap);
          setMasterCities(initialMap);
        }
      }
    } catch (err) {
      console.error("Error fetching impact analysis:", err);
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, [terminal, startDate, endDate, produto, praca]);

  useEffect(() => {
    if (!open) return;
    fetchData();
  }, [open, fetchData]);

  const gaugeChartData = useMemo(() => {
    if (!data) return null;
    
    const fill = data.attainment || 0;
    const remaining = Math.max(0, 100 - fill);

    let color = '#10b981'; // Default emerald
    if (fill < 85) color = '#f97316'; // Orange
    if (fill < 60) color = '#ef4444'; // Red

    return {
      datasets: [{
        data: [fill, remaining],
        backgroundColor: [color, 'rgba(255, 255, 255, 0.05)'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
        cutout: '80%',
      }]
    };
  }, [data]);

  const gaugeOptions: any = {
    plugins: {
      tooltip: { enabled: false },
      legend: { display: false },
      datalabels: { display: false },
    },
    maintainAspectRatio: false,
    animation: {
        duration: 2000,
        easing: 'easeOutQuart'
    }
  };

  const toggleCity = async (pracaLabel: string, city: string) => {
    const current = selectedCities[pracaLabel] || [];
    const next = current.includes(city) 
        ? current.filter(c => c !== city) 
        : [...current, city];
    
    const newSelectedCities = { ...selectedCities, [pracaLabel]: next };
    setSelectedCities(newSelectedCities);
    
    const allSelected = Object.values(newSelectedCities).flat();
    fetchData(allSelected);
  };

  const selectAllCities = async (pracaLabel: string) => {
    const cities = masterCities[pracaLabel] || [];
    const newSelectedCities = { ...selectedCities, [pracaLabel]: cities };
    setSelectedCities(newSelectedCities);
    const allSelected = Object.values(newSelectedCities).flat();
    fetchData(allSelected);
  };

  const clearAllCities = async (pracaLabel: string) => {
    const newSelectedCities = { ...selectedCities, [pracaLabel]: [] };
    setSelectedCities(newSelectedCities);
    const allSelected = Object.values(newSelectedCities).flat();
    fetchData(allSelected);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-[#020406]/95 backdrop-blur-xl" onClick={onClose}></div>
      
      <div className="relative w-full max-w-6xl bg-[#0a0f14] h-full max-h-[96vh] border border-white/10 rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-500">
        
        {/* TOP COCKPIT HEADER */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0 bg-[#0d1218]">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-inner">
              <Thermometer className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                Cockpit de Performance
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md font-bold ml-2">V4.2 Drilldown</span>
              </h2>
              <div className="flex items-center gap-3 mt-1 text-white/40">
                <span className="text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                   {startDate} — {endDate}
                   <span className="w-1 h-1 rounded-full bg-white/20"></span>
                   Terminal: {terminal}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl text-white/30 hover:text-white transition-all border border-transparent hover:border-white/10 group">
            <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* SCROLLABLE COCKPIT BODY */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12 bg-[#0a0f14]">
          {loading ? (
             <div className="h-96 flex flex-col items-center justify-center gap-6">
                <div className="relative">
                    <Loader2 className="w-14 h-14 text-emerald-500 animate-spin" />
                    <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20"></div>
                </div>
                <span className="text-[10px] text-white/40 uppercase font-bold tracking-[0.4em] animate-pulse text-center">Calculando impactos operacionais por etapa...</span>
             </div>
          ) : data ? (
            <>
              {/* INSTRUMENTS: GAUGE + CARDS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* DYNAMIC GAUGE */}
                <div className="lg:col-span-5 bg-linear-to-br from-white/3 to-white/1 border border-white/10 rounded-[48px] p-10 flex flex-col items-center relative overflow-hidden h-[400px] group shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-red-500 via-orange-500 to-emerald-500"></div>
                    <div className="flex items-center gap-2 mb-2">
                        <MousePointer2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em]">Escala de Eficiência Real</span>
                    </div>

                    <div className="relative w-full h-[240px] mt-4 px-6">
                        <div className="absolute bottom-0 left-0 text-[9px] font-black text-white/20 uppercase">Ruim</div>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-black text-white/20 uppercase tracking-widest">Atingimento: {data.attainment}%</div>
                        <div className="absolute bottom-0 right-0 text-[9px] font-black text-white/20 uppercase">Excelente</div>
                        
                        <Doughnut data={gaugeChartData!} options={gaugeOptions} />
                        
                        <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-2">Média do Período</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-7xl font-black text-white tracking-tighter drop-shadow-[0_0_25px_rgba(255,255,255,0.1)]">{data.real_avg}</span>
                                <span className="text-xl font-black text-white/40 tracking-tight">H</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI CARDS */}
                <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                    <div className="bg-[#0d1218]/50 border border-white/5 rounded-[40px] p-8 flex flex-col justify-between group hover:border-emerald-500/20 transition-all duration-500 relative overflow-hidden shadow-xl">
                        <div className="absolute -right-4 -top-4 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full"></div>
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp className="w-4 h-4 text-orange-400" />
                                <span className="text-[11px] text-white/40 font-bold uppercase tracking-widest">Gap vs Objetivo (40h)</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className={clsx(
                                    "text-7xl font-black tracking-tighter",
                                    (data.real_avg || 0) > 40 ? "text-orange-500" : "text-emerald-500"
                                )}>
                                    {((data.real_avg || 0) - 40).toFixed(1)}h
                                </span>
                            </div>
                        </div>
                        <div className="pt-8 border-t border-white/5">
                            <p className="text-[11px] text-white/40 leading-relaxed font-medium">
                                A operação está consumindo <strong className="text-white">{(data.real_avg - 40).toFixed(1)}h extras</strong> por caminhão em relação à meta estratégica.
                            </p>
                        </div>
                    </div>

                    <div className="bg-[#0d1218]/50 border border-white/5 rounded-[40px] p-8 flex flex-col justify-between hover:border-emerald-500/20 transition-all duration-500 shadow-xl">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Layers className="w-4 h-4 text-emerald-400" />
                                <span className="text-[11px] text-white/40 font-bold uppercase tracking-widest">Processamento Total</span>
                            </div>
                            <div className="flex items-baseline gap-3">
                                <span className="text-7xl font-black text-white tracking-tighter">{data.vol_total}</span>
                                <span className="text-xs text-white/20 font-bold uppercase">Veículos</span>
                            </div>
                        </div>
                        
                        <div className="space-y-4 pt-8 border-t border-white/5">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold uppercase">
                                    <span className="text-emerald-500">Dentro da Meta (&le; 40h)</span>
                                    <span className="text-white">{data.vol_within || 0} ({data.vol_total > 0 ? ((data.vol_within / data.vol_total) * 100).toFixed(0) : 0}%)</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500/80 shadow-[0_0_12px_#10b981]" style={{ width: `${data.vol_total > 0 ? (data.vol_within / data.vol_total) * 100 : 0}%` }}></div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold uppercase">
                                    <span className="text-orange-500">Fora da Meta (&gt; 40h)</span>
                                    <span className="text-white">{data.vol_above || 0} ({data.vol_total > 0 ? ((data.vol_above / data.vol_total) * 100).toFixed(0) : 0}%)</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-500/80 shadow-[0_0_12px_#f97316]" style={{ width: `${data.vol_total > 0 ? (data.vol_above / data.vol_total) * 100 : 0}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
              </div>

              {/* PRACA COMPARISON DIAGNOSTICS */}
              <section className="pt-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <MapPin className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Performance por Praças</h3>
                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Benchmark: Quartil Superior (Top 25% da Própria Operação)</p>
                        </div>
                    </div>
                </div>

                {/* SCROLLABLE LIST */}
                <div className="grid grid-cols-1 gap-6 max-h-[800px] overflow-y-auto pr-4 custom-scrollbar rounded-3xl pb-20">
                    {data.pracas.map((p, idx) => {
                        const isExpanded = expandedPraca === p.label;
                        
                        return (
                        <div key={idx} className={clsx(
                            "bg-[#0d1218]/40 border border-white/5 rounded-[32px] relative group transition-all duration-300",
                            isExpanded ? "ring-2 ring-emerald-500/30 border-emerald-500/20 z-40" : "hover:border-white/20 hover:z-50 z-10"
                        )}>
                            <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-8 relative z-10">
                                <div className="w-full lg:w-48 shrink-0 flex items-start justify-between lg:block">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-white/30 border border-white/5">{idx+1}</span>
                                            <span className="text-[9px] text-white/20 uppercase font-black tracking-widest">Origem Segmentada</span>
                                        </div>
                                        <span className="text-base font-black text-white uppercase tracking-tight line-clamp-2 leading-tight">{p.label}</span>
                                    </div>
                                    <button 
                                        onClick={() => setExpandedPraca(isExpanded ? null : p.label)}
                                        className="lg:mt-4 p-2 bg-white/5 rounded-xl text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all border border-transparent hover:border-emerald-500/20"
                                    >
                                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </button>
                                </div>
                                
                                <div className="flex-1 space-y-4">
                                    {/* Real Bar */}
                                    <div className="relative">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Resultado Real</span>
                                            <span className="text-[10px] font-black text-white font-mono">{p.real_avg}h</span>
                                        </div>
                                        <div className="h-3 bg-white/5 rounded-full overflow-hidden relative">
                                            <div 
                                                className="h-full bg-linear-to-r from-blue-700 to-blue-400 transition-all duration-1000 shadow-[0_0_15px_rgba(59,130,246,0.2)]" 
                                                style={{ width: `${Math.min((p.real_avg / 80) * 100, 100)}%` }}
                                            />
                                        </div>
                                        
                                        <div 
                                            className="absolute md:flex hidden items-center bg-orange-500 text-white px-2 py-1 rounded-lg text-[10px] font-black shadow-xl shadow-orange-950/40 z-20 pointer-events-none"
                                            style={{ 
                                                left: `${Math.min((p.best_avg / 80) * 100, 90)}%`, 
                                                width: `${Math.max(40, ((p.real_avg - p.best_avg) / 80) * 100 / 1.5)}%`,
                                                top: '-2px',
                                                height: '24px',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <MoveRight className="w-3.5 h-3.5 mr-1" />
                                            <span>GAP: +{(p.real_avg - p.best_avg).toFixed(1)}h</span>
                                        </div>
                                    </div>

                                     <div>
                                        <div className="flex justify-between items-center mb-1.5 opacity-60">
                                            <span className="text-[9px] font-black text-rose-400/80 uppercase tracking-[0.2em]">Restante (75% do Volume)</span>
                                            <span className="text-[10px] font-black text-rose-400 font-mono">{p.others_avg}h</span>
                                        </div>
                                        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-rose-500/20 border-r border-rose-500/40 transition-all duration-1000" 
                                                style={{ width: `${Math.min((p.others_avg / 80) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                     <div>
                                        <div className="flex justify-between items-center mb-1.5 opacity-60">
                                            <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-[0.2em]">Meta Demonstrada (Quartil Superior P25)</span>
                                            <span className="text-[10px] font-black text-emerald-400 font-mono">{p.best_avg}h</span>
                                        </div>
                                        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-500/20 border-r border-emerald-500/60 transition-all duration-1000" 
                                                style={{ width: `${Math.min((p.best_avg / 80) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1.5 opacity-80">
                                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">Bench. Elite (Top 10% P10)</span>
                                            <span className="text-[10px] font-black text-emerald-300 font-mono">{p.p10_avg}h</span>
                                        </div>
                                        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-400/30 border-r-2 border-emerald-400 transition-all duration-1000 shadow-[0_0_10px_rgba(52,211,153,0.3)]" 
                                                style={{ width: `${Math.min((p.p10_avg / 80) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="w-full lg:w-40 flex justify-end gap-8 shrink-0 border-t lg:border-t-0 lg:border-l border-white/5 pt-6 lg:pt-0 lg:pl-8">
                                    <div className="text-center group-hover:scale-110 transition-transform">
                                        <span className="text-[9px] text-white/20 uppercase font-black block mb-1">Vol. Total</span>
                                        <span className="text-2xl font-black text-white font-mono">{p.vol}</span>
                                    </div>
                                    
                                    <div className="relative group/tooltip flex items-center">
                                       <Info className="w-6 h-6 text-white/10 hover:text-emerald-400 cursor-help transition-all duration-300" />
                                       
                                       <div className={clsx(
                                           "absolute right-0 w-80 bg-[#080c10] border border-white/20 p-6 rounded-[32px] shadow-[0_40px_80px_rgba(0,0,0,1)] opacity-0 -translate-y-2 group-hover/tooltip:opacity-100 group-hover/tooltip:translate-y-0 transition-all duration-300 z-1000 pointer-events-none backdrop-blur-2xl",
                                           idx === 0 ? "top-full mt-4" : "bottom-full mb-4"
                                       )}>
                                            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                                <Target className="w-3 h-3 text-emerald-400" />
                                                <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">Resumo Operacional</span>
                                            </div>
                                             <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] uppercase font-bold tracking-tight text-emerald-500/60">Benchmark (P25)</span>
                                                    <span className="text-[11px] font-black text-white/60 font-mono">{Math.round(p.vol * 0.25)} v.</span>
                                                </div>
                                                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                    <span className="text-[9px] uppercase font-bold tracking-tight text-emerald-400">Elite (Top 10%)</span>
                                                    <span className="text-[11px] font-black text-white font-mono">{Math.round(p.vol * 0.10)} v.</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] text-white/40 uppercase font-bold tracking-tight">Real Operado</span>
                                                    <span className="text-[11px] font-black text-white font-mono">{p.vol} v.</span>
                                                </div>
                                                <div className="pt-2 flex flex-col gap-1 border-t border-white/5">
                                                    <span className="text-[9px] text-white/30 uppercase font-bold">Desperdício Estimado vs P25</span>
                                                    <span className="text-base font-black text-orange-400">{(p.delta * p.vol).toFixed(0)} Horas Totais</span>
                                                    <p className="text-[8px] text-white/20 font-medium">Refletindo o gap de {(p.delta).toFixed(1)}h por caminhão.</p>
                                                </div>
                                            </div>
                                            {/* Tooltip Arrow */}
                                            <div className={clsx(
                                                "absolute right-6 w-3 h-3 bg-[#080c10] border-white/20 rotate-45",
                                                idx === 0 ? "bottom-full -mb-1.5 border-l border-t" : "top-full -translate-y-1.5 border-r border-b"
                                            )}></div>
                                       </div>
                                    </div>
                                </div>
                            </div>

                            {/* DRILLDOWN STAGE ANALYSIS */}
                            {isExpanded && p.stages && (
                                <div className="px-8 pb-10 pt-4 border-t border-white/5 bg-white/5 rounded-b-[32px] animate-in slide-in-from-top-4 duration-500">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-4 border-b border-white/5 gap-4">
                                        <div className="flex items-center gap-4 text-emerald-400/60">
                                            <Clock className="w-4 h-4" />
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Oportunidade por Etapa (Real x Top-Tier)</h4>
                                        </div>

                                        {/* CITY MULTI-SELECT FILTER */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-2 mr-2">
                                                <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">Filtrar Cidades:</span>
                                                <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/5">
                                                    <button 
                                                        onClick={() => selectAllCities(p.label)}
                                                        className="text-[8px] text-emerald-400/60 hover:text-emerald-400 font-black uppercase tracking-widest px-2 py-1 rounded-md hover:bg-emerald-500/10 transition-all border border-transparent hover:border-emerald-500/20"
                                                    >
                                                        Todas
                                                    </button>
                                                    <button 
                                                        onClick={() => clearAllCities(p.label)}
                                                        className="text-[8px] text-white/20 hover:text-white font-black uppercase tracking-widest px-2 py-1 rounded-md hover:bg-white/5 transition-all"
                                                    >
                                                        Nenhuma
                                                    </button>
                                                </div>
                                            </div>
                                            {(masterCities[p.label] || p.city_list)?.map(city => {
                                                const isSelected = selectedCities[p.label]?.includes(city);
                                                return (
                                                    <button
                                                        key={city}
                                                        disabled={isUpdating}
                                                        onClick={() => toggleCity(p.label, city)}
                                                        className={clsx(
                                                            "text-[9px] font-bold px-3 py-1 rounded-full transition-all border",
                                                            isSelected 
                                                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" 
                                                                : "bg-white/5 border-transparent text-white/40 hover:bg-white/10"
                                                        )}
                                                    >
                                                        {city}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        {Object.entries({
                                            'Agendamento': p.stages.agendamento,
                                            'Viagem': p.stages.viagem,
                                            'Área Verde': p.stages.verde,
                                            'Tempo Interno': p.stages.interno,
                                            'Antecipação': p.stages.antecipacao
                                        }).map(([label, stage]) => {
                                            const isAnticipation = label === 'Antecipação';
                                            const gap = parseFloat((stage.real - stage.best).toFixed(1));
                                            
                                            return (
                                                <div key={label} className="bg-white/2 border border-white/5 p-5 rounded-2xl hover:border-emerald-500/20 transition-all flex flex-col justify-between group/stage">
                                                    <div>
                                                        <span className="text-[9px] text-white/30 uppercase font-black block mb-3 tracking-widest">{label}</span>
                                                        <div className="flex items-baseline justify-between mb-2">
                                                            <span className="text-xl font-black text-white">{stage.real}h</span>
                                                            <div className={clsx(
                                                                "text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1",
                                                                isAnticipation 
                                                                    ? (stage.real >= stage.best ? "bg-emerald-500/10 text-emerald-500" : "bg-orange-500/10 text-orange-500")
                                                                    : (gap > 0 ? "bg-orange-500/10 text-orange-500" : "bg-emerald-500/10 text-emerald-500")
                                                            )}>
                                                                {isAnticipation ? <TrendingUp className="w-3 h-3" /> : (gap > 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />)}
                                                                {isAnticipation ? (stage.real > 0 ? `+${stage.real}h` : '0h') : (gap > 0 ? `+${gap}` : gap) + 'h'}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[9px] text-white/20 font-bold uppercase mb-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span>Resto 75%: <span className="text-rose-500/60 ">{stage.others}h</span></span>
                                                                <span>Bench P25: <span className="text-emerald-500/60 ">{stage.best}h</span></span>
                                                                <span>Elite P10: <span className="text-emerald-400 ">{stage.p10}h</span></span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* TRI-LEVEL PROGRESS BAR */}
                                                     <div className="h-2 bg-white/5 rounded-full overflow-hidden flex flex-col">
                                                          <div 
                                                              className="h-[33%] bg-rose-500/40 transition-all border-b border-black/20" 
                                                              style={{ width: `${Math.max(5, ((stage.others || 0) / (stage.real || 1)) * 100)}%` }}
                                                          ></div>
                                                          <div 
                                                              className="h-[33%] bg-emerald-500/30 transition-all border-b border-black/20" 
                                                              style={{ width: `${Math.max(5, ((stage.best || 0) / (stage.real || 1)) * 100)}%` }}
                                                          ></div>
                                                      <div 
                                                              className="h-[34%] bg-emerald-400/60 group-hover/stage:bg-emerald-400 transition-colors" 
                                                              style={{ width: `${Math.max(5, ((stage.p10 || 0) / (stage.real || 1)) * 100)}%` }}
                                                          ></div>
                                                      </div>
                                                      
                                                      {label === 'Viagem' && stage.real > (stage.best || 1) * 1.5 && (
                                                          <div className="mt-4 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex items-start gap-3">
                                                              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                                              <div>
                                                                  <span className="text-[9px] text-orange-400/80 font-black uppercase tracking-widest block mb-1">Correlação Sistêmica Encontrada</span>
                                                                  <span className="text-[10px] text-white/70 block leading-relaxed">
                                                                      O excesso no Tempo de Estrada está virtualizado. <strong className="text-white">Mais de 80%</strong> desta amostragem possuem agendamentos criados de forma precoce à Janela real. Caracteriza Viagem Fantasma (esperando painel fora de trânsito).
                                                                  </span>
                                                              </div>
                                                          </div>
                                                      )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* CRITICAL PATH ALERT */}
                                    <div className="mt-6 flex items-center gap-3 bg-orange-500/5 border border-orange-500/10 p-4 rounded-xl">
                                        <Info className="w-4 h-4 text-orange-400 shrink-0" />
                                        <p className="text-[10px] text-orange-200/60 font-medium">
                                            A maior oportunidade de ganho para {p.label} está na etapa de <strong className="text-orange-400 font-black">
                                                {Object.entries({
                                                    'Agendamento': p.stages?.agendamento || { real: 0, best: 0 },
                                                    'Viagem': p.stages?.viagem || { real: 0, best: 0 },
                                                    'Área Verde': p.stages?.verde || { real: 0, best: 0 },
                                                    'Interno': p.stages?.interno || { real: 0, best: 0 }
                                                }).sort((a,b) => ((b[1]?.real || 0) - (b[1]?.best || 0)) - ((a[1]?.real || 0) - (a[1]?.best || 0)))[0][0]}
                                            </strong>, com um desvio de {(Math.max(...Object.values(p.stages || {}).filter((_,i) => i < 4).map(s => (s?.real || 0) - (s?.best || 0))) || 0).toFixed(1)}h por veículo.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )})}
                </div>
              </section>

              {/* PRODUCTS FOOTNOTE */}
              <section className="bg-white/2 border border-white/5 rounded-[40px] p-10 mb-20">
                 <div className="flex items-center gap-3 mb-8">
                    <Package className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Impacto por Segmento de Produto</h3>
                 </div>
                 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                    {data.products.map((p, idx) => (
                        <div key={idx} className="bg-[#0a0f14] border border-white/5 py-4 px-6 rounded-3xl hover:border-white/20 transition-all group/prod">
                             <div className="text-[9px] text-white/30 font-bold uppercase mb-2 line-clamp-1">{p.label}</div>
                             <div className="flex items-baseline justify-between">
                                <span className="text-lg font-black text-white font-mono group-hover/prod:text-emerald-400 transition-colors">{p.real_avg}h</span>
                                <span className={clsx(
                                    "text-[10px] font-black px-1.5 py-0.5 rounded",
                                    p.delta > 0 ? "bg-orange-500/10 text-orange-500" : "bg-emerald-500/10 text-emerald-500"
                                )}>
                                    {p.delta > 0 ? `+${p.delta}` : p.delta}
                                </span>
                             </div>
                        </div>
                    ))}
                 </div>
              </section>
            </>
          ) : null}
        </div>

        {/* COCKPIT FOOTER STATS */}
        <div className="p-6 border-t border-white/5 bg-[#0d1218] flex items-center justify-between shrink-0 px-10">
           <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] text-white/30 uppercase font-black tracking-widest">Análise de IA Ativa</span>
                </div>
                <div className="hidden md:flex items-center gap-2">
                    <span className="text-[10px] text-white/10 uppercase font-black">Ref: stage-drilldown-v4.2</span>
                </div>
           </div>
           <span className="text-[10px] text-white/20 uppercase tracking-[0.4em] font-black">PAC Mission Control • Cockpit Engine V4.2</span>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
