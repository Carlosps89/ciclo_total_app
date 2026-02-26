'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, Activity, X, Download, ChevronRight, TrendingUp, CalendarClock } from 'lucide-react';
import * as xlsx from 'xlsx';
import clsx from 'clsx';
import { VehicleItem } from '@/lib/types';
import origemGeos from '@/data/origem_geos.json';

// Dynamic import for Map component to avoid SSR issues
const OriginsMap = dynamic(
  () => import('@/components/OriginsMap').then(mod => mod.OriginsMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-gray-900 animate-pulse" /> }
);

// Types
interface OriginSummary {
  origem: string;
  volume: number;
  p50: number;
  p90: number;
  avg: number;
}
interface GeoMap { [key: string]: { lat: number; lon: number; uf: string } }

export default function OrigensPage() {
  return (
    <Suspense fallback={<div className="p-10 text-white">Carregando mapa...</div>}>
      <OrigensContent />
    </Suspense>
  );
}

function OrigensContent() {
  // --- STATE ---
  const [range, setRange] = useState('today'); // today|week|month|year
  const [summary, setSummary] = useState<OriginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrigem, setSelectedOrigem] = useState<string | null>(null);
  
  const [selectedProduto, setSelectedProduto] = useState<string>('');
  const [availableProdutos, setAvailableProdutos] = useState<string[]>([]);
  const [selectedPraca, setSelectedPraca] = useState<string>('TODAS');
  const [availablePracas, setAvailablePracas] = useState<string[]>(['TODAS']);

  // Load Praca from Local Storage
  useEffect(() => {
    const saved = localStorage.getItem('pac_filters_praca_TRO');
    if (saved) {
      setSelectedPraca(saved);
    }
  }, []);

  // Save Praca to Local Storage
  useEffect(() => {
    if (selectedPraca) {
      localStorage.setItem('pac_filters_praca_TRO', selectedPraca);
    }
  }, [selectedPraca]);

  // Mapped Geo Data
  const geoMap: GeoMap = useMemo(() => {
     const m: GeoMap = {};
     origemGeos.forEach((o: any) => {
         m[o.origem] = { lat: o.lat, lon: o.lon, uf: o.uf };
     });
     return m;
  }, []);

  // Fetch Summary
  const fetchSummary = async () => {
     setLoading(true);
     setSelectedOrigem(null);
     try {
         const pParam = selectedProduto ? `&produto=${encodeURIComponent(selectedProduto)}` : '';
         const prParam = selectedPraca ? `&praca=${encodeURIComponent(selectedPraca)}` : '';
         const res = await fetch(`/api/pac/origens/summary?terminal=TRO&range=${range}${pParam}${prParam}`);
         if(res.ok) {
             const json = await res.json();
             setSummary(json.items || []);
         }
     } catch(e) {
         console.error(e);
     } finally {
         setLoading(false);
     }
  };

  useEffect(() => {
     fetchSummary();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedProduto, selectedPraca]);

  useEffect(() => {
    const fetchProds = async () => {
      try {
        const res = await fetch(`/api/pac/produtos?terminal=TRO`);
        if(res.ok) {
          const data = await res.json();
          setAvailableProdutos(data.items || []);
        }
      } catch (e) {
        console.error("Failed to fetch products", e);
      }
    };
    
    const fetchPracas = async () => {
      try {
        const res = await fetch(`/api/pac/pracas?terminal=TRO`);
        if(res.ok) {
          const data = await res.json();
          setAvailablePracas(data.pracas || ['TODAS']);
        }
      } catch (e) {
        console.error("Failed to fetch pracas", e);
      }
    };
    
    fetchProds();
    fetchPracas();
  }, []);


  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // Separate origins with/without coordinates
  const { mapped } = useMemo(() => {
      const mapped: OriginSummary[] = [];
      
      summary.forEach(s => {
          if (geoMap[s.origem]) mapped.push(s);
      });
      return { mapped };
  }, [summary, geoMap]);


  if (!isMounted) return null;

  const sortedSummary = [...summary].sort((a,b) => b.volume - a.volume);
  const totalVolume = summary.reduce((acc, s) => acc + s.volume, 0);
  const totalAccumulatedHours = summary.reduce((acc, s) => acc + (s.avg * s.volume), 0);
  const avgCycle = totalVolume > 0 ? (totalAccumulatedHours / totalVolume) : 0;

  return (
    <div className="h-screen bg-[#050505] text-gray-200 font-sans selection:bg-green-500/30 overflow-hidden flex flex-col relative">
      
      {/* BACKGROUND MAP (MAIN HERO) */}
      <div className="absolute inset-0 z-0 bg-gray-900">
          {isMounted && (
            <OriginsMap 
                data={mapped.map(m => ({
                    origem: m.origem,
                    lat: geoMap[m.origem].lat,
                    lon: geoMap[m.origem].lon,
                    volume: m.volume,
                    avg: m.avg
                }))}
                onSelectOrigin={setSelectedOrigem}
                selectedOrigin={selectedOrigem}
            />
          )}
          
          {/* Global Loading Overlay */}
          {loading && (
              <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center backdrop-blur-[2px]">
                  <Loader2 className="animate-spin text-green-500 w-12 h-12" />
              </div>
          )}
      </div>

      {/* FLOATING HEADER / CONTROLS */}
      <header className="absolute top-6 left-6 right-80 z-10 flex flex-col gap-4 pointer-events-none">
        {/* Title & Back Button */}
        <div className="flex items-center gap-4 pointer-events-auto">
          <Link href="/" className="p-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition text-white/70 hover:text-white hover:border-green-500/50 group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 px-6 rounded-3xl shadow-2xl">
            <h1 className="text-xl font-black tracking-tighter text-white uppercase flex items-center gap-3 leading-none italic">
               <span className="text-green-500">MAPA DE ORIGENS</span>
            </h1>
            <p className="text-white/40 text-[9px] mt-1 uppercase tracking-[0.3em] font-bold">
               Performance Logística • TRO
            </p>
          </div>
        </div>

        {/* Floating Filters Card */}
        <div className="flex items-center gap-3 pointer-events-auto w-fit bg-black/60 backdrop-blur-xl border border-white/10 p-2 pl-4 rounded-2xl shadow-2xl">
              <div className="flex items-center gap-2 border-r border-white/10 pr-4 mr-1">
                {['today', 'week', 'month'].map(r => (
                    <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={clsx(
                            "px-4 py-1.5 text-[10px] font-black uppercase rounded-xl transition-all",
                            range === r ? "bg-green-500 text-black shadow-lg shadow-green-500/20" : "text-white/40 hover:text-white hover:bg-white/5"
                        )}
                    >
                        {r === 'today' ? 'Hoje' : r === 'week' ? 'Semana' : 'Mês'}
                    </button>
                ))}
              </div>

              <select 
                value={selectedProduto} 
                onChange={e => setSelectedProduto(e.target.value)}
                className="bg-transparent text-white rounded-xl text-[10px] uppercase font-bold px-3 py-2 cursor-pointer outline-none hover:bg-white/5 transition border border-white/5 focus:border-green-500/50"
              >
                <option value="" className="bg-gray-950">TODOS PRODUTOS</option>
                {availableProdutos.map(p => <option key={p} value={p} className="bg-gray-950">{p}</option>)}
              </select>

              <select 
                value={selectedPraca} 
                onChange={e => setSelectedPraca(e.target.value)}
                className="bg-transparent text-white rounded-xl text-[10px] uppercase font-bold px-3 py-2 cursor-pointer outline-none hover:bg-white/5 transition border border-white/5 focus:border-green-500/50"
              >
                {availablePracas.map(p => <option key={p} value={p} className="bg-gray-950">{p}</option>)}
              </select>
        </div>
      </header>
      
      {/* RANKING SIDEBAR (RIGHT) */}
      <aside className="absolute top-6 bottom-6 right-6 w-72 z-10 flex flex-col pointer-events-none">
          <div className="flex-1 bg-black/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-6 shadow-2xl pointer-events-auto flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                      </div>
                      <h3 className="text-xs font-black text-white uppercase tracking-widest">RANKING DE ORIGENS</h3>
                  </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4 mb-8 shrink-0">
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                      <p className="text-[9px] uppercase text-white/40 font-bold mb-1">Total Veículos</p>
                      <p className="text-lg font-black text-white">{totalVolume}</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/5 text-right">
                      <p className="text-[9px] uppercase text-white/40 font-bold mb-1">Média Ciclo</p>
                      <p className="text-lg font-black text-green-400">
                          {avgCycle.toFixed(1)}h
                      </p>
                  </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                  {sortedSummary.map((s, idx) => (
                      <button 
                        key={s.origem}
                        onClick={() => setSelectedOrigem(s.origem)}
                        className={clsx(
                            "w-full p-4 rounded-2xl flex items-center justify-between transition-all group border",
                            selectedOrigem === s.origem ? "bg-green-500 border-green-500" : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20"
                        )}
                      >
                          <div className="flex items-center gap-3">
                              <span className={clsx(
                                  "text-[10px] font-black w-5",
                                  selectedOrigem === s.origem ? "text-black" : "text-white/20"
                              )}>
                                  {(idx + 1).toString().padStart(2, '0')}
                              </span>
                              <div className="text-left">
                                  <p className={clsx("text-[11px] font-black uppercase transition-colors truncate max-w-[120px]", selectedOrigem === s.origem ? "text-black" : "text-white group-hover:text-green-400")}>{s.origem}</p>
                                  <p className={clsx("text-[9px] font-bold uppercase", selectedOrigem === s.origem ? "text-black/60" : "text-white/40")}>{s.volume} Veículos</p>
                              </div>
                          </div>
                          <div className="text-right">
                              <p className={clsx("text-xs font-black", selectedOrigem === s.origem ? "text-black" : (s.avg > 48 ? "text-orange-500" : "text-green-400"))}>
                                  {s.avg.toFixed(1)}h
                              </p>
                              <ChevronRight className={clsx("w-3 h-3 ml-auto mt-0.5", selectedOrigem === s.origem ? "text-black/40" : "text-white/20")} />
                          </div>
                      </button>
                  ))}
                  {summary.length === 0 && !loading && (
                      <p className="text-center text-[10px] text-white/30 uppercase font-black py-10 tracking-widest">Nenhuma origem encontrada</p>
                  )}
              </div>
          </div>
          
          <div className="mt-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-center pointer-events-auto">
              <p className="text-[8px] text-white/20 uppercase tracking-[0.4em] font-black">PAC MISSION CONTROL • v2.0</p>
          </div>
      </aside>

      {/* DRAWER FOR SELECTED ORIGIN */}
      <OriginDrawer 
         origem={selectedOrigem} 
         onClose={() => setSelectedOrigem(null)} 
         terminal="TRO" 
         produto={selectedProduto}
         praca={selectedPraca}
      />
    </div>
  );
}

