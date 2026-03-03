"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft, Clock, Truck, MapPin, Search, Activity, CheckCircle, Scale } from 'lucide-react';

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
}

interface Vehicle {
  id: string;
  placa: string;
  origem: string;
  status: string;
  horas: number;
}

const STAGE_COLORS: Record<string, string> = {
  'Em Descarga': '#10b981',
  'Aguardando Balança': '#0ea5e9',
  'Fim Operação': '#6366f1',
  'Em Trânsito Interno': '#3b82f6',
  'No Pátio': '#f59e0b',
  'Programado': '#64748b'
};

function ForecastContent() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';
  const [summary, setSummary] = useState<QueueSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setLoading(true);
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
  }, [terminal]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const matchesStatus = selectedStatus ? v.status === selectedStatus : true;
      const matchesSearch = searchTerm 
        ? v.placa.toLowerCase().includes(searchTerm.toLowerCase()) || 
          v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.origem.toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [vehicles, selectedStatus, searchTerm]);

  const chartData = {
    labels: summary.map(s => s.status),
    datasets: [
      {
        label: 'Volume de Veículos',
        data: summary.map(s => s.volume),
        backgroundColor: summary.map(s => STAGE_COLORS[s.status] || '#64748b'),
        borderRadius: 8,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_: unknown, elements: { index: number }[]) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const status = summary[index].status;
        setSelectedStatus(status === selectedStatus ? null : status);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterBody: (context: { dataIndex: number }[]) => {
            const item = summary[context[0].dataIndex];
            return `Média Atual: ${item.avg_atual_h.toFixed(1)}h\nBenchmark: ${item.avg_hist_h.toFixed(1)}h`;
          }
        }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
      x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#010b1a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#010b1a] p-4 md:p-8 text-white font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button 
                onClick={() => window.location.href = `/?terminal=${terminal}`}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400"
              >
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                Fila de Descarga & Operação
              </h1>
            </div>
            <p className="text-slate-400 text-sm">Monitoramento detalhado do fluxo de descarga no terminal {terminal}.</p>
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            <div className="flex-1 md:w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Buscar placa, GMO ou origem..."
                className="w-full bg-[#02132b] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {summary.map((item) => (
            <div 
              key={item.status}
              onClick={() => setSelectedStatus(item.status === selectedStatus ? null : item.status)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedStatus === item.status 
                ? 'bg-blue-500/10 border-blue-500/50 scale-[1.02]' 
                : 'bg-[#02132b] border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider truncate mr-2">{item.status}</span>
                {item.status === 'Em Descarga' && <Activity size={12} className="text-emerald-500" />}
                {item.status === 'Aguardando Balança' && <Scale size={12} className="text-sky-500" />}
                {item.status === 'Fim Operação' && <CheckCircle size={12} className="text-indigo-500" />}
                {item.status === 'No Pátio' && <Clock size={12} className="text-amber-500" />}
                {item.status === 'Programado' && <Truck size={12} className="text-slate-500" />}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{item.volume}</span>
                  <span className="text-slate-500 text-[10px]">veículos</span>
                </div>
                <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-slate-500">Média:</span>
                    <span className={item.avg_atual_h > item.avg_hist_h ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                      {item.avg_atual_h.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-slate-500">Meta:</span>
                    <span className="text-slate-400">{item.avg_hist_h.toFixed(1)}h</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts & Drill-down */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-[#02132b] rounded-2xl border border-white/5 p-6 flex flex-col min-h-[400px]">
            <h3 className="text-slate-400 text-sm font-bold uppercase mb-6 flex items-center gap-2">
              <MapPin size={16} /> Mapa da Fila (Descarga)
            </h3>
            <div className="flex-1 relative">
              <Bar data={chartData} options={chartOptions} />
            </div>
            <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/5">
                <h4 className="text-[10px] text-slate-400 font-bold uppercase mb-2">Legenda Operacional</h4>
                <div className="grid grid-cols-2 gap-2">
                   {Object.entries(STAGE_COLORS).map(([name, color]) => (
                     <div key={name} className="flex items-center gap-1.5 text-[9px] text-slate-500">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                        <span className="truncate">{name}</span>
                     </div>
                   ))}
                </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#02132b] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/1">
              <h3 className="text-slate-400 text-sm font-bold uppercase flex items-center gap-2">
                {selectedStatus ? `Veículos: ${selectedStatus}` : 'Todos os Veículos de Descarga'}
                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full text-[10px] lowercase font-normal">
                  {filteredVehicles.length} detectados
                </span>
              </h3>
              {selectedStatus && (
                <button 
                  onClick={() => setSelectedStatus(null)}
                  className="text-white/40 hover:text-white text-[10px] uppercase font-bold transition-colors"
                >
                  Limpar Filtro
                </button>
              )}
            </div>
            
            <div className="overflow-x-auto flex-1 max-h-[600px]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#02132b] text-slate-500 text-[10px] uppercase z-10 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-bold">GMO / Placa</th>
                    <th className="px-6 py-4 font-bold">Origem</th>
                    <th className="px-6 py-4 font-bold">Status Detalhado</th>
                    <th className="px-6 py-4 font-bold">Aging (Etapa)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors uppercase">{v.placa}</div>
                        <div className="text-[10px] text-slate-500 font-mono">ID: {v.id}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs truncate max-w-[150px]">{v.origem}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[v.status] || '#64748b' }}></div>
                            <span className="text-[10px] font-bold uppercase text-slate-300">
                                {v.status}
                            </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <div className={`h-1 w-12 rounded-full bg-white/5 overflow-hidden`}>
                             <div 
                                className={`h-full ${v.horas > 5 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                                style={{ width: `${Math.min(100, (v.horas/10)*100)}%` }}
                             ></div>
                          </div>
                          <span className={v.horas > 5 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                            {v.horas.toFixed(1)}h
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredVehicles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500 italic text-xs">
                        Nenhum veículo identificado para descarga com os filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#010b1a] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500"></div></div>}>
      <ForecastContent />
    </Suspense>
  );
}
