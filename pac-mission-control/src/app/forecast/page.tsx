'use client';

import { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  PointElement, 
  LineElement, 
  Legend, 
  Tooltip, 
  Filler,
  BarController,
  LineController,
  ChartOptions
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { 
  Activity, 
  BrainCircuit, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  LayoutDashboard,
  Zap,
  ChevronLeft,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  BarController,
  LineController,
  Legend,
  Tooltip,
  Filler,
  ChartDataLabels
);

interface ForecastData {
  terminal: string;
  history: any[];
  forecast: any[];
  insight_ia: string;
  meta_h: number;
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [terminal] = useState('TRO');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pac/forecast?terminal=${terminal}&run_prescriptive=true`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Error fetching forecast:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [terminal]);

  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/pac/forecast/sync?terminal=${terminal}`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      } else {
        alert("Erro ao sincronizar motor de IA. Verifique os logs.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#050505] text-blue-500">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <span className="font-mono tracking-widest uppercase text-sm">Invocando Motor Preditivo...</span>
      </div>
    );
  }

  const combinedData = [...(data?.history || []), ...(data?.forecast || [])];
  const hasData = combinedData.length > 0;
  
  const labels = combinedData.map(d => {
    const date = new Date(d.day);
    return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
  });

  const chartData = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Ciclo Total (h)',
        data: combinedData.map(d => d.ciclo_h || 0),
        borderColor: (context: any) => {
            const index = context.dataIndex;
            return index >= (data?.history.length || 0) ? '#f59e0b' : '#14b8a6';
        },
        borderWidth: 4,
        pointRadius: 4,
        tension: 0.3,
        yAxisID: 'yCycle',
        datalabels: {
          display: (context: any) => hasData && context.dataIndex % 3 === 0,
          formatter: (value: any) => value.toFixed(2),
          align: 'top' as const,
          color: '#fff',
          font: { size: 10 }
        }
      },
      {
        type: 'bar' as const,
        label: 'Programado',
        stack: 'Buffer',
        data: combinedData.map(d => d.load_programado || 0),
        backgroundColor: 'rgba(100, 116, 139, 0.4)',
        borderColor: '#64748b',
        borderWidth: 1,
        yAxisID: 'yLoad',
        datalabels: { display: false }
      },
      {
        type: 'bar' as const,
        label: 'Fila Externa',
        stack: 'Buffer',
        data: combinedData.map(d => d.load_fila_externa || 0),
        backgroundColor: 'rgba(239, 68, 68, 0.4)',
        borderColor: '#ef4444',
        borderWidth: 1,
        yAxisID: 'yLoad',
        datalabels: { display: (context: any) => context.dataset.data[context.dataIndex] > 300 }
      },
      {
        type: 'bar' as const,
        label: 'Trânsito',
        stack: 'Buffer',
        data: combinedData.map(d => d.load_transito || 0),
        backgroundColor: 'rgba(245, 158, 11, 0.4)',
        borderColor: '#f59e0b',
        borderWidth: 1,
        yAxisID: 'yLoad',
        datalabels: { display: false }
      },
      {
        type: 'bar' as const,
        label: 'Fila Interna',
        stack: 'Buffer',
        data: combinedData.map(d => d.load_fila_interna || 0),
        backgroundColor: 'rgba(20, 184, 166, 0.4)',
        borderColor: '#14b8a6',
        borderWidth: 1,
        yAxisID: 'yLoad',
        datalabels: { display: false }
      }
    ]
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: '#94a3b8', font: { family: 'inherit' } }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      yLoad: {
        type: 'linear' as const,
        position: 'left' as const,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#64748b' },
        title: { display: true, text: 'Veículos Ativos (Ocupação)', color: '#64748b' }
      },
      yCycle: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: { display: false },
        ticks: { color: '#14b8a6' },
        title: { display: true, text: 'Ciclo Total Médio (h)', color: '#14b8a6' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#64748b' }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans p-2 md:p-6 lg:p-10">
      <div className="w-full mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-white flex items-center gap-3">
                IA PRESCRITIVA <Activity className="text-blue-500 w-8 h-8" />
              </h1>
              <p className="text-slate-500 text-sm uppercase tracking-widest font-bold">Projeção e Recomendações Logísticas</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-2xl">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-black text-blue-400 uppercase">Motor Ativo: Gemini IA + Prophet</span>
          </div>
        </header>

        <div className="flex flex-col gap-8">
          
          {/* Main Chart Area */}
          <div className="w-full space-y-8">
            <div className="bg-[#0a0a0a] border border-slate-800/50 rounded-3xl p-6 h-[500px] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-teal-500/10 rounded-2xl">
                        <TrendingUp className="text-teal-500 w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Inércia e Ciclo Total</h2>
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-tighter">Ocupação (Load) vs Performance Final</span>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-[10px] uppercase font-bold text-slate-400">Real</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <span className="text-[10px] uppercase font-bold text-slate-400">Projetado</span>
                    </div>
                </div>
              </div>
              <div className="h-[380px]">
                <Chart type="bar" data={chartData} options={options} />
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {/* Box 1: Gargalo Atual */}
               <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-3xl flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">WIP / Maior Fila Ativa (D+0)</span>
                  <div className="flex items-center gap-3">
                    {(() => {
                        if (!data?.forecast || data.forecast.length === 0) return <span className="text-3xl font-black text-slate-500">NaN</span>;
                        const f0 = data.forecast[0];
                        const buffers = [
                            { name: 'Programado', val: f0.load_programado || 0, color: 'text-slate-400' },
                            { name: 'Externa', val: f0.load_fila_externa || 0, color: 'text-red-500' },
                            { name: 'Trânsito', val: f0.load_transito || 0, color: 'text-amber-500' },
                            { name: 'Interna', val: f0.load_fila_interna || 0, color: 'text-teal-500' }
                        ];
                        const maxB = buffers.reduce((prev, current) => (prev.val > current.val) ? prev : current);
                        return (
                            <div>
                                <span className={`text-3xl font-black ${maxB.color}`}>{Math.round(maxB.val)} veículos</span>
                                <p className="text-xs font-bold text-slate-400 mt-1">Em: {maxB.name}</p>
                            </div>
                        );
                    })()}
                  </div>
               </div>

               {/* Box 2: Pico Projetado */}
               <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-3xl flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Pico de Ciclo (Próx 7 dias)</span>
                  <div className="flex items-center gap-3">
                    {(() => {
                        if (!data?.forecast || data.forecast.length === 0) return <span className="text-3xl font-black text-slate-500">NaN</span>;
                        const maxDay = data.forecast.reduce((prev, current) => (prev.ciclo_h > current.ciclo_h) ? prev : current);
                        const dataStr = new Date(maxDay.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        return (
                            <div>
                                <span className="text-3xl font-black text-white">{Math.round(maxDay.ciclo_h)}h</span>
                                <AlertTriangle className="text-amber-500 w-5 h-5 inline-block ml-2" />
                                <p className="text-xs font-bold text-slate-400 mt-1">Dia Crítico: {dataStr}</p>
                            </div>
                        );
                    })()}
                  </div>
               </div>

               {/* Box 3: Recomendação Estatística */}
               <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-3xl flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Decisão Operacional (Prophet)</span>
                  <div className="flex items-center gap-3 h-full">
                    {(() => {
                        if (!data?.forecast || data.forecast.length === 0) return <span className="text-3xl font-black text-slate-500">NaN</span>;
                        const recom = data.forecast[0].recom_acao || "MANTER ATUAL";
                        const isRed = recom.includes("REDUZIR") || recom.includes("AVISO");
                        const isGreen = recom.includes("LIBERAR");
                        return (
                            <div className="flex items-center gap-3">
                                <Activity className={`${isRed ? 'text-red-500' : isGreen ? 'text-emerald-500' : 'text-blue-500'} w-6 h-6 shrink-0`} />
                                <span className={`text-sm font-black leading-tight ${isRed ? 'text-red-400' : isGreen ? 'text-emerald-400' : 'text-blue-400'}`}>
                                    {recom}
                                </span>
                            </div>
                        );
                    })()}
                  </div>
               </div>
            </div>
          </div>

          {/* AI Prescriptive Alert (Full Width Below) */}
          <div className="w-full">
             <div className="bg-gradient-to-b from-blue-600/20 to-[#0a0a0a] border border-blue-500/30 rounded-3xl p-6 flex flex-col gap-6 shadow-xl shadow-blue-500/5">
                <div className="flex items-center justify-between border-b border-blue-500/20 pb-4">
                    <div className="flex items-center gap-3">
                        <BrainCircuit className="text-blue-400 w-8 h-8" />
                        <div>
                            <h3 className="font-black text-white leading-tight uppercase tracking-tighter">Insight Prescritivo</h3>
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Gerado em Tempo Real</span>
                        </div>
                    </div>
                </div>

                <div className="text-slate-300 text-sm leading-relaxed space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-4">
                   {data?.insight_ia ? (
                     <div className="whitespace-pre-wrap">{data.insight_ia}</div>
                   ) : (
                     <p className="italic text-slate-500 text-center py-8">Aguardando processamento analítico...</p>
                   )}
                </div>
                
                <div className="pt-4 mt-2 border-t border-slate-800 flex flex-col items-center gap-4">
                    <button 
                        onClick={handleSync}
                        disabled={syncing}
                        className={`w-full max-w-md ${syncing ? 'bg-slate-800 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20'} text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 text-xs uppercase tracking-widest`}
                    >
                        {syncing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processando IA...
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4 fill-white" />
                                Recalcular Projeção
                            </>
                        )}
                    </button>
                    <p className="text-[9px] text-slate-500 text-center uppercase font-bold tracking-tighter">
                        Motor: API TypeScript (Extração Ocupação Horária) ➔ Python/Prophet (Projeção Limitada) ➔ Gemini 3.1 Pro Preview (Insight)
                    </p>
                </div>
             </div>
          </div>

        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-600 uppercase font-bold tracking-[0.2em]">
            <div className="flex items-center gap-4">
                <span>Rumo Logistics - PAC Mission Control</span>
                <span className="text-slate-800">|</span>
                <span>v2.0 Beta (Predictive Engine)</span>
            </div>
            <div className="flex items-center gap-2">
                <LayoutDashboard className="w-3 h-3" />
                <span>Dashboard Operacional</span>
            </div>
        </footer>

      </div>
    </div>
  );
}