// --- SUB COMPONENTS ---

interface OriginDetails {
  kpis: {
    last_hour: { avg_cycle_h: number; trips: number };
    today: { avg_cycle_h: number; trips: number };
    month: { avg_cycle_h: number; trips: number };
    year: { avg_cycle_h: number; trips: number };
  };
  vehicles: VehicleItem[];
}

function OriginDrawer({ origem, onClose, terminal, produto, praca }: { origem: string | null; onClose: () => void; terminal: string; produto?: string; praca?: string }) {
    const [data, setData] = useState<OriginDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(null);

    useEffect(() => {
        if (!origem) return;
        setLoading(true);
        setData(null);
        
        const pParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
        const prParam = praca ? `&praca=${encodeURIComponent(praca)}` : '';
        
        fetch(`/api/pac/origens/details?terminal=${terminal}&origem=${encodeURIComponent(origem)}${pParam}${prParam}`)
            .then(r => r.json())
            .then(json => {
                setData({
                    kpis: json.kpis,
                    vehicles: json.vehicles || []
                });
            })
            .finally(() => {
                setLoading(false);
            });
    }, [origem, terminal, produto, praca]);
    
    // Lock scroll
    useEffect(() => {
       if(!origem) return;
       const s = document.body.style.overflow;
       document.body.style.overflow = 'hidden';
       return () => { document.body.style.overflow = s; };
    }, [origem]);

    const handleExportExcel = () => {
        if (!data?.vehicles || data.vehicles.length === 0) return;

        const reportData = data.vehicles.map(v => ({
            'GMO ID': v.gmo_id,
            'PLACA': v.placa,
            'PRODUTO': v.produto,
            'CLIENTE': v.cliente || 'N/A',
            'ORIGEM': v.origem,
            'CICLO TOTAL (H)': v.ciclo_total_h,
            'H VERDE': v.h_verde,
            'H INTERNO': v.h_interno,
            'H VIAGEM': v.h_viagem,
            'H AGENDAMENTO': v.h_aguardando,
            'DT EMISSAO': v.dt_emissao || '',
            'DT AGENDAMENTO': v.dt_agendamento || '',
            'DT JANELA': v.dt_janela || '',
            'DT CHEGUEI': v.dt_cheguei || '',
            'DT CHAMADA': v.dt_chamada || '',
            'DT CHEGADA': v.dt_chegada || '',
            'DT PESO SAIDA': v.dt_peso_saida || ''
        }));

        const ws = xlsx.utils.json_to_sheet(reportData);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Veículos");
        xlsx.writeFile(wb, `Ciclo_Veiculos_${origem}_Hoje.xlsx`);
    };

    if (!origem) return null;

    return (
        <div 
           className={`fixed inset-y-0 right-0 w-[550px] bg-gray-950 border-l border-gray-800 shadow-2xl z-50 transform translation-transform duration-300 flex flex-col ${origem ? 'translate-x-0' : 'translate-x-full'}`}
        >
            <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 shrink-0 bg-gray-900/50">
                <div>
                   <span className="text-[10px] uppercase text-white/50 tracking-widest font-bold">Detalhes da Origem</span>
                   <h2 className="text-xl font-black text-white uppercase">{origem}</h2>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded text-white"><X /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-green-500 w-8 h-8" /></div>
                ) : (
                   <>
                      {/* KPIs Grid */}
                      <div className="grid grid-cols-2 gap-3">
                          <KpiCard title="Última Hora" val={data?.kpis?.last_hour?.avg_cycle_h} vol={data?.kpis?.last_hour?.trips} color="blue" />
                          <KpiCard title="Hoje (Dia)" val={data?.kpis?.today?.avg_cycle_h} vol={data?.kpis?.today?.trips} color="green" />
                          <KpiCard title="Mês Atual" val={data?.kpis?.month?.avg_cycle_h} vol={data?.kpis?.month?.trips} color="purple" />
                          <KpiCard title="Ano Atual" val={data?.kpis?.year?.avg_cycle_h} vol={data?.kpis?.year?.trips} color="orange" />
                      </div>

                      {/* Vehicles List */}
                      <section>
                          <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                             <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Veículos de Hoje</h3>
                             {data?.vehicles && data.vehicles.length > 0 && (
                                <button 
                                    onClick={handleExportExcel}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded text-[10px] font-bold uppercase transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Exportar Excel
                                </button>
                             )}
                          </div>
                          
                          <div className="space-y-3">
                             {data?.vehicles.map((v, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => setSelectedVehicle(v)}
                                    className="bg-black/40 border border-zinc-800 rounded-lg p-3 hover:border-zinc-500 transition-all cursor-pointer group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="text-xs font-black text-white group-hover:text-green-400 transition-colors uppercase">{v.placa}</div>
                                            <div className="text-[10px] text-zinc-500 uppercase font-bold truncate max-w-[150px]">{v.cliente || 'Dono Desconhecido'}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-white">{v.ciclo_total_h}h</div>
                                            <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter">{v.produto}</div>
                                        </div>
                                    </div>
                                    
                                    {/* Mini Bars */}
                                    <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-zinc-800 mt-2">
                                        <div className="h-full bg-orange-500" style={{ width: `${(v.h_aguardando / v.ciclo_total_h) * 100}%` }} title="Agendamento"></div>
                                        <div className="h-full bg-purple-500" style={{ width: `${(v.h_viagem / v.ciclo_total_h) * 100}%` }} title="Viagem"></div>
                                        <div className="h-full bg-green-500" style={{ width: `${(v.h_verde / v.ciclo_total_h) * 100}%` }} title="Area Verde"></div>
                                        <div className="h-full bg-blue-500" style={{ width: `${(v.h_interno / v.ciclo_total_h) * 100}%` }} title="Ciclo Interno"></div>
                                    </div>
                                </div>
                             ))}

                             {(!data?.vehicles || data.vehicles.length === 0) && (
                                <div className="text-center py-10 text-zinc-500 text-xs italic">Nenhum veículo registrado hoje para esta origem.</div>
                             )}
                          </div>
                      </section>
                   </>
                )}
            </div>

            {/* Vehicle History Modal (Reuse logic from main dashboard) */}
            {selectedVehicle && (
                <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="bg-linear-to-b from-zinc-800 to-zinc-900 p-6 border-b border-zinc-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight">{selectedVehicle.placa}</h3>
                                <div className="text-xs font-bold text-zinc-500 uppercase mt-1 flex items-center gap-2">
                                    <Activity className="w-3 h-3" />
                                    Histórico de Ciclo
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedVehicle(null)}
                                className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/30 border border-zinc-800 p-3 rounded-xl">
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Ciclo Total</div>
                                    <div className="text-xl font-black text-white">{selectedVehicle.ciclo_total_h}h</div>
                                </div>
                                <div className="bg-black/30 border border-zinc-800 p-3 rounded-xl">
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">GMO ID</div>
                                    <div className="text-xl font-black text-white">{selectedVehicle.gmo_id}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <StageCard title="Agendamento" value={selectedVehicle.h_aguardando} color="orange" start={selectedVehicle.dt_emissao} end={selectedVehicle.dt_agendamento} icon={<CalendarClock className="w-4 h-4" />} />
                                <StageCard title="Viagem" value={selectedVehicle.h_viagem} color="purple" start={selectedVehicle.dt_agendamento} end={selectedVehicle.dt_chegada} icon={<TrendingUp className="w-4 h-4" />} />
                                <StageCard title="Área Verde" value={selectedVehicle.h_verde} color="green" start={selectedVehicle.dt_cheguei} end={selectedVehicle.dt_chamada} icon={<Activity className="w-4 h-4" />} />
                                <StageCard title="Ciclo Interno" value={selectedVehicle.h_interno} color="blue" start={selectedVehicle.dt_chegada} end={selectedVehicle.dt_peso_saida} icon={<Activity className="w-4 h-4" />} />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-black/20 border-t border-zinc-800 text-center">
                            <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-widest italic">Análise de Tempo Real • PAC Operações</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StageCard({ title, value, color, start, end, icon }: { title: string, value: number, color: string, start?: string, end?: string, icon?: React.ReactNode }) {
    const colorClass = color === 'orange' ? 'bg-orange-500' : color === 'purple' ? 'bg-purple-500' : color === 'green' ? 'bg-green-500' : 'bg-blue-500';
    const textClass = color === 'orange' ? 'text-orange-400' : color === 'purple' ? 'text-purple-400' : color === 'green' ? 'text-green-400' : 'text-blue-400';

    return (
        <div className="flex gap-4 group">
            <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full ${colorClass} bg-opacity-20 flex items-center justify-center ${textClass} border border-current`}>
                    {icon}
                </div>
                <div className="flex-1 w-0.5 bg-zinc-800 my-1 group-last:hidden"></div>
            </div>
            <div className="flex-1 bg-black/20 border border-zinc-800 rounded-xl p-3 hover:bg-black/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-white uppercase">{title}</span>
                    <span className={`text-xs font-black ${textClass}`}>{value.toFixed(1)}h</span>
                </div>
                <div className="flex justify-between gap-2">
                    <div className="flex-1">
                        <div className="text-[8px] text-zinc-600 uppercase font-black">Início</div>
                        <div className="text-[10px] text-zinc-400 font-medium font-mono">{start ? start.split(' ')[1] : '--:--:--'}</div>
                    </div>
                    <ChevronRight className="w-3 h-3 mt-2 text-zinc-700" />
                    <div className="flex-1 text-right">
                        <div className="text-[8px] text-zinc-600 uppercase font-black">Fim</div>
                        <div className="text-[10px] text-zinc-400 font-medium font-mono">{end ? end.split(' ')[1] : '--:--:--'}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KpiCard({ title, val, vol, color }: { title: string; val: number; vol: number; color: string }) {
    const c = color === 'blue' ? 'text-blue-500' : color === 'green' ? 'text-green-500' : color === 'purple' ? 'text-purple-500' : 'text-orange-500';
    return (
        <div className="bg-gray-900/30 border border-gray-800 p-3 rounded-lg flex flex-col gap-1">
            <span className="text-[10px] uppercase text-white/60 font-bold">{title}</span>
            <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-black ${c}`}>{val ? val.toFixed(1) : '-'}</span>
                <span className="text-xs text-white/50">h</span>
            </div>
            <span className="text-[10px] text-white/40 mt-1">{vol || 0} viagens</span>
        </div>
    );
}
