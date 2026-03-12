"use client";

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, Title } from 'chart.js';
import { Bar, getElementAtEvent } from 'react-chartjs-2';
import { Calendar, AlertTriangle, X, Clock, MapPin, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, Title);

// Custom plugin to draw an alert icon on top of the bars where has_sla_breach is true
const alertPlugin = {
  id: 'alertPlugin',
  afterDatasetsDraw(chart: any) {
    const { ctx, data, chartArea: { top, bottom, left, right }, scales: { x, y } } = chart;
    ctx.save();
    
    data.datasets.forEach((dataset: any, i: number) => {
      chart.getDatasetMeta(i).data.forEach((bar: any, index: number) => {
        const breach = dataset.customData[index]?.has_sla_breach;
        if (breach) {
          const barTipX = bar.x;
          const barTipY = bar.y;
          
          // Draw an alert circle above the bar
          ctx.beginPath();
          ctx.fillStyle = '#f43f5e'; // Rose-500
          ctx.arc(barTipX, barTipY - 10, 5, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fda4af'; // Rose-300
          ctx.moveTo(barTipX, barTipY - 12);
          ctx.lineTo(barTipX, barTipY - 8);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(barTipX, barTipY - 5, 1, 0, Math.PI * 2);
          ctx.fillStyle = '#fda4af';
          ctx.fill();
        }
      });
    });
    ctx.restore();
  }
};

ChartJS.register(alertPlugin);

// Interfaces
interface BucketData {
  bucket_time: string;
  bucket_label: string; // Ex: 11/03 14:00
  volume: number;
  avg_gap_h: number;
  max_gap_days: number;
  offender_count: number;
  avg_offender_gap_h: number;
  has_sla_breach: boolean;
}

interface DrilldownVehicle {
  gmo_id: string;
  placa_tracao: string;
  origem: string;
  terminal: string;
  produto: string;
  dt_emissao_fmt: string;
  dt_agendamento_fmt: string;
  gap_hours: number;
  gap_days: number;
}

// Modal Component
function DrilldownModal({
  isOpen, onClose, terminal, hourTimestamp, bucketLabel, produto, slaDays
}: {
  isOpen: boolean; onClose: () => void; terminal: string; hourTimestamp: string; bucketLabel: string; produto: string; slaDays: number
}) {
  const [vehicles, setVehicles] = useState<DrilldownVehicle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !hourTimestamp) return;
    setLoading(true);
    let qs = `?terminal=${terminal}&hourTimestamp=${encodeURIComponent(hourTimestamp)}`;
    if (produto) qs += `&produto=${produto}`;

    fetch(`/api/pac/diagnostics/aging-drilldown${qs}`)
      .then(res => res.json())
      .then(data => {
        setVehicles(data.vehicles || []);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [isOpen, hourTimestamp, terminal, produto]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Side Panel */}
      <div className="relative w-full md:w-[600px] h-full bg-[#020a14] border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div>
            <h2 className="text-xl font-black text-rose-400 uppercase tracking-widest flex items-center gap-3">
              <Search className="w-5 h-5 text-rose-500" /> Detalhes do Gargalo
            </h2>
            <p className="text-xs text-white/50 uppercase tracking-widest mt-1">Caminhões agendados às {bucketLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
              <div className="w-8 h-8 rounded-full border-t-2 border-rose-500 animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Buscando ofensores...</span>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Nenhum veículo encontrado</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {vehicles.map((v, i) => {
                const isOffender = v.gap_days >= slaDays;
                return (
                  <div key={i} className={`p-5 rounded-2xl border transition-all ${isOffender ? 'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                          {v.placa_tracao}
                        </span>
                        <span className="text-[10px] bg-white/10 text-white/70 px-2 py-1 rounded-md uppercase tracking-widest font-bold">
                          {v.produto} • {v.gmo_id}
                        </span>
                      </div>
                      {isOffender && (
                        <div className="flex items-center gap-1.5 bg-rose-500/20 text-rose-400 px-2 py-1 rounded shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-widest">SLA Violado</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-2 mb-4">
                       <div>
                         <span className="text-[9px] text-white/40 uppercase font-black tracking-widest block mb-1">Emissão da NF</span>
                         <span className="text-xs text-slate-300 font-mono">{v.dt_emissao_fmt}</span>
                       </div>
                       <div>
                         <span className="text-[9px] text-white/40 uppercase font-black tracking-widest block mb-1">Agendamento Criado</span>
                         <span className="text-xs text-emerald-300 font-mono">{v.dt_agendamento_fmt}</span>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
                      <div className="flex-1 bg-black/40 h-[4px] rounded-full overflow-hidden">
                         <div className={`h-full ${isOffender ? 'bg-rose-500 w-full' : 'bg-blue-500 w-1/2'}`}></div>
                      </div>
                      <span className={`text-[11px] font-black uppercase tracking-widest ${isOffender ? 'text-rose-400' : 'text-blue-400'}`}>
                        Gap Absoluto: {v.gap_days.toFixed(1)} Dias
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Page Content
function AgingDashboardContent() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';
  const produto = searchParams.get('produto') || '';

  const dtNow = new Date();
  const firstDayOfMonth = new Date(dtNow.getFullYear(), dtNow.getMonth(), 1);

  // Helper to format Date to YYYY-MM-DD in local time
  const toISODate = (d: Date) => {
    const z = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };

  const [startDate, setStartDate] = useState(toISODate(firstDayOfMonth));
  const [endDate, setEndDate] = useState(toISODate(dtNow));
  const [slaDays, setSlaDays] = useState<number>(5);

  const [buckets, setBuckets] = useState<BucketData[]>([]);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<any>(null);

  const [drilldown, setDrilldown] = useState<{ isOpen: boolean; hourTimestamp: string; bucketLabel: string }>({
    isOpen: false, hourTimestamp: '', bucketLabel: ''
  });

  useEffect(() => {
    setLoading(true);
    let qs = `?terminal=${terminal}&startDate=${startDate}&endDate=${endDate}&slaDays=${slaDays}`;
    if (produto) qs += `&produto=${produto}`;

    fetch(`/api/pac/diagnostics/aging${qs}`)
      .then(res => res.json())
      .then(data => {
        setBuckets(data.buckets || []);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [terminal, startDate, endDate, slaDays, produto]);

  // Chart Data preparation
  // Multi-line labels: ['14:00', '11/03']
  const chartLabels = buckets.map(b => {
    // b.bucket_label is "11/03 14:00"
    const parts = b.bucket_label.split(' ');
    // line 1: time, line 2: date
    return [parts[1] + 'h', parts[0]];
  });

  const chartDataObj = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Gap Médio (Dias)',
        data: buckets.map(b => parseFloat((b.avg_gap_h / 24).toFixed(1))),
        backgroundColor: buckets.map(b => b.has_sla_breach ? 'rgba(244, 63, 94, 0.8)' : 'rgba(56, 189, 248, 0.4)'),
        hoverBackgroundColor: buckets.map(b => b.has_sla_breach ? 'rgba(244, 63, 94, 1)' : 'rgba(56, 189, 248, 0.8)'),
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        customData: buckets // Passed so our alert plugin can read has_sla_breach
      }
    ]
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event: any, elements: any[]) => {
      // The secondary parameter 'elements' carries the directly clicked bar items
      if (elements.length > 0) {
        const idx = elements[0].index;
        const bucket = buckets[idx];
        setDrilldown({
          isOpen: true,
          hourTimestamp: bucket.bucket_time,
          bucketLabel: bucket.bucket_label
        });
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#02132b',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        titleFont: { size: 14, weight: '900' },
        padding: 12,
        callbacks: {
          title: (ctx: any) => {
            return `Janela: ${ctx[0].label[0]} em ${ctx[0].label[1]}`;
          },
          label: (ctx: any) => {
            const b = buckets[ctx.dataIndex];
            const lines = [
              `Total Agendados: ${b.volume}`,
              `Pior Ofensor: ${b.max_gap_days.toFixed(1)} dias`
            ];
            
            if (b.offender_count > 0) {
              lines.push(`Ofensores (>${slaDays}d): ${b.offender_count}`);
              lines.push(`Média Ofensores: ${(b.avg_offender_gap_h / 24).toFixed(1)} dias`);
              lines.push('⚠️ ALERTA: SLA VIOLADO NESTE GRUPO');
            }
            
            return lines;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } },
        title: {
            display: true,
            text: 'Gap Médio (Dias)',
            color: '#64748b',
            font: { size: 10, weight: 'bold' }
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#010b1a] p-4 md:p-8 flex flex-col font-sans">
      <style jsx global>{`
        body { margin: 0; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
      
      {/* Top Controls Header */}
      <div className="bg-[#020a14]/90 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 lg:p-8 flex flex-col md:flex-row justify-between items-center shadow-2xl z-10">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent flex items-center gap-4 tracking-tighter">
            Monitor do Tempo de Agendamento
            <span className="text-[11px] font-black bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-lg tracking-widest uppercase mt-1 lg:mt-0 shadow-inner">Gargalos Iniciais</span>
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-sm uppercase font-black tracking-[0.3em] text-white/70">{terminal} {produto && `• ${produto}`}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
            <p className="text-xs text-white/50 uppercase tracking-widest font-bold">Monitoramento do Lapso entre Emissão da Nota e Criação do Agendamento por Janela de Chegada</p>
          </div>
        </div>

        <div className="flex gap-4 mt-8 md:mt-0 items-center flex-wrap md:flex-nowrap">
          {/* Dates */}
          <div className="flex gap-2 shadow-xl bg-[#0b121c] border border-white/10 p-2 rounded-[24px]">
            <div className="relative group">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="appearance-none flex items-center gap-3 bg-transparent hover:bg-white/5 transition-all px-4 py-2 pl-12 rounded-[16px] text-xs font-black uppercase tracking-widest text-[#cbd5e1] outline-none border-none"
              />
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none group-hover:scale-110 transition-transform" />
            </div>
            <div className="w-px bg-white/10 my-2"></div>
            <div className="relative group">
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="appearance-none flex items-center gap-3 bg-transparent hover:bg-white/5 transition-all px-4 py-2 pl-12 rounded-[16px] text-xs font-black uppercase tracking-widest text-[#cbd5e1] outline-none border-none"
              />
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400 pointer-events-none group-hover:scale-110 transition-transform" />
            </div>
          </div>

          {/* SLA Threshold */}
          <div className="flex items-center gap-3 bg-rose-500/5 border border-rose-500/20 px-4 py-2 rounded-2xl shadow-inner ml-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] uppercase font-black tracking-widest text-rose-200">SLA Alerta Diário:</span>
            <input
              type="number"
              min="1"
              value={slaDays}
              onChange={e => setSlaDays(parseInt(e.target.value) || 5)}
              className="bg-black/50 border border-rose-500/20 rounded-lg px-2 py-1 text-rose-400 font-black text-sm w-16 text-center outline-none focus:border-rose-500 hover:border-rose-500/50 transition-colors"
              title="Avisa se houver pelo menos 1 caminhão excedendo N dias"
            />
            <span className="text-[10px] text-rose-500/50 font-bold uppercase">dias</span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 mt-8 bg-[#020a14] border border-white/5 rounded-[40px] p-8 lg:p-12 shadow-2xl relative flex flex-col min-h-[500px]">
         <div className="mb-6">
            <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-400" /> Histograma por Janela de Chegada
            </h3>
            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-2 max-w-2xl leading-relaxed">
              O Eixo X agrupa os caminhões pela **Janela Agendada (Chegada)**. A altura da barra demonstra a Média de Faturamento Antecipado (Gap de Faturamento). Bolinhas vermelhas sinalizam janelas contendo infração do SLA de {slaDays} dias.
            </p>
         </div>

         <div className="flex-1 relative min-h-[300px] w-full overflow-x-auto custom-scrollbar z-0">
            {loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10">
                    <div className="w-12 h-12 rounded-full border-t-4 border-orange-500 border-opacity-50 animate-spin"></div>
                    <span className="mt-4 text-xs font-black uppercase text-orange-500/60 tracking-widest">Processando Funil...</span>
                </div>
            ) : buckets.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-black uppercase text-white/20 tracking-widest">Nenhuma violação encontrada no período</span>
                </div>
            ) : (
                <div className="flex flex-col" style={{ minWidth: `${Math.max(100, chartLabels.length * 3.5)}%`, height: '100%' }}>
                   <div className="flex-1 min-h-[300px]">
                      <Bar ref={chartRef} data={chartDataObj} options={chartOptions} />
                   </div>

                   {/* Analysis Row: Qtd Ofensores */}
                   <div className="mt-4 border-t border-white/5 pt-4">
                      <div className="flex items-center gap-3 mb-4 sticky left-0">
                        <div className="p-1 px-3 bg-rose-500/10 rounded-full border border-rose-500/20 shadow-inner">
                           <span className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400">Análise por Janela</span>
                        </div>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-rose-500/20 to-transparent"></div>
                      </div>
                      
                      <div className="flex w-full">
                        {/* Buffer to align with Y-axis of the chart */}
                        <div className="w-14 flex flex-col justify-center sticky left-0 bg-[#020a14] z-10">
                           <span className="text-[10px] font-black text-white/20 uppercase tracking-tighter leading-none pr-2 text-right">Qtd<br/>SLA</span>
                        </div>
                        
                        <div className="flex-1 flex">
                          {buckets.map((b, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center group cursor-pointer" onClick={() => {
                                setDrilldown({
                                  isOpen: true,
                                  hourTimestamp: b.bucket_time,
                                  bucketLabel: b.bucket_label
                                });
                            }}>
                              <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-[11px] font-black transition-all ${b.offender_count > 0 ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)] scale-110' : 'text-white/10 group-hover:text-white/30'}`}>
                                {b.offender_count}
                              </div>
                              <div className={`w-[1px] h-2 mt-2 transition-all ${b.offender_count > 0 ? 'bg-rose-500/50' : 'bg-white/5'}`}></div>
                            </div>
                          ))}
                        </div>
                      </div>
                   </div>
                </div>
            )}
         </div>
      </div>

      {/* Drilldown */}
      <DrilldownModal 
         isOpen={drilldown.isOpen}
         onClose={() => setDrilldown(prev => ({ ...prev, isOpen: false }))}
         hourTimestamp={drilldown.hourTimestamp}
         bucketLabel={drilldown.bucketLabel}
         terminal={terminal}
         produto={produto}
         slaDays={slaDays}
      />
    </div>
  );
}

export default function AgingDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#010b1a] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-4 border-orange-500"></div></div>}>
       <AgingDashboardContent />
    </Suspense>
  );
}
