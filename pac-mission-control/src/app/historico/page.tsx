'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  ChevronLeft, Calendar, FileDown, 
  Activity, TrendingUp, AlertCircle, Loader2, ArrowRight
} from 'lucide-react';
import { HistoricalHeatmap } from '@/components/HistoricalHeatmap';
import { HistoricalTrendChart } from '@/components/HistoricalTrendChart';
import HistoricalImpactModal from '@/components/HistoricalImpactModal';
import CicloHourlyDiagnosticsDrawer from '@/components/CicloHourlyDiagnosticsDrawer';
// import * as xlsx from 'xlsx'; // Remove top-level import to avoid hydration/bundle issues
import { VehicleItem } from '@/lib/types';

interface SummaryData {
    volume_total: number;
    ciclo_medio: number;
    acima_meta_pct: number;
    meta_h: number;
}

function HistoricalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const terminal = searchParams.get('terminal') || 'TRO';
  
  // Date range state
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');
  const [selectedProduto, setSelectedProduto] = useState(searchParams.get('produto') || '');
  const [selectedPraca, setSelectedPraca] = useState(searchParams.get('praca') || 'TODAS');
  
  const [availableProdutos, setAvailableProdutos] = useState<string[]>([]);
  const [availablePracas, setAvailablePracas] = useState<string[]>(['TODAS']);
  
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<{ date: string; hour: number } | null>(null);
  const [showImpactAnalysis, setShowImpactAnalysis] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(60);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Correct way to initialize dates to avoid hydration mismatch
    if (!startDate || !endDate) {
      const now = new Date();
      const endStr = now.toISOString().split('T')[0];
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const startStr = firstDay.toISOString().split('T')[0];
      
      if (!startDate) setStartDate(searchParams.get('startDate') || startStr);
      if (!endDate) setEndDate(searchParams.get('endDate') || endStr);
    }
    setMounted(true);
  }, [searchParams, startDate, endDate]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
        // Dynamic import for xlsx to avoid heavy/unsafe top-level import
        const xlsx = await import('xlsx');
        const prodParam = selectedProduto ? `&produto=${encodeURIComponent(selectedProduto)}` : '';
        const pracaParam = selectedPraca ? `&praca=${encodeURIComponent(selectedPraca)}` : '';
        const res = await fetch(`/api/pac/historico/export?terminal=${terminal}&startDate=${startDate}&endDate=${endDate}${prodParam}${pracaParam}`);
        
        if (res.ok) {
            const { vehicles } = await res.json() as { vehicles: VehicleItem[] };
            if (vehicles.length === 0) {
                alert("Nenhum dado encontrado para exportar");
                return;
            }

            const reportData = vehicles.map(v => ({
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
            xlsx.utils.book_append_sheet(wb, ws, "Dados Históricos");
            xlsx.writeFile(wb, `Historico_PAC_${terminal}_${startDate}_a_${endDate}.xlsx`);
        } else {
            console.error("Export failed");
        }
    } catch (e) {
        console.error("Export error", e);
    } finally {
        setExportLoading(false);
    }
  };

  // Sync state with URL (unused for now but kept updated logic)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('terminal', terminal);
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (selectedProduto) params.set('produto', selectedProduto);
    if (selectedPraca && selectedPraca !== 'TODAS') params.set('praca', selectedPraca);
    // Suppress push to avoid loop if not needed
    // router.push(`/historico?${params.toString()}`);
  }, [terminal, startDate, endDate, selectedProduto, selectedPraca, router]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
        const prodParam = selectedProduto ? `&produto=${encodeURIComponent(selectedProduto)}` : '';
        const pracaParam = selectedPraca ? `&praca=${encodeURIComponent(selectedPraca)}` : '';
        const res = await fetch(`/api/pac/historico/summary?terminal=${terminal}&startDate=${startDate}&endDate=${endDate}${prodParam}${pracaParam}`);
        if (res.ok) {
            setSummary(await res.json());
        }
    } catch (e) {
        console.error("Failed to fetch summary", e);
    } finally {
        setLoading(false);
    }
  }, [terminal, startDate, endDate, selectedProduto, selectedPraca]);

  useEffect(() => {
    if (mounted && startDate && endDate) {
        fetchSummary();
    }
  }, [fetchSummary, mounted, startDate, endDate]);

  // Timer for countdown and auto-refresh (only if endDate is today)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const isToday = endDate >= today;
    
    if (!autoRefresh || !isToday) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchSummary();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [autoRefresh, endDate, fetchSummary]);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [pRes, prRes] = await Promise.all([
            fetch(`/api/pac/produtos?terminal=${terminal}`),
            fetch(`/api/pac/pracas?terminal=${terminal}`)
        ]);
        if(pRes.ok) setAvailableProdutos((await pRes.json()).items || []);
        if(prRes.ok) setAvailablePracas((await prRes.json()).pracas || ['TODAS']);
      } catch (e) {
        console.error(e);
      }
    };
    fetchMeta();
  }, [terminal]);

  if (!mounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500/20" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 p-6 font-sans flex flex-col gap-6">
      {/* HEADER */}
      <header className="flex justify-between items-start border-b border-gray-800 pb-4 shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <Link href={`/?terminal=${terminal}`} className="p-2 hover:bg-gray-800 rounded-lg transition text-white/50 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-3">
                ANÁLISE HISTÓRICA - CICLO TOTAL
              </h1>
              <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-bold">
                Performance Consolidada • Terminal {terminal}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-gray-900/40 p-2 rounded-xl border border-gray-800">
           <div className="flex items-center gap-2 px-3 border-r border-gray-800">
              <Calendar className="w-4 h-4 text-blue-500" />
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent border-none text-xs text-white focus:ring-0 outline-none w-28"
              />
              <ArrowRight className="w-3 h-3 text-white/20" />
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent border-none text-xs text-white focus:ring-0 outline-none w-28"
              />
           </div>
           
           <div className="flex items-center gap-2 px-2">
              <select 
                value={selectedProduto} 
                onChange={e => setSelectedProduto(e.target.value)}
                className="bg-gray-800/50 border-gray-700 text-white rounded text-[10px] uppercase font-bold px-2 py-1.5 outline-none hover:bg-gray-700 transition cursor-pointer"
              >
                <option value="">TODOS OS PRODUTOS</option>
                {availableProdutos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select 
                value={selectedPraca} 
                onChange={e => setSelectedPraca(e.target.value)}
                className="bg-gray-800/50 border-gray-700 text-white rounded text-[10px] uppercase font-bold px-2 py-1.5 outline-none hover:bg-gray-700 transition cursor-pointer"
              >
                {availablePracas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
           </div>
           
           <div className="flex items-center gap-2 px-3 border-l border-gray-800">
              <div 
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={clsx(
                  "flex items-center gap-1.5 px-2 py-1 rounded-full cursor-pointer transition-all border",
                  autoRefresh ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-gray-800 border-gray-700 text-gray-500"
                )}
                title={autoRefresh ? "Auto-refresh ativado" : "Auto-refresh pausado"}
              >
                <div className={clsx("w-1.5 h-1.5 rounded-full", autoRefresh ? "bg-blue-500 animate-pulse" : "bg-gray-600")} />
                <span className="text-[9px] font-bold uppercase tracking-wider">
                  {autoRefresh ? `${countdown}s` : 'OFF'}
                </span>
              </div>
              <button 
                onClick={() => { fetchSummary(); setCountdown(60); }}
                className="p-1 hover:bg-gray-800 rounded transition text-gray-400 hover:text-white"
                title="Atualizar Agora"
              >
                <Activity className={clsx("w-3.5 h-3.5", loading && "animate-spin text-blue-500")} />
              </button>
           </div>
           
            <button 
              onClick={() => setShowImpactAnalysis(true)}
              className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-[10px] font-bold uppercase px-4 py-1.5 rounded-lg transition border border-emerald-500/30 shadow-lg shadow-emerald-900/10"
            >
              <Activity className="w-3.5 h-3.5" />
              Cockpit de Performance
            </button>

            <button 
              onClick={handleExport}
              disabled={exportLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white text-[10px] font-bold uppercase px-4 py-1.5 rounded-lg transition shadow-lg shadow-blue-900/20"
            >
              {exportLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
              {exportLoading ? 'Exportando...' : 'Exportar'}
           </button>
        </div>
      </header>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* TOTAL VOLUME */}
        <div className="bg-gray-900/30 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-2 right-4 opacity-10 text-blue-500 group-hover:scale-110 transition duration-500">
            <Activity className="w-12 h-12" />
          </div>
          <span className="text-[10px] uppercase text-white/50 font-bold tracking-widest mb-4">Volume Consolidado</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white font-sans">{loading ? '...' : summary?.volume_total}</span>
            <span className="text-sm text-white/50 font-bold uppercase">Veículos</span>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-[9px] text-white/30 uppercase font-bold">Período de {daysBetween(startDate, endDate)} dias</span>
            {loading && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
          </div>
        </div>

        {/* AVG CYCLE */}
        <div className="bg-gray-900/30 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-2 right-4 opacity-10 text-emerald-500 group-hover:scale-110 transition duration-500">
            <TrendingUp className="w-12 h-12" />
          </div>
          <span className="text-[10px] uppercase text-white/50 font-bold tracking-widest mb-4">Média Ciclo Total</span>
          <div className="flex items-baseline gap-2">
            <span className={clsx(
                "text-4xl font-black font-sans",
                (summary?.ciclo_medio || 0) > 46.5 ? "text-orange-500" : "text-emerald-500"
            )}>
                {loading ? '...' : summary?.ciclo_medio}
            </span>
            <span className="text-sm text-white/50 font-bold uppercase">Horas</span>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-[9px] text-white/30 uppercase font-bold">Meta Base: {summary?.meta_h}h</span>
            <div className={clsx(
                "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                (summary?.ciclo_medio || 0) > 46.5 ? "bg-orange-950/30 text-orange-500 border border-orange-500/30" : "bg-emerald-950/30 text-emerald-500 border border-emerald-500/30"
            )}>
                {loading ? '---' : (summary?.ciclo_medio || 0) > 46.5 ? 'Acima da Meta' : 'Dentro da Meta'}
            </div>
          </div>
        </div>

        {/* ABOVE META % */}
        <div className="bg-gray-900/30 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-2 right-4 opacity-10 text-red-500 group-hover:scale-110 transition duration-500">
            <AlertCircle className="w-12 h-12" />
          </div>
          <span className="text-[10px] uppercase text-white/50 font-bold tracking-widest mb-4">Incidência Crítica</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white font-sans">{loading ? '...' : summary?.acima_meta_pct}%</span>
            <span className="text-sm text-white/50 font-bold uppercase">Acima Meta</span>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-red-500 shadow-[0_0_10px_#ef4444]" 
                    style={{ width: `${summary?.acima_meta_pct || 0}%`, transition: 'width 1s ease' }}
                />
            </div>
            <div className="flex justify-between mt-2">
                <span className="text-[9px] text-white/30 uppercase font-bold">Distribuição do Período</span>
                <span className="text-[9px] text-red-400 font-bold">{summary?.acima_meta_pct}% das saídas</span>
            </div>
          </div>
        </div>
      </div>

      {/* DATA VISUALIZATION AREA */}
      <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <div className="shrink-0">
          <HistoricalHeatmap 
              terminal={terminal}
              startDate={startDate}
              endDate={endDate}
              produto={selectedProduto}
              praca={selectedPraca}
              onCellClick={(date, hour) => setSelectedDetail({ date, hour })}
          />
        </div>

        <div className="h-[350px] shrink-0 pb-6">
          <HistoricalTrendChart 
              terminal={terminal}
              startDate={startDate}
              endDate={endDate}
              produto={selectedProduto}
              praca={selectedPraca}
          />
        </div>
      </div>

      {/* DRILL-DOWN DRAWER */}
      <CicloHourlyDiagnosticsDrawer 
          open={!!selectedDetail}
          onClose={() => setSelectedDetail(null)}
          hour={selectedDetail?.hour ?? null}
          terminal={terminal}
          date={selectedDetail?.date}
          produto={selectedProduto}
          praca={selectedPraca}
      />

      {/* IMPACT ANALYSIS MODAL */}
      <HistoricalImpactModal 
          open={showImpactAnalysis}
          onClose={() => setShowImpactAnalysis(false)}
          terminal={terminal}
          startDate={startDate}
          endDate={endDate}
          produto={selectedProduto}
          praca={selectedPraca}
      />

      {/* FOOTER */}
      <footer className="text-[9px] text-white/20 uppercase tracking-[0.3em] font-bold py-4 text-center border-t border-gray-900">
        PAC Mission Control • Historical Analytics Engine v2.0
      </footer>
    </div>
  );
}

function daysBetween(start: string, end: string): number {
    if (!start || !end) return 0;
    try {
        const s = new Date(start);
        const e = new Date(end);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
        return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    } catch { return 0; }
}

export default function HistoricalPage() {
    return (
        <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-white font-sans"><span className="animate-pulse">CARREGANDO...</span></div>}>
            <HistoricalContent />
        </Suspense>
    );
}
