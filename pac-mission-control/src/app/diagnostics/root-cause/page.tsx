"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartData,
  ChartOptions
} from 'chart.js';
import { Suspense } from 'react';
import { ArrowLeft, Clock, Truck, MapPin, Search, Activity, AlertTriangle, TrendingUp, Filter, Download, FileDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface RCAOrigin {
  tag: string;
  label: string;
  volume: number;
  avg_ciclo: number;
  avg_wait: number;
  avg_travel: number;
  avg_internal: number;
  impact: number;
}

interface RCATrend {
  tag: string;
  label: string;
  volume: number;
  avg_ciclo: number;
  avg_wait: number;
  avg_travel: number;
  avg_internal: number;
}

interface RCAData {
  terminal: string;
  days: number;
  origins: RCAOrigin[];
  products: RCAOrigin[];
  trends: RCATrend[];
}

function StatCard({ label, value, subtext, icon, trend }: { label: string, value: string, subtextText?: string, subtext?: React.ReactNode, icon: React.ReactNode, trend?: { value: string, positive: boolean } }) {
  return (
    <div className="bg-[#02132b] border border-white/5 rounded-4xl p-6 flex flex-col gap-4 relative overflow-hidden group hover:border-blue-500/30 transition-all">
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
      <div className="flex justify-between items-start">
        <div className="p-3 rounded-2xl bg-white/5 text-blue-400">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold ${trend.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
            <TrendingUp size={12} className={trend.positive ? '' : 'rotate-180'} />
            {trend.value}
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{label}</p>
        <h4 className="text-3xl font-black text-white tracking-tighter">{value}</h4>
        <div className="mt-2">{subtext}</div>
      </div>
    </div>
  );
}

function RCADashboard() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';
  const [data, setData] = useState<RCAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingToday, setExportingToday] = useState(false);

  useEffect(() => {
    fetch(`/api/pac/diagnostics/root-cause?terminal=${terminal}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [terminal]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await fetch(`/api/pac/diagnostics/root-cause/export?terminal=${terminal}&days=${data?.days || 30}`);
      const json = await res.json();
      
      const ws = XLSX.utils.json_to_sheet(json.vehicles);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Veiculos");
      XLSX.writeFile(wb, `RCA_Export_${terminal}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleExportToday = async () => {
    try {
      setExportingToday(true);
      const res = await fetch(`/api/pac/diagnostics/root-cause/export/today?terminal=${terminal}`);
      const json = await res.json();
      
      if (!json.vehicles || json.vehicles.length === 0) {
        alert("Nenhum dado encontrado para hoje.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(json.vehicles);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Relatorio_Hoje");
      XLSX.writeFile(wb, `Relatorio_Hoje_${terminal}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Export today failed:", err);
    } finally {
      setExportingToday(false);
    }
  };

  const paretoData: ChartData<'bar'> = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };
    const origins = data.origins.slice(0, 10);
    const totalImpact = origins.reduce((acc: number, o: RCAOrigin) => acc + Math.max(0, o.impact), 0);
    let cumulative = 0;
    const cumulativePoints = origins.map((o: RCAOrigin) => {
      cumulative += Math.max(0, o.impact);
      return (cumulative / (totalImpact || 1)) * 100;
    });

    return {
      labels: origins.map(o => o.label),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Impacto Operational (Horas-Excedentes)',
          data: origins.map(o => Math.max(0, o.impact)),
          backgroundColor: '#3b82f6',
          borderRadius: 8,
          order: 2
        },
        {
          type: 'line' as const,
          label: '% Acumulada',
          data: cumulativePoints,
          borderColor: '#10b981',
          borderWidth: 3,
          pointBackgroundColor: '#10b981',
          pointRadius: 4,
          tension: 0.4,
          yAxisID: 'percentage',
          order: 1
        }
      ]
    };
  }, [data]);

  const trendData: ChartData<'line'> = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };
    return {
      labels: data.trends.map(t => t.label),
      datasets: [
        {
          label: 'Espera Agendamento',
          data: data.trends.map(t => t.avg_wait),
          borderColor: '#64748b',
          backgroundColor: 'rgba(100, 116, 139, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Tempo Viagem',
          data: data.trends.map(t => t.avg_travel),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Operação Terminal',
          data: data.trends.map(t => t.avg_internal),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    };
  }, [data]);

  const chartOptions: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10, weight: 'bold' } } },
      tooltip: { padding: 12, backgroundColor: '#02132b', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
      percentage: {
        position: 'right',
        min: 0, max: 100,
        grid: { display: false },
        ticks: { color: '#10b981', font: { size: 10 }, callback: (val: number | string) => `${val}%` }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#010b1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
          <span className="text-slate-500 font-mono tracking-widest animate-pulse uppercase text-[8px]">Calculando RCA...</span>
        </div>
      </div>
    );
  }

  const globalAvg = data ? data.trends.reduce((acc, t) => acc + t.avg_ciclo, 0) / data.trends.length : 0;

  return (
    <div className="min-h-screen bg-[#010b1a] text-white font-sans flex flex-col p-8 gap-8 overflow-y-auto custom-scrollbar">
       <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

       {/* Header */}
       <div className="flex justify-between items-center">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => window.history.back()}
            className="p-4 hover:bg-white/5 rounded-3xl transition-all text-slate-400 border border-white/5 group shadow-lg"
          >
            <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black bg-linear-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-4 tracking-tight">
              ROOT CAUSE DIAGNOSTICS
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black text-blue-500/80 uppercase tracking-[0.4em]">{terminal}</span>
              <div className="w-1 h-1 rounded-full bg-slate-700"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Análise de Impactos e Paretos Operacionais</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 items-center">
          <button
            onClick={handleExportToday}
            disabled={exportingToday}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all shadow-xl font-bold uppercase tracking-widest text-[10px] ${
              exportingToday 
                ? 'bg-white/5 border-white/5 text-slate-500 cursor-not-allowed' 
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 active:scale-95'
            }`}
            title="Relatório consolidado de todos os veículos de hoje"
          >
            {exportingToday ? (
              <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-blue-400"></div>
            ) : (
              <FileDown size={16} />
            )}
            {exportingToday ? 'Exportando...' : 'Base Hoje'}
          </button>

          <button
            onClick={handleExport}
            disabled={exporting}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all shadow-xl font-bold uppercase tracking-widest text-[10px] ${
              exporting 
                ? 'bg-white/5 border-white/5 text-slate-500 cursor-not-allowed' 
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 active:scale-95'
            }`}
          >
            {exporting ? (
              <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-emerald-400"></div>
            ) : (
              <Download size={16} />
            )}
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>

          <div className="px-6 py-3 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 shadow-xl">
             <Filter size={18} className="text-slate-500" />
             <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Período Selecionado</span>
                <span className="text-sm font-mono text-white font-black">Últimos {data?.days} dias</span>
             </div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          label="Ciclo Médio Global" 
          value={`${globalAvg.toFixed(1)}h`} 
          icon={<Clock size={24} />} 
          trend={{ value: '+4.2% vs set', positive: false }}
          subtext={<div className="h-1 w-full bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-[65%]"></div></div>}
        />
        <StatCard 
          label="Volume Analisado" 
          value={data?.trends.reduce((acc, t) => acc + t.volume, 0).toLocaleString() || '0'} 
          icon={<Truck size={24} />} 
          subtext={<span className="text-[9px] text-slate-500 font-bold uppercase">Caminhões Únicos</span>}
        />
        <StatCard 
          label="Etapa Crítica" 
          value="Fila Externa" 
          icon={<AlertTriangle size={24} />} 
          trend={{ value: '-12% efficiency', positive: false }}
          subtext={<span className="text-[9px] text-rose-500 font-bold uppercase">Gargalo Identificado</span>}
        />
        <StatCard 
          label="Origens do Pareto" 
          value={data?.origins.length.toString() || '0'} 
          icon={<MapPin size={24} />} 
          subtext={<span className="text-[9px] text-slate-500 font-bold uppercase">Impactadores de Ciclo</span>}
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[450px]">
        {/* Pareto Chart */}
        <div className="bg-[#02132b] border border-white/5 rounded-[2.5rem] p-8 flex flex-col">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Impacto por Origem (RCA)</h3>
              <div className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-3 py-1 rounded-full">80/20 Analysis</div>
           </div>
           <div className="flex-1 min-h-0">
              <Bar data={paretoData} options={chartOptions as any} />
           </div>
        </div>

        {/* Trend Chart */}
        <div className="bg-[#02132b] border border-white/5 rounded-[2.5rem] p-8 flex flex-col">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Evolução de Ciclo por Etapa</h3>
              <Activity size={18} className="text-blue-500" />
           </div>
           <div className="flex-1 min-h-0">
              <Line data={trendData as any} options={chartOptions as any} />
           </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-[#02132b] border border-white/5 rounded-[2.5rem] overflow-hidden">
         <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/2">
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Análise de Severidade por Origem</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Classificação baseada no impacto acumulado na média global</p>
            </div>
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
               <input 
                type="text" 
                placeholder="Filtrar origens..." 
                className="bg-[#010b1a] border border-white/5 rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:border-blue-500"
               />
            </div>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-white/5 bg-white/2">
                     <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Origem</th>
                     <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Volume</th>
                     <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ciclo Médio</th>
                     <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Wait / Travel / Ops</th>
                     <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Impacto Acumulado</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/2">
                  {data?.origins.slice(0, 15).map((o: RCAOrigin, idx: number) => (
                    <tr key={idx} className="hover:bg-white/2 transition-colors group">
                       <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                             <div className={`w-2 h-2 rounded-full ${o.impact > 0 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                             <span className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors uppercase">{o.label}</span>
                          </div>
                       </td>
                       <td className="px-8 py-5 text-sm font-mono text-slate-400">{o.volume}</td>
                       <td className="px-8 py-5">
                          <span className={`text-sm font-black ${o.avg_ciclo > globalAvg ? 'text-rose-400' : 'text-emerald-400'}`}>{o.avg_ciclo.toFixed(1)}h</span>
                       </td>
                       <td className="px-8 py-5">
                          <div className="flex gap-1 h-1.5 w-48 rounded-full overflow-hidden bg-white/5 shadow-inner">
                             <div className="bg-slate-500/50" style={{ width: `${(o.avg_wait / o.avg_ciclo) * 100}%` }}></div>
                             <div className="bg-blue-500/50" style={{ width: `${(o.avg_travel / o.avg_ciclo) * 100}%` }}></div>
                             <div className="bg-emerald-500/50" style={{ width: `${(o.avg_internal / o.avg_ciclo) * 100}%` }}></div>
                          </div>
                          <div className="flex justify-between text-[8px] font-bold text-slate-600 mt-1 uppercase">
                             <span>Wait</span> <span>Travel</span> <span>Ops</span>
                          </div>
                       </td>
                       <td className="px-8 py-5 text-right">
                          <span className={`text-xs font-black py-1 px-3 rounded-lg bg-black/40 border border-white/5 ${o.impact > 50 ? 'text-rose-400 border-rose-500/20' : 'text-slate-400'}`}>
                             {o.impact > 0 ? '+' : ''}{o.impact.toFixed(0)}h Impacto
                          </span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}

export default function RCAPage() {
  return (
    <Suspense fallback={<div>Loading Diagnostics...</div>}>
      <RCADashboard />
    </Suspense>
  );
}
