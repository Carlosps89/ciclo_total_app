"use client";

import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TooltipItem
} from 'chart.js';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft, Clock, Truck, MapPin, Search, Activity, CheckCircle } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface QueueSummary {
  status: string;
  avg_atual_h: number;
  volume: number;
  avg_hist_h: number;
  p10: number;
  p25: number;
  p75: number;
  avg_acumulado_h: number;
  p75_acumulado: number;
}

interface Vehicle {
  id: string;
  placa: string;
  origem: string;
  status: string;
  horas: number;
  horas_acumuladas: number;
  timestamps: {
    emissao?: string;
    agendamento?: string;
    cheguei?: string;
    chamada?: string;
    chegada?: string;
    janela?: string;
  }
}

const STAGE_COLORS: Record<string, string> = {
  'Operação Terminal': '#10b981',
  'Trânsito Externo': '#0ea5e9',
  'Fila Externa': '#f59e0b',
  'Programado': '#64748b'
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  'Operação Terminal': <Activity size={14} className="text-emerald-500" />,
  'Trânsito Externo': <Truck size={14} className="text-sky-500" />,
  'Fila Externa': <Clock size={14} className="text-amber-500" />,
  'Programado': <MapPin size={14} className="text-slate-500" />
};

function VehicleTimeline({ vehicle }: { vehicle: Vehicle }) {
  const stages = [
    { label: 'Emissão', time: vehicle.timestamps.emissao, icon: <CheckCircle size={14} /> },
    { label: 'Janela', time: vehicle.timestamps.janela, icon: <Clock size={14} />, isJanela: true },
    { label: 'Agendamento', time: vehicle.timestamps.agendamento, icon: <Clock size={14} /> },
    { label: 'Chegou', time: vehicle.timestamps.cheguei, icon: <MapPin size={14} /> },
    { label: 'Chamado', time: vehicle.timestamps.chamada, icon: <Activity size={14} /> },
    { label: 'Chegada', time: vehicle.timestamps.chegada, icon: <Truck size={14} /> },
  ].filter(s => s.time);

  return (
    <div className="flex flex-col gap-3 mt-2 p-3 bg-white/5 rounded-xl border border-white/5">
      <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Histórico de Etapas</h4>
      <div className="flex flex-wrap gap-4">
        {stages.map((s, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
              {s.icon}
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-300">{s.label}</div>
              <div className="text-[9px] text-slate-500">
                {s.isJanela ? s.time : new Date(s.time!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </div>
            </div>
            {idx < stages.length - 1 && <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function DrillDownModal({ 
  status, 
  vehicles, 
  onClose 
}: { 
  status: string; 
  vehicles: Vehicle[]; 
  onClose: () => void 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  const filtered = vehicles.filter(v => 
    v.placa.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.origem.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => b.horas - a.horas);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#02132b] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                {STAGE_ICONS[status] || <Truck size={20} />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{status}</h2>
              <p className="text-xs text-slate-400">{filtered.length} veículos identificados nesta etapa</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400"
          >
            <Activity className="rotate-45" size={24} />
          </button>
        </div>

        <div className="p-4 bg-white/1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar placa, GMO ou origem..."
              className="w-full bg-[#010b1a] border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((v) => (
              <div 
                key={v.id} 
                className={`p-4 rounded-2xl border transition-all ${
                  expandedVehicle === v.id 
                  ? 'bg-blue-500/5 border-blue-500/30' 
                  : 'bg-[#010b1a] border-white/5 hover:border-white/10'
                }`}
              >
                <div 
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => setExpandedVehicle(expandedVehicle === v.id ? null : v.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-lg font-bold text-white tracking-wider">{v.placa}</div>
                    <div className="text-[10px] text-slate-500 font-mono bg-white/5 px-2 py-0.5 rounded">ID: {v.id}</div>
                    <div className="flex flex-col">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Ciclo Acumulada</div>
                        <div className="text-xs text-emerald-400 font-bold">{v.horas_acumuladas.toFixed(1)}h</div>
                    </div>
                    <div className="text-xs text-slate-400 truncate max-w-[200px]">{v.origem}</div>
                  </div>
                  <div className="flex items-center gap-4 font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                      <span className="text-xs font-bold text-blue-400">{v.horas.toFixed(1)}h na etapa</span>
                    </div>
                    <Activity size={14} className={`transition-transform ${expandedVehicle === v.id ? 'rotate-180' : ''}`} />
                  </div>
                </div>
                {expandedVehicle === v.id && (
                  <VehicleTimeline vehicle={v} />
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-20 text-center text-slate-500 italic">Nenhum veículo encontrado com este critério.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ForecastContent() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';
  const [summary, setSummary] = useState<QueueSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = () => {
      fetch(`/api/pac/forecast?terminal=${terminal}`)
        .then(res => res.json())
        .then(json => {
          setSummary(json.summary || []);
          setVehicles(json.vehicles || []);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    };
    
    fetchData();
    const interval = setInterval(fetchData, 60000); // 1 min auto-refresh for TV
    return () => clearInterval(interval);
  }, [terminal]);

  const chartData = {
    labels: summary.map(s => s.status),
    datasets: [
      {
        label: 'Volume de Veículos',
        data: summary.map(s => s.volume),
        backgroundColor: summary.map(s => STAGE_COLORS[s.status] || '#64748b'),
        borderRadius: 12,
        hoverOffset: 15,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_: unknown, elements: { index: number }[]) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        setSelectedStatus(summary[index].status);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(2, 19, 43, 0.95)',
        titleFont: { size: 14, weight: 'bold' as const },
        bodyFont: { size: 12 },
        padding: 12,
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        callbacks: {
          label: (item: TooltipItem<'bar'>) => `Volume: ${item.raw as number} veículos`,
          afterBody: (context: TooltipItem<'bar'>[]) => {
            const item = summary[context[0].dataIndex];
            return [
              '',
              `MÉDIA NA ETAPA: ${item.avg_atual_h.toFixed(1)}h`,
              `P75 ETAPA: ${item.p75.toFixed(1)}h`,
              '----------------',
              `CICLO ACUMULADO MÉDIO: ${item.avg_acumulado_h.toFixed(1)}h`,
              `P75 ACUMULADO: ${item.p75_acumulado.toFixed(1)}h`,
            ];
          }
        }
      }
    },
    scales: {
      y: { 
        beginAtZero: true, 
        grid: { color: 'rgba(255,255,255,0.03)' }, 
        ticks: { color: '#94a3b8', font: { size: 10 } } 
      },
      x: { 
        grid: { display: false }, 
        ticks: { color: '#f8fafc', font: { size: 12, weight: 'bold' as const } } 
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#010b1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
          <span className="text-slate-500 font-mono tracking-widest animate-pulse uppercase text-[8px]">Carregando Fila...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#010b1a] text-white font-sans overflow-hidden flex flex-col">
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

      <div className="flex-1 flex flex-col p-4 max-w-[1920px] mx-auto w-full">
        {/* Header - More compact */}
        <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.location.href = `/?terminal=${terminal}`}
              className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 border border-white/5"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-2xl font-black bg-linear-to-r from-emerald-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
              <Activity className="text-emerald-400" size={24} />
              FORECAST DE OPERAÇÕES
              <span className="text-xs font-light text-slate-500 tracking-[0.2em] ml-2 uppercase">Terminal {terminal}</span>
            </h1>
          </div>
          <div className="text-right">
              <div className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Última Atualização</div>
              <div className="text-sm font-mono text-emerald-400/80">{new Date().toLocaleTimeString('pt-BR')}</div>
          </div>
        </div>

        {/* Main Dashboard Layout */}
        <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
          {/* Summary Column - Made more compact */}
          <div className="col-span-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
            {summary.map((item) => (
              <div 
                key={item.status}
                onClick={() => setSelectedStatus(item.status)}
                className="group p-4 rounded-2xl bg-[#02132b] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/1 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    {STAGE_ICONS[item.status]}
                </div>
                <div className="flex flex-col gap-0.5 mb-2">
                  <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest">{item.status}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tracking-tight">{item.volume}</span>
                    <span className="text-slate-500 text-[10px] font-light lowercase">veículos</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[7px] text-slate-500 uppercase font-bold">Média Etapa</span>
                    <span className={`text-md font-mono ${item.avg_atual_h > item.avg_hist_h ? 'text-rose-400' : 'text-blue-400'}`}>
                      {item.avg_atual_h.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[7px] text-slate-500 uppercase font-bold">Ciclo Acumulada</span>
                    <span className="text-md font-mono text-emerald-400 font-bold">
                      {item.avg_acumulado_h.toFixed(1)}h
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex justify-between items-center text-[7px] uppercase tracking-tighter text-slate-500 font-bold">
                    <span>P75 Etapa: {item.p75.toFixed(1)}h</span>
                    <span>P75 Acumulado: {item.p75_acumulado.toFixed(1)}h</span>
                </div>
              </div>
            ))}
          </div>

          {/* Chart Area - Larger proportion */}
          <div className="col-span-9 bg-[#02132b] rounded-2xl border border-white/5 p-6 flex flex-col relative min-h-0">
            <h3 className="text-slate-500 text-[10px] font-black uppercase mb-4 flex items-center gap-2 tracking-widest">
              <Activity size={14} className="text-blue-400" /> Distribuição da Fila por Etapa Operacional
            </h3>
            
            <div className="flex-1 w-full relative min-h-0">
              <Bar data={chartData} options={chartOptions} />
            </div>

            {/* TV Legend */}
            <div className="mt-4 flex justify-center gap-8">
               {Object.entries(STAGE_COLORS).map(([name, color]) => (
                 <div key={name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }}></div>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">{name}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Modal */}
      {selectedStatus && (
        <DrillDownModal 
          status={selectedStatus} 
          vehicles={vehicles.filter(v => v.status === selectedStatus)}
          onClose={() => setSelectedStatus(null)}
        />
      )}
    </div>
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#010b1a] flex items-center justify-center font-mono text-slate-500 text-[8px] tracking-widest lowercase">initializing_forecast...</div>}>
      <ForecastContent />
    </Suspense>
  );
}

