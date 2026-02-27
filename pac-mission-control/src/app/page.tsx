'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertCircle, Clock,
  Activity, CalendarDays, CalendarClock, TrendingUp,
  X, ChevronRight, Loader2, CheckCircle, Search, Calendar,
  User, Shield, LogOut, Settings
} from 'lucide-react';
import { CicloTotalHourlyChart } from '@/components/CicloTotalHourlyChart';
import { SummaryResponse, CycleTotalResponse, OutliersResponse, AnticipationResponse, OutlierItem, CycleTotalBucket, PracaStatsResponse, PracaStatsItem } from '@/lib/types';

interface DrillDownItem {
  placa: string;
  gmo_id: string;
  origem: string;
  terminal: string;
  cheguei: string;
  antecipacao_h: string;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const isTvMode: boolean = searchParams.get('mode') === 'tv';
  const terminal: string = searchParams.get('terminal') || 'TRO';

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

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [ciclo, setCiclo] = useState<CycleTotalResponse | null>(null);
  const [outliers, setOutliers] = useState<OutliersResponse | null>(null);
  const [anticipation, setAnticipation] = useState<AnticipationResponse | null>(null);
  const [pracaStats, setPracaStats] = useState<PracaStatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(60);
  const [session, setSession] = useState<any>(null);

  // Fetch Session
  useEffect(() => {
    fetch('/api/auth/session').then(res => {
      if (res.ok) res.json().then(data => setSession(data.user));
    });
  }, []);

  const handleLogout = async () => {
    const res = await fetch('/api/logout', { method: 'POST' });
    if (res.ok) {
      window.location.href = '/login';
    }
  };

  // Histogram State
  const [selectedBucket, setSelectedBucket] = useState<{ bucket: string; count: number; pct: number } | null>(null);
  const [hoverBucket, setHoverBucket] = useState<{ bucket: string; count: number; pct: number } | null>(null);

