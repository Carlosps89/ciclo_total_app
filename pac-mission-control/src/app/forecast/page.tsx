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
  p10_acumulado: number;
  p25_acumulado: number;
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

const STAGE_ORDER = ['Programado', 'Fila Externa', 'Trânsito Externo', 'Operação Terminal'];

const STAGE_COLORS: Record<string, string> = {
  'Operação Terminal': '#10b981',
  'Trânsito Externo': '#0ea5e9',
  'Fila Externa': '#f59e0b',
  'Programado': '#64748b'
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  'Operação Terminal': <Activity size={20} className="text-emerald-500" />,
  'Trânsito Externo': <Truck size={20} className="text-sky-500" />,
  'Fila Externa': <Clock size={20} className="text-amber-500" />,
  'Programado': <MapPin size={20} className="text-slate-500" />
};

function MetricTriple({ label, p10, p25, p75, avg, colorClass = 'text-blue-400' }: { 
  label: string, p10: number, p25: number, p75: number, avg: number, colorClass?: string 
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end border-b border-white/5 pb-1 mb-1">
        <span className="text-[9px] text-slate-500 font-bold uppercase">{label}</span>
        <span className={`text-lg font-black font-mono ${colorClass}`}>{avg.toFixed(1)}h</span>
      </div>
      <div className="grid grid-cols-3 gap-1 px-1">
        <div className="flex flex-col">
          <span className="text-[7px] text-slate-600 font-bold uppercase">P10</span>
          <span className="text-[10px] font-bold text-slate-400 font-mono">{p10.toFixed(1)}h</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7px] text-slate-600 font-bold uppercase">P25</span>
          <span className="text-[10px] font-bold text-slate-400 font-mono">{p25.toFixed(1)}h</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7px] text-slate-600 font-bold uppercase">P75</span>
          <span className="text-[10px] font-bold text-slate-400 font-mono">{p75.toFixed(1)}h</span>
        </div>
      </div>
    </div>
  );
}

function FlowNode({ item, onSelect }: { item: QueueSummary, onSelect: (status: string) => void }) {
  const color = STAGE_COLORS[item.status] || '#64748b';
  
  return (
    <div 
      onClick={() => onSelect(item.status)}
      className="flex-1 min-w-[300px] h-full flex flex-col group cursor-pointer animate-in fade-in slide-in-from-bottom duration-500"
    >
      <div className="relative flex flex-col h-full p-6 rounded-[2.5rem] bg-[#02132b] border border-white/5 group-hover:border-blue-500/30 group-hover:bg-blue-500/5 transition-all shadow-2xl overflow-hidden backdrop-blur-md">
        {/* Glow Effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[80px] opacity-20 pointer-events-none" style={{ backgroundColor: color }}></div>
        
        {/* Header Node */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-white/5 text-white/80 group-hover:scale-110 transition-transform shadow-inner">
                {STAGE_ICONS[item.status]}
              </div>
              <h3 className="text-sm font-black text-slate-400 group-hover:text-white transition-colors uppercase tracking-[0.2em]">{item.status}</h3>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-4xl font-black tracking-tighter text-white">{item.volume}</span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">VEÍCULOS NA FILA</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="flex-1 flex flex-col gap-8 justify-center">
          <MetricTriple 
            label="Média da Etapa" 
            avg={item.avg_atual_h}
            p10={item.p10} 
            p25={item.p25} 
            p75={item.p75}
            colorClass={item.avg_atual_h > item.avg_hist_h && item.avg_hist_h > 0 ? 'text-rose-400' : 'text-blue-400'}
          />
          
          <MetricTriple 
            label="Acumulado até aqui" 
            avg={item.avg_acumulado_h}
            p10={item.p10_acumulado} 
            p25={item.p25_acumulado} 
            p75={item.p75_acumulado}
            colorClass="text-emerald-400"
          />
        </div>

        {/* Footer info */}
        {item.avg_hist_h > 0 && (
          <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center">
            <span className="text-[8px] text-slate-600 font-bold uppercase">Meta Histórica</span>
            <span className="text-xs font-mono text-slate-500">{item.avg_hist_h.toFixed(1)}h</span>
          </div>
        )}
      </div>
    </div>
  );
}

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

  const orderedSummary = STAGE_ORDER.map(status => {
    return summary.find(s => s.status === status) || {
      status, volume: 0, avg_atual_h: 0, avg_hist_h: 0, p10: 0, p25: 0, p75: 0,
      avg_acumulado_h: 0, p10_acumulado: 0, p25_acumulado: 0, p75_acumulado: 0
    };
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#010b1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
          <span className="text-slate-500 font-mono tracking-widest animate-pulse uppercase text-[8px]">Carregando Forecast...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#010b1a] text-white font-sans overflow-y-auto overflow-x-hidden flex flex-col p-8">
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

      {/* Header - Transparent and floating */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => window.location.href = `/?terminal=${terminal}`}
            className="p-4 hover:bg-white/5 rounded-3xl transition-all text-slate-400 border border-white/5 group shadow-lg"
          >
            <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-emerald-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-4 tracking-tight">
              FORECAST DE OPERAÇÕES
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black text-blue-500/80 uppercase tracking-[0.4em]">{terminal}</span>
              <div className="w-1 h-1 rounded-full bg-slate-700"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Painel Operacional em Tempo Real</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="px-6 py-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-end shadow-xl">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Última Sincronização</span>
              <span className="text-lg font-mono text-emerald-400 font-black">{new Date().toLocaleTimeString('pt-BR')}</span>
          </div>
        </div>
      </div>

      {/* Horizontal Flow Container */}
      <div className="flex-1 flex gap-6 min-h-0 items-center overflow-x-auto pb-8 custom-scrollbar relative px-2">
        {/* Connection Line Layer (Absolutes) */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-slate-800 via-blue-900/40 to-slate-800 -translate-y-1/2 -z-10 mx-24"></div>
        
        {orderedSummary.map((item, idx) => (
          <React.Fragment key={item.status}>
            <FlowNode item={item} onSelect={setSelectedStatus} />
            {idx < orderedSummary.length - 1 && (
               <div className="flex flex-col items-center justify-center px-2 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-blue-500/50">
                    <Truck size={16} />
                  </div>
               </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Footer Info / TV Mode Legend */}
      <div className="mt-8 flex justify-between items-center border-t border-white/5 pt-6">
        <div className="flex gap-12">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempos de Etapa</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempos Acumulados</span>
            </div>
        </div>
        <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest italic font-mono bg-white/2 px-4 py-2 rounded-full border border-white/5">
          Dica: Clique em qualquer etapa para visualizar os veículos detalhadamente.
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
    <Suspense fallback={<div className="min-h-screen bg-[#010b1a] flex items-center justify-center font-mono text-slate-500 text-[8px] tracking-widest lowercase">initializing_forecast_flow...</div>}>
      <ForecastContent />
    </Suspense>
  );
}