  // Bucket Details Drawer State
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);
  const [activeBucketDetails, setActiveBucketDetails] = useState<DrillDownItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');

  // Outliers Drawer State
  const [isOutliersDrawerOpen, setIsOutliersDrawerOpen] = useState(false);
  const [outlierType, setOutlierType] = useState<'bad' | 'good'>('bad');
  const [loadingOutliers, setLoadingOutliers] = useState(false);
  const [outlierSearch, setOutlierSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<OutlierItem | null>(null);

  // Fetch Drill-down
  const fetchBucketDetails = async (bucket: string) => {
    setLoadingDetails(true);
    setActiveBucketDetails([]);
    try {
        const prodParam = selectedProduto ? `&produto=${encodeURIComponent(selectedProduto)}` : '';
        const res = await fetch(`/api/pac/antecipacoes/bucket-details?terminal=${terminal}&bucket=${encodeURIComponent(bucket)}${prodParam}`);
        if (res.ok) {
            const data = await res.json();
            setActiveBucketDetails(data.items || []);
        }
    } catch (error) {
        console.error("Failed to fetch details", error);
    } finally {
        setLoadingDetails(false);
    }
  };

  const handleHistogramClick = (bucketData: { bucket: string; count: number; pct: number }) => {
    if (session?.role === 'OPERACAO') return; // Bloqueio Operação
    setSelectedBucket(bucketData);
    setIsDetailsDrawerOpen(true);
    fetchBucketDetails(bucketData.bucket);
  };
    
  const fetchData = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const prodParam = selectedProduto ? `&produto=${encodeURIComponent(selectedProduto)}` : '';
      const pracaParam = selectedPraca ? `&praca=${encodeURIComponent(selectedPraca)}` : '';
      const q: string = `?terminal=${terminal}${prodParam}${pracaParam}`;
      const responses: Response[] = await Promise.all([
        fetch(`/api/pac/summary${q}`),
        fetch(`/api/pac/ciclo-total${q}`),
        fetch(`/api/pac/outliers${q}&type=${outlierType}`),
        fetch(`/api/pac/antecipacoes${q}`),
        fetch(`/api/pac/pracas/day-stats?terminal=${terminal}${prodParam}`)
      ]);

      // Check for SSO Auth Error in any response
      for (const res of responses) {
        if (!res.ok) {
          try {
            const json: { error?: string } = await res.clone().json(); // clone because we might need it later? actually we just throw.
            if (json.error && json.error.includes("AWS_SSO_EXPIRED")) {
              setError("AWS_SSO_EXPIRED");
              setLoading(false);
              return; // Stop processing
            }
          } catch { /* ignore parse error */ }
        }
      }

      if (responses.some(r => !r.ok)) {
        throw new Error("One or more endpoints failed");
      }

      const [resSum, resCiclo, resOut, resAnt, resPraca] = responses;
      
      setSummary(await resSum.json());
      setCiclo(await resCiclo.json());
      setOutliers(await resOut.json());
      setAnticipation(await resAnt.json());
      setPracaStats(await resPraca.json());
      setLastFetch(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Fetch error", e);
    } finally {
      setLoading(false);
    }
  }, [terminal, selectedProduto, selectedPraca, outlierType]);

  // Specific Outliers Fetcher for Toggle
  const fetchOnlyOutliers = async () => {
    setLoadingOutliers(true);
    try {
      const prodParam = selectedProduto ? `&produto=${encodeURIComponent(selectedProduto)}` : '';
      const pracaParam = selectedPraca ? `&praca=${encodeURIComponent(selectedPraca)}` : '';
      const res = await fetch(`/api/pac/outliers?terminal=${terminal}${prodParam}${pracaParam}&type=${outlierType}`);
      if (res.ok) {
        setOutliers(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOutliers(false);
    }
  };

  useEffect(() => {
    if (loading) return; // Wait for initial fetch
    fetchOnlyOutliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlierType]);

  useEffect(() => {
    const fetchProds = async () => {
      try {
        const res = await fetch(`/api/pac/produtos?terminal=${terminal}`);
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
        const res = await fetch(`/api/pac/pracas?terminal=${terminal}`);
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
  }, [terminal]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Timer for countdown and auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchData();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData]);

  if (error === 'AWS_SSO_EXPIRED') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-950 text-orange-500 font-sans gap-4 p-4 text-center">
        <AlertCircle className="w-16 h-16" />
        <h1 className="text-3xl font-bold">SESSÃO AWS EXPIRADA</h1>
        <p className="text-gray-400 max-w-lg">
          O token de segurança da AWS expirou. O painel não consegue buscar novos dados.
        </p>
        <div className="bg-black/50 p-4 rounded border border-orange-900/50 mt-4">
          <code className="text-sm text-green-400">aws sso login --profile rumo-sso</code>
        </div>
        <p className="text-xs text-gray-600 mt-2">Execute o comando acima no terminal e recarregue a página.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-orange-900/30 border border-orange-500 rounded hover:bg-orange-900/50 text-white mt-4 font-bold tracking-widest uppercase">
          Recarregar Painel
        </button>
      </div>
    );
  }

  if (loading && !summary) {
    return <div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-white font-sans">
      <span className="animate-pulse text-2xl">CARREGANDO DADOS CCO // {terminal}</span>
    </div>;
  }

  if (!summary) {
    return <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-950 text-red-500 font-sans gap-4">
      <AlertCircle className="w-16 h-16" />
      <span className="text-2xl">FALHA NA CONEXÃO COM CENTRO DE CONTROLE</span>
      <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-900/30 border border-red-500 rounded hover:bg-red-900/50 text-white">
        Tentar Novamente
      </button>
    </div>;
  }

  // Format Helpers
  const fmtH = (n: number | undefined | null): string => (n || 0).toFixed(1);
  const fmtDate = (iso: string | null | undefined): string | null | undefined => {
    if (!iso) return '—';
    try {
      const parts: string[] = iso.split(' ');
      if (parts.length < 2) return iso;
      const [date, time] = parts;
      const dateParts: string[] = date.split('-');
      if (dateParts.length < 3) return iso;
      const [, m, d] = dateParts;
      return `${d}/${m} ${time}`;
    } catch { return iso; }
  };

  return (
    <div
      data-testid="dashboard-cco"
      className={clsx(
        "min-h-screen bg-[#050505] text-gray-200 p-4 font-sans selection:bg-blue-500/30 overflow-hidden flex flex-col gap-4 max-w-[100vw] overflow-x-hidden",
        isTvMode ? "h-screen" : "h-auto"
      )}>
      {/* HEADER */}
      <header className="flex justify-between items-center border-b border-gray-800 pb-2 shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#32a3dd] animate-pulse shadow-[0_0_10px_#32a3dd]" />
            CENTRO DE CONTROLE RODOVIÁRIO - CICLO TOTAL
          </h1>
          <p className="text-white/90 text-xs mt-1 uppercase tracking-widest font-sans">
            Monitoramento em Tempo Real • Terminal {terminal}
          </p>
          <div className="mt-2 flex items-center gap-3">
             {session?.role !== 'OPERACAO' && (
                <>
                  <Link href={`/forecast?terminal=${terminal}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] font-bold text-blue-300 uppercase tracking-wider transition">
                      <TrendingUp className="w-3 h-3" />
                      Projeção de Fila
                  </Link>
                  <Link href={`/historico?terminal=${terminal}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] font-bold text-emerald-300 uppercase tracking-wider transition">
                      <Calendar className="w-3 h-3" />
                      Análise Histórica
                  </Link>
                </>
             )}
             <select 
                value={selectedProduto} 
                onChange={e => setSelectedProduto(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white rounded text-[10px] uppercase font-bold px-2 py-1 cursor-pointer outline-none hover:bg-gray-700 transition"
                title="Produto"
             >
                <option value="">TODOS OS PRODUTOS</option>
                {availableProdutos.map(p => <option key={p} value={p}>{p}</option>)}
             </select>
             <select 
                value={selectedPraca} 
                onChange={e => setSelectedPraca(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white rounded text-[10px] uppercase font-bold px-2 py-1 cursor-pointer outline-none hover:bg-gray-700 transition"
                title="Praça"
             >
                {availablePracas.map(p => <option key={p} value={p}>{p}</option>)}
             </select>
          </div>
        </div>
        <div className="text-right flex items-center gap-6">
          {/* USER PROFILE & LOGOUT */}
          <div className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-2xl px-4 py-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-white uppercase tracking-wider leading-none">{session?.name || 'Usuário'}</span>
              <span className={`text-[8px] font-bold px-1 rounded mt-1 ${session?.role === 'ADM' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {session?.role || '...'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
              {session?.role === 'ADM' ? <Shield className="w-4 h-4 text-purple-400" /> : <User className="w-4 h-4 text-blue-400" />}
            </div>
            <div className="flex items-center gap-1 border-l border-gray-800 pl-3 ml-1">
              {session?.role === 'ADM' && (
                <Link href="/admin/users" title="Gestão de Usuários" className="p-1.5 hover:bg-gray-800 rounded transition text-gray-400 hover:text-white">
                  <Settings className="w-4 h-4" />
                </Link>
              )}
              <button 
                onClick={handleLogout}
                title="Sair do Sistema"
                className="p-1.5 hover:bg-red-500/10 rounded transition text-gray-400 hover:text-red-500"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="text-right flex flex-col items-end">
          <div className="text-xs font-sans text-white/80 mb-px flex items-center gap-3">
            <div 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full cursor-pointer transition-all border",
                autoRefresh ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-gray-800 border-gray-700 text-gray-500"
              )}
              title={autoRefresh ? "Auto-refresh ativado" : "Auto-refresh pausado"}
            >
              <div className={clsx("w-1.5 h-1.5 rounded-full", autoRefresh ? "bg-blue-500 animate-pulse" : "bg-gray-600")} />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                {autoRefresh ? `Próximo em ${countdown}s` : 'Auto-refresh OFF'}
              </span>
            </div>
            
            <button 
              onClick={() => { fetchData(); setCountdown(60); }}
              className="p-1 hover:bg-gray-800 rounded transition text-gray-400 hover:text-white"
              title="Atualizar Agora"
            >
              <Activity className={clsx("w-3 h-3", loading && "animate-spin text-blue-500")} />
            </button>

            <div className="h-4 w-px bg-gray-800 mx-1" />

            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase text-white/90 font-bold tracking-wider">Última Saída</span>
              <span className="text-blue-400 font-bold tracking-wide font-sans leading-none mt-0.5">
                {summary?.meta?.panel_updated_at_brt ? summary.meta.panel_updated_at_brt.split(' ')[1] : lastFetch}
              </span>
            </div>
          </div>
          <div className="text-[10px] font-sans text-white/90 flex items-center gap-1.5 opacity-90">
            <span className="uppercase text-[9px] text-white/90 font-bold tracking-wider">AWS</span>
            <span className="text-white/95">
              Saída <span className="text-gray-200 font-sans">{fmtDate(summary?.meta?.aws_last_peso_saida_brt)}</span>
            </span>
            <span className="text-gray-700 mx-0.5">•</span>
            <span className="text-white/95">
              Cheguei <span className="text-gray-200 font-sans">{fmtDate(summary?.meta?.aws_last_cheguei_brt)}</span>
            </span>
          </div>

        </div>
      </div>
    </header>

      {/* CONTENT GRID */}
      <div className="flex-1 grid gap-4 min-h-0 xl:grid-cols-12 relative">

        {/* MAIN COLUMN (Full Width) */}
        <div className="col-span-12 flex flex-col gap-4 min-h-0 min-w-0">

          {/* GLOBAL STYLES TO HIDE UNWANTED BADGES */}
          <style dangerouslySetInnerHTML={{
            __html: `
            #next-build-watcher, #__next-build-watcher, [data-nextjs-toast], [class*="toast"] { display: none !important; } 
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .animate-marquee {
              animation: marquee 60s linear infinite;
            }
          `}} />

          {/* 1. CICLO TOTAL ROW (4 Buckets - Hour/Day/Month/Year) - STANDARDIZED */}
          <div className="grid grid-cols-4 gap-4 h-32 shrink-0">
            {[ciclo?.ciclo_total.hora_atual, ciclo?.ciclo_total.dia, ciclo?.ciclo_total.mes, ciclo?.ciclo_total.ano].map((b: CycleTotalBucket | undefined, i: number) => {
              const hasVol: boolean = (b?.volume || 0) > 0;
              const delta: number = b?.delta_meta_h || 0;
              const isPositiveDelta: boolean = delta > 0;

              // Standard Meta Display
              const MetaChip = () => (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-300 font-sans w-max select-none">
                  META: 46h32m
                </span>
              );

              return (
                <div key={i} className="bg-gray-900/30 border border-gray-800 rounded-lg p-3 flex flex-col justify-between relative overflow-hidden group h-full">
                  {/* Background Icon - Specific colors */}
                  <div className="absolute top-2 right-2 opacity-10 pointer-events-none grayscale group-hover:grayscale-0 transition duration-500">
                    {i === 0 && <Activity className="w-10 h-10 text-blue-500" />}
                    {i === 1 && <CalendarClock className="w-10 h-10 text-green-500" />}
                    {i === 2 && <CalendarDays className="w-10 h-10 text-purple-500" />}
                    {i === 3 && <TrendingUp className="w-10 h-10 text-orange-500" />}
                  </div>

                  {/* HEADER */}
                  <div className="flex flex-col z-10 gap-1">
                    <span className="text-[10px] uppercase text-white/90 font-bold tracking-widest leading-none">
                      {`Ciclo Total - ${b?.label || ''}`}
                    </span>
                    <MetaChip />
                  </div>

                  {/* BODY */}
                  <div className="flex items-baseline gap-2 z-10 mt-1 mb-auto">
                    {i === 0 && !hasVol ? (
                      <span className="text-xs font-bold text-white/90 uppercase tracking-wider mt-2">Sem saídas recentes</span>
                    ) : (
                      <>
                        <span className="text-4xl font-black text-white tracking-tighter shadow-black drop-shadow-lg font-sans">
                          {fmtH(b?.avg_h)}
                        </span>
                        <span className="text-sm font-medium text-white/90">h</span>
                      </>
                    )}

                    {/* DELTA - Always Show if Vol > 0 */}
                    {hasVol && (
                      <span className={`text-xs font-bold leading-none px-1.5 py-0.5 rounded font-sans ${isPositiveDelta ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                        Δ {isPositiveDelta ? '+' : ''}{fmtH(delta)}h
                      </span>
                    )}
                  </div>

                  {/* FOOTER - ALWAYS ACIMA META */}
                  <div className="flex justify-between items-end border-t border-gray-800 pt-2 z-10 bg-gray-900/10 -mx-3 -mb-3 p-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-white/90 uppercase font-semibold">Volume</span>
                      <span className="text-sm text-white leading-none font-sans">{b?.volume || 0}</span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-[9px] text-white/90 uppercase font-semibold text-right">Acima Meta</span>
                      <div className="flex items-center gap-1 leading-none">
                        <span className={`text-xs font-sans ${(b?.acima_meta_count || 0) > 0 ? 'text-red-400' : 'text-white/80'}`}>
                          {b?.acima_meta_count || 0}
                        </span>
                        <span className="text-[9px] text-white/90">
                          ({(b?.acima_meta_pct || 0).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. CICLO TOTAL POR HORA (D) */}
          <CicloTotalHourlyChart terminal={terminal} produto={selectedProduto} praca={selectedPraca} />

          {/* 3. JANELAS CHART (Cheguei por Horário de Janela) - REPLACES 3 STAGE CARDS */}
          {anticipation?.window_bars && (
            <div className="h-40 bg-gray-900/30 border border-gray-800 rounded-xl p-4 flex flex-col relative overflow-hidden w-full">
              <div className="flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-500" />
                  <span className="text-[10px] uppercase text-white/95 font-bold tracking-widest">
                    Distribuição de Chegadas por Janela (D vs D+1)
                  </span>
                </div>
                <div className="flex gap-4 text-[9px] font-sans uppercase text-white/90">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-sm"></div>Hoje (D)</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-500 rounded-sm"></div>Amanhã (D+1)</div>
                </div>
              </div>

              {/* BARS CONTAINER */}
              <div className="flex-1 flex items-end gap-1 mt-2">
                {/* HOJE (D) - 0 to 23 */}
                <div className="flex-1 flex items-end justify-between gap-px h-full border-r border-gray-800 pr-2">
                  {Array.from({ length: 24 }).map((_, h: number) => {
                    const rec = anticipation?.window_bars?.d0?.find((x) => x.hour === h);
                    const count: number = rec ? rec.count : 0;
                    const maxVal: number = Math.max(...(anticipation?.window_bars?.d0.map((x) => x.count) || [1]), 5);
                    const pct: number = (count / maxVal) * 100;

                    return (
                      <div key={`d0-${h}`} className="flex-1 flex flex-col justify-end h-full group relative">
                        {/* Data Label */}
                        {count > 0 && (
                          <div 
                            className="absolute w-full text-center z-20 pointer-events-none transition-all duration-300 flex items-center justify-center font-sans font-bold"
                            style={{ 
                              height: pct > 30 ? `${pct}%` : 'auto',
                              bottom: pct > 30 ? '0' : `${pct}%`,
                              marginBottom: pct > 30 ? '0px' : '4px'
                            }}
                          >
                            <span className="text-[10px] text-white drop-shadow-md">
                              {count}
                            </span>
                          </div>
                        )}
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-gray-950 border border-gray-700 text-[9px] p-1.5 rounded z-50 whitespace-nowrap shadow-xl">
                          <span className="font-bold text-white font-sans">{count} Veículos</span>
                          <span className="text-white/80">Janela {h}h (Hoje)</span>
                        </div>

                        <div className={`w-full rounded-t-sm transition-all duration-300 ${count > 0 ? 'bg-blue-500 hover:bg-blue-400' : 'bg-gray-800/10'}`}
                          style={{ height: count > 0 ? `${Math.max(pct, 5)}%` : '4px' }}>
                        </div>
                        {/* Label every 3h or so */}
                        {h % 3 === 0 && (
                          <span className="text-[8px] text-white/90 font-sans text-center mt-1 absolute -bottom-4 w-full">{h}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* AMANHÃ (D+1) - 0 to 23 */}
                <div className="flex-1 flex items-end justify-between gap-px h-full pl-2">
                  {Array.from({ length: 24 }).map((_, h: number) => {
                    const rec = anticipation?.window_bars?.d1?.find((x) => x.hour === h);
                    const count: number = rec ? rec.count : 0;
                    const maxVal: number = Math.max(...(anticipation?.window_bars?.d1.map((x) => x.count) || [1]), 5);
                    const pct: number = (count / maxVal) * 100;

                    return (
                      <div key={`d1-${h}`} className="flex-1 flex flex-col justify-end h-full group relative">
                        {/* Data Label */}
                        {count > 0 && (
                          <div 
                            className="absolute w-full text-center z-20 pointer-events-none transition-all duration-300 flex items-center justify-center font-sans font-bold"
                            style={{ 
                              height: pct > 30 ? `${pct}%` : 'auto',
                              bottom: pct > 30 ? '0' : `${pct}%`,
                              marginBottom: pct > 30 ? '0px' : '4px'
                            }}
                          >
                            <span className="text-[10px] text-white drop-shadow-md">
                              {count}
                            </span>
                          </div>
                        )}
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-gray-950 border border-gray-700 text-[9px] p-1.5 rounded z-50 whitespace-nowrap shadow-xl">
                          <span className="font-bold text-white font-sans">{count} Veículos</span>
                          <span className="text-white/80">Janela {h}h (Amanhã)</span>
                        </div>

                        <div className={`w-full rounded-t-sm transition-all duration-300 ${count > 0 ? 'bg-purple-500 hover:bg-purple-400' : 'bg-gray-800/10'}`}
                          style={{ height: count > 0 ? `${Math.max(pct, 5)}%` : '4px' }}>
                        </div>
                        {h % 3 === 0 && (
                          <span className="text-[8px] text-white/90 font-sans text-center mt-1 absolute -bottom-4 w-full">{h}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TOTAL D+1 LABEL */}
              <div className="absolute bottom-2 right-4 z-20 pointer-events-none flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-sans font-bold text-blue-400 opacity-100">
                  TOTAL D: {anticipation?.window_bars?.d0_total || 0} caminhões
                </span>
                <span className="text-[10px] font-sans font-bold text-purple-400 opacity-100">
                  TOTAL D+1: {anticipation?.window_bars?.d1_total || 0} caminhões
                </span>
              </div>
            </div>
          )}

          {/* 4. HISTOGRAMA */}
          <div className="bg-gray-900/20 border border-gray-800 rounded-xl p-4 flex flex-col min-h-[180px] w-full overflow-hidden relative">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white/95 uppercase tracking-widest">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  Histograma de Antecipações (Dia)
                </div>
                
                {/* ANTICIPATION METRICS (PICTURE DATA) */}
                <div className="flex items-center gap-6 mr-auto ml-12">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Antecipando Agora</span>
                      <div className="flex items-baseline gap-1.5">
                         <span className="text-2xl font-black text-blue-400 font-sans tracking-tight">
                            {anticipation?.antecipando_agora.count}
                         </span>
                         <span className="text-[10px] text-white/80 font-bold">caminhões</span>
                      </div>
                   </div>
                   <div className="h-8 w-px bg-gray-800"></div>
                   <div className="flex flex-col">
                      <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">% Operação (Dia)</span>
                      <div className="flex items-baseline gap-1.5">
                         <span className="text-2xl font-black text-blue-400 font-sans tracking-tight">
                            {anticipation?.antecipando_agora.pct.toFixed(0)}%
                         </span>
                         <span className="text-[10px] text-white/80 font-bold">
                            de <span className="font-sans">{anticipation?.base_agora.count_total}</span> total
                         </span>
                      </div>
                   </div>
                </div>

                {/* FIXED INFO PANEL */}
                <div className="flex flex-col items-end gap-1">
                   <div className="h-8 flex items-center justify-end">
                     {(selectedBucket || hoverBucket) ? (
                        <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700 rounded px-3 py-1 animate-in fade-in zoom-in-95 duration-200">
                           <span className="text-[10px] text-white/70 uppercase">Bucket <span className="text-white font-bold font-sans">{(selectedBucket || hoverBucket)?.bucket}</span></span>
                           <div className="w-px h-3 bg-gray-700"></div>
                           <span className="text-[10px] text-blue-300 font-bold font-sans">{(selectedBucket || hoverBucket)?.count} <span className="text-white/70 font-normal">veículos</span></span>
                           <span className="text-[10px] text-gray-400 font-sans">({(selectedBucket || hoverBucket)?.pct.toFixed(1)}%)</span>
                        </div>
                     ) : (
                        <div className="text-[10px] text-white/40 italic">Passe o mouse ou clique nas barras</div>
                     )}
                   </div>
                   <div className="text-[10px] text-white/90 font-sans mt-0.5">
                      Média de Antecipação: <span className="text-white ring-1 ring-gray-700 px-2 py-0.5 rounded font-sans">{fmtH(anticipation?.antecipando_agora.avg_h)}h</span>
                   </div>
                </div>
              </div>

              {/* Chart Area */}
              <div className="flex-1 flex items-end justify-between gap-3 h-32 px-2 pb-6 relative">
                {anticipation?.histogram?.map((h: { bucket: string; count: number; pct: number }, i: number) => {
                  const maxVal: number = Math.max(...(anticipation?.histogram.map(x => x.count) || [1]), 1);
                  const barHeightPct: number = h.count > 0 ? (h.count / maxVal) * 100 : 0;
                  const isActive = selectedBucket?.bucket === h.bucket;

                  return (
                    <div 
                        key={i} 
                        className="flex-1 flex flex-col justify-end h-full group relative cursor-pointer"
                        onMouseEnter={() => setHoverBucket(h)}
                        onMouseLeave={() => setHoverBucket(null)}
                        onClick={() => handleHistogramClick(h)}
                    >
                      {/* Data Label */}
                      {h.count > 0 && (
                        <div 
                          className={`absolute w-full text-center z-20 pointer-events-none transition-all duration-300 flex items-center justify-center`}
                          style={{ 
                            height: barHeightPct > 30 ? `${barHeightPct}%` : 'auto',
                            bottom: barHeightPct > 30 ? '0' : `${barHeightPct}%`,
                            marginBottom: barHeightPct > 30 ? '0px' : '4px'
                          }}
                        >
                          <span className={`text-[9px] font-sans font-bold px-1 rounded transition-colors text-white drop-shadow-md`}>
                            {h.count}
                          </span>
                        </div>
                      )}

                      {/* Bar Track + Fill */}
                      <div className={`w-full rounded-t-sm relative transition-all duration-300 flex flex-col justify-end overflow-hidden border-b ${isActive ? 'bg-gray-800/80 border-blue-500/50' : 'bg-gray-800/30 border-gray-700 hover:bg-gray-800/50'}`} style={{ height: '100%' }}>
                        <div
                          className={`w-full transition-all duration-500 relative ${isActive ? 'bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] group-hover:bg-blue-400 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.6)]'}`}
                          style={{ height: `${h.count > 0 ? Math.max(barHeightPct, 1) : 0}%` }}
                        />
                      </div>

                      {/* X-Axis Label */}
                      <div className="absolute -bottom-6 w-full text-center">
                        <div className={`text-[9px] font-sans uppercase truncate px-0.5 py-1 transition-colors cursor-default ${isActive ? 'text-blue-400 font-bold' : 'text-white/90 hover:text-white'}`} title={h.bucket}>
                          {h.bucket}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FOOTER - PRACAS CAROUSEL */}
            <div className="h-28 bg-gray-900/40 border-t border-gray-800 flex items-center px-4 gap-4 shrink-0 rounded-b-xl overflow-hidden relative group">
                <div className="flex-none flex flex-col items-center justify-center px-4 border-r border-gray-800 h-16 mr-2">
                   <span className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] [writing-mode:vertical-lr] rotate-180">Ciclo Praças</span>
                </div>

                <div 
                  className="flex-1 overflow-hidden"
                >
                  <div className="flex gap-3 w-max animate-marquee py-1">
                    {/* Render twice for seamless loop */}
                    {[...(pracaStats?.items || []), ...(pracaStats?.items || [])].map((p: PracaStatsItem, i: number) => (
                      <div 
                        key={`${p.praca}-${i}`} 
                        className={clsx(
                          "flex-none w-48 h-20 bg-gray-900/60 border rounded-xl p-3 flex flex-col justify-between transition hover:scale-105 duration-300",
                          p.status === 'red' ? "border-red-500/30 bg-red-500/5" : 
                          p.status === 'yellow' ? "border-yellow-500/30 bg-yellow-500/5" : 
                          "border-gray-800/80"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-black uppercase text-white/90 truncate max-w-[120px]" title={p.praca}>
                            {p.praca}
                          </span>
                          <div className={clsx(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            p.status === 'red' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" : 
                            p.status === 'yellow' ? "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]" : 
                            "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                          )} />
                        </div>
                        
                        <div className="flex items-end justify-between">
                           <div className="flex items-baseline gap-1">
                              <span className="text-xl font-black text-white font-sans">{fmtH(p.avg_h)}</span>
                              <span className="text-[10px] text-white/50 font-bold">h</span>
                           </div>
                           <div className="flex flex-col items-end">
                              <span className="text-[9px] text-white/40 font-bold uppercase leading-none">Vol</span>
                              <span className="text-xs font-bold text-white font-sans">{p.volume}</span>
                           </div>
                        </div>
                      </div>
                    ))}
                    
                    {(!pracaStats || pracaStats.items.length === 0) && (
                      <div className="text-white/20 text-xs italic font-sans py-4">Carregando dados das praças...</div>
                    )}
                  </div>
                </div>

                {/* VISUAL GRADIENT FADE FOR CAROUSEL */}
                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-gray-950/80 to-transparent pointer-events-none z-10"></div>
            </div>
        </div>
      </div>

      {/* DRAWER (DRILL-DOWN) */}
      <div className={`fixed inset-y-0 right-0 w-[400px] bg-gray-950 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${isDetailsDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 shrink-0 bg-gray-900/50">
          <div className="flex flex-col">
             <span className="text-[10px] uppercase text-white/50 tracking-widest font-bold">Detalhes do Bucket</span>
             <span className="text-sm font-bold text-white font-sans">
               {selectedBucket?.bucket ? `${selectedBucket.bucket} horas` : 'Selecione...'}
             </span>
          </div>
          <button onClick={() => setIsDetailsDrawerOpen(false)} className="p-2 hover:bg-gray-800 rounded text-white/70 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
           <div className="p-4 border-b border-gray-800 space-y-3">
              <input 
                 type="text" 
                 placeholder="Buscar placa, GMO ou origem..." 
                 className="w-full bg-black/50 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-sans"
                 value={detailSearch}
                 onChange={(e) => setDetailSearch(e.target.value)}
              />
              <div className="flex justify-between items-center text-[10px] text-white/60 font-sans">
                 <span>Total no bucket: <strong className="text-white">{selectedBucket?.count || 0}</strong></span>
                 <span>Exibindo: <strong className="text-white">{activeBucketDetails.length}</strong></span>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {loadingDetails ? (
                 <div className="flex flex-col items-center justify-center h-40 gap-3 text-white/50">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <span className="text-xs">Carregando dados...</span>
                 </div>
              ) : activeBucketDetails.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-40 gap-2 text-white/30">
                    <span className="text-xs italic">Nenhum registro encontrado</span>
                 </div>
              ) : (
                 activeBucketDetails
                  .filter((item: DrillDownItem) => {
                     if (!detailSearch) return true;
                     const s = detailSearch.toLowerCase();
                     return item.placa?.toLowerCase().includes(s) || 
                            item.gmo_id?.toLowerCase().includes(s) || 
                            item.origem?.toLowerCase().includes(s);
                  })
                  .map((item: DrillDownItem, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-900/20 border border-gray-800/50 rounded hover:bg-gray-800/50 transition group flex flex-col gap-1">
                       <div className="flex justify-between items-start">
                          <span className="font-bold text-white font-sans">{item.placa}</span>
                          <span className="text-xs font-bold text-blue-400 font-sans">{item.antecipacao_h}h</span>
                       </div>
                       <div className="flex justify-between items-center text-[10px] text-white/60 font-sans">
                          <span className="truncate max-w-[150px]">{item.origem}</span>
                          <div className="flex items-center gap-1">
                             <span>{item.cheguei ? item.cheguei.split(' ')[1] : '--:--'}</span>
                             <ChevronRight className="w-3 h-3 opacity-50" />
                          </div>
                       </div>
                       <div className="mt-1 pt-1 border-t border-gray-800/50 flex justify-between items-center">
                          <span className="text-[9px] text-white/40 font-mono">#{item.gmo_id}</span>
                          <span className="text-[9px] text-white/40">{item.terminal}</span>
                       </div>
                    </div>
                  ))
              )}
           </div>
        </div>
      </div>

      {/* OUTLIERS DRAWER (Bad/Good Performers) */}
      <div className={`fixed inset-y-0 right-0 w-[420px] bg-gray-950 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${isOutliersDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className={clsx(
          "h-16 border-b border-gray-800 flex items-center justify-between px-6 shrink-0",
          outlierType === 'bad' ? "bg-red-950/20" : "bg-emerald-950/20"
        )}>
          <div className="flex items-center gap-3">
             {outlierType === 'bad' ? <AlertCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
             <h2 className={clsx(
               "text-sm font-bold uppercase tracking-widest",
               outlierType === 'bad' ? "text-red-500" : "text-emerald-500"
             )}>
               {outlierType === 'bad' ? 'Análise de Outliers' : 'Performance Premium'}
             </h2>
          </div>
          <button onClick={() => setIsOutliersDrawerOpen(false)} className="p-2 hover:bg-gray-800 rounded text-white/70 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 bg-gray-900/40 border-b border-gray-800 space-y-4">
             <div className="flex p-1 bg-gray-800 rounded-lg gap-1">
                <button 
                  onClick={() => setOutlierType('bad')}
                  className={clsx(
                    "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-all",
                    outlierType === 'bad' ? "bg-red-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-gray-700"
                  )}
                >
                  Top Piores (24h)
                </button>
                <button 
                  onClick={() => setOutlierType('good')}
                  className={clsx(
                    "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-all",
                    outlierType === 'good' ? "bg-emerald-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-gray-700"
                  )}
                >
                  Top Melhores (24h)
                </button>
             </div>

             <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="Buscar placa..."
                  className="w-full bg-black/40 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-sans"
                  value={outlierSearch}
                  onChange={(e) => setOutlierSearch(e.target.value)}
                />
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
             {loadingOutliers ? (
               <div className="flex flex-col items-center justify-center h-60 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm font-sans text-gray-400">Processando métricas...</span>
               </div>
             ) : (outliers?.items || [])
                .filter(it => !outlierSearch || it.placa.toLowerCase().includes(outlierSearch.toLowerCase()))
                .map((item: OutlierItem, idx: number) => (
               <div 
                key={idx} 
                onClick={() => setSelectedVehicle(item)}
                className="bg-gray-900/30 border border-gray-800 p-4 rounded-xl hover:bg-gray-800/80 hover:border-blue-500/50 transition-all group relative overflow-hidden cursor-pointer"
               >
                  <div className={clsx(
                    "absolute left-0 top-0 bottom-0 w-1",
                    outlierType === 'bad' ? "bg-red-500" : "bg-emerald-500"
                  )}></div>

                  <div className="flex justify-between items-start mb-2 pl-2">
                    <div className="flex flex-col">
                      <span className="font-sans text-lg font-bold text-white group-hover:text-blue-400 transition">{item.placa}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-mono">#{item.gmo_id}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-sm border border-blue-500/20 font-bold uppercase">{item.produto}</span>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className={clsx(
                         "text-xl font-bold font-sans",
                         outlierType === 'bad' ? "text-red-500" : "text-emerald-500"
                       )}>
                         {fmtH(item.valor_h)}h
                       </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-400 font-sans mb-3 pl-2">
                    <span className="bg-gray-800 px-2 py-0.5 rounded text-white/70">{item.origem}</span>
                    <ChevronRight className="w-3 h-3 opacity-30" />
                    <span className="bg-gray-800 px-2 py-0.5 rounded text-white/70">{item.terminal}</span>
                  </div>

                  <div className="flex justify-between items-center pl-2">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Etapa Crítica</span>
                    <span className="text-[10px] uppercase bg-gray-800/50 text-white/90 px-2 py-1 rounded border border-gray-700/50 shadow-sm group-hover:bg-blue-900/20 group-hover:text-blue-300 group-hover:border-blue-500/30 transition">
                      {item.etapa}
                    </span>
                  </div>
               </div>
             ))}

             {!loadingOutliers && (outliers?.items || []).length === 0 && (
               <div className="flex flex-col items-center justify-center h-60 text-gray-500 italic">
                  <span>Nenhum registro encontrado</span>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* VEHICLE DETAILS MODAL (Playful / Stage Breakdown) */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedVehicle(null)}></div>
          
          <div className="relative w-full max-w-2xl bg-gray-950 border border-gray-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex items-center justify-center shadow-inner">
                  <Activity className="w-8 h-8 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight font-sans uppercase">{selectedVehicle.placa}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-blue-400 font-mono">#{selectedVehicle.gmo_id}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">{selectedVehicle.produto}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVehicle(null)}
                className="p-3 hover:bg-gray-800 rounded-full text-white/50 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              
              {/* STAGES BREAKDOWN (The "Ludic" Part) */}
              <div className="flex flex-col gap-6 relative">
                
                {/* Visual Line connecting stages */}
                <div className="absolute left-[31px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-500/50 via-purple-500/50 to-emerald-500/50 hidden sm:block"></div>

                {/* Stage 1: Aguardando Agendamento */}
                <StageCard 
                  title="Aguardando Agendamento"
                  icon={<CalendarClock className="w-6 h-6 text-blue-400" />}
                  color="blue"
                  totalH={selectedVehicle.h_agendamento}
                  data={[
                    { label: 'Emissão da Nota', value: selectedVehicle.dt_emissao },
                    { label: 'Criação do Agendamento', value: selectedVehicle.dt_agendamento }
                  ]}
                />

                {/* Stage 2: Tempo de Viagem */}
                <StageCard 
                  title="Tempo de Viagem"
                  icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
                  color="purple"
                  totalH={selectedVehicle.h_viagem}
                  data={[
                    { label: 'Criação do Agendamento', value: selectedVehicle.dt_agendamento },
                    { label: 'Janela de Agendamento', value: selectedVehicle.dt_janela },
                    { label: 'Cheguei (Área Verde)', value: selectedVehicle.dt_cheguei },
                    { label: 'Chamada para Terminal', value: selectedVehicle.dt_chamada },
                    { label: 'Entrada no Terminal', value: selectedVehicle.dt_chegada }
                  ]}
                />

                {/* Stage 3: Ciclo Interno */}
                <StageCard 
                  title="Ciclo Interno"
                  icon={<Loader2 className="w-6 h-6 text-emerald-400" />}
                  color="emerald"
                  totalH={selectedVehicle.h_interno}
                  data={[
                    { label: 'Entrada no Terminal', value: selectedVehicle.dt_chegada },
                    { label: 'Peso de Saída', value: selectedVehicle.dt_peso_saida }
                  ]}
                />
              </div>

              {/* Total Summary Mini-Card */}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1">Impacto Total</span>
                  <span className="text-3xl font-black text-white font-sans">{selectedVehicle.valor_h.toFixed(1)} <span className="text-sm font-normal text-white/50">HORAS</span></span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-tight text-right">Etapa de maior<br/>influência</span>
                  <span className="text-sm font-bold text-blue-300 mt-1 uppercase tracking-wider">{selectedVehicle.etapa}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-900/50 border-t border-gray-800 text-center">
              <span className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">CCO MISSION CONTROL • GMO #{selectedVehicle.gmo_id}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for Stage Cards
function StageCard({ title, icon, color, data, totalH }: { title: string, icon: React.ReactNode, color: 'blue' | 'purple' | 'emerald', data: { label: string, value?: string }[], totalH?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const colors = {
    blue: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
  };

  const fmtFullDate = (iso: string | undefined) => {
    if (!iso) return '--/-- --:--';
    try {
      const parts = iso.split(' ');
      if (parts.length < 2) return iso;
      const [date, time] = parts;
      const dateParts = date.split('-');
      const d = dateParts[2];
      const m = dateParts[1];
      const hhmm = time.substring(0, 5);
      return `${d}/${m} ${hhmm}`;
    } catch { return '--/-- --:--'; }
  };

  return (
    <div className={clsx(
      "relative z-10 border rounded-2xl transition-all duration-300 group",
      isOpen ? "shadow-2xl translate-x-1" : "hover:border-white/20",
      colors[color]
    )}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left p-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-5">
          <div className={clsx(
            "w-12 h-12 rounded-xl border flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform",
            color === 'blue' ? 'bg-blue-950/20 border-blue-500/30' : 
            color === 'purple' ? 'bg-purple-950/20 border-purple-500/30' : 
            'bg-emerald-950/20 border-emerald-500/30'
          )}>
            {icon}
          </div>
          <div className="flex flex-col">
            <h4 className="text-sm font-black uppercase tracking-widest text-white/90">{title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
               <span className={clsx("text-xs font-bold font-sans", colors[color].split(' ')[2])}>
                 {(totalH || 0).toFixed(1)}h
               </span>
               <span className="w-1 h-1 rounded-full bg-gray-800"></span>
               <p className="text-[10px] font-bold opacity-60 uppercase tracking-tight">Ver eventos da etapa</p>
            </div>
          </div>
        </div>
        <div className={clsx(
          "w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition-transform duration-300",
          isOpen ? "rotate-90 bg-white/10" : "bg-white/5"
        )}>
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-2 space-y-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
          {data.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 px-3 bg-black/30 rounded-lg border border-white/5">
              <span className="text-xs text-white/60 font-sans">{item.label}</span>
              <div className="text-right">
                <span className="text-xs font-bold text-white font-sans">{fmtFullDate(item.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-white font-sans">
        <span className="animate-pulse text-2xl">CARREGANDO SISTEMA...</span>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
