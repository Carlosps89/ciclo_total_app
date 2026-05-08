'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Truck, Activity, Settings, Map, CalendarDays, LogOut, X, Plus, AlertCircle, CheckCircle, Clock, Zap, Calendar, TrendingUp } from 'lucide-react';
import { FastPassDayModal } from '@/components/FastPassDayModal';

interface FastPassTrip {
    gmo_id: string;
    placa: string;
    is_closed: number;
    situacao: string;
    evento: string;
    ciclo_h: number | null;
    aguardando_h: number | null;
    viagem_h: number | null;
    interno_h: number | null;
    ts_ult: string;
    chegada: string;
    peso_saida: string;
    dt_agendamento?: string;
    dt_emissao?: string;
}

interface TruckData {
    placa: string;
    latest_trip: FastPassTrip | null;
    closed_trips_count: number;
    avg_ciclo: number | null;
}

interface ChartDataDay {
    date: string;
    label: string;
    avg_ciclo: number;
    total_trips: number;
    trucks: any[];
}

interface FastPassResponse {
    terminal: string;
    target_date: string;
    updated_at: string;
    kpis: {
        closed_trips_count: number;
        avg_ciclo_dia: number;
        avg_trips_per_truck: number;
    };
    kpis_padrao: {
        closed_trips_count: number;
        avg_ciclo_dia: number;
        avg_trips_per_truck: number;
    };
    kpis_month: {
        closed_trips_count: number;
        avg_ciclo_dia: number;
        avg_trips_per_truck: number;
    };
    kpis_padrao_month: {
        closed_trips_count: number;
        avg_ciclo_dia: number;
        avg_trips_per_truck: number;
    };
    trucks: TruckData[];
    chart_data: {
        date: string;
        label: string;
        avg_ciclo: number;
        avg_ciclo_fp: number;
        avg_ciclo_std: number;
        total_trips: number;
        trucks: any[];
    }[];
}

function FastPassContent() {
    const searchParams = useSearchParams();
    const terminal = searchParams.get('terminal') || 'TRO';

    const [plates, setPlates] = useState<string[]>([]);
    const [configLoaded, setConfigLoaded] = useState(false);
    
    const [newPlate, setNewPlate] = useState('');
    const [data, setData] = useState<FastPassResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetch, setLastFetch] = useState<string>('');
    const [countdown, setCountdown] = useState<number>(60);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    // Date Filter State
    const [selectedDate, setSelectedDate] = useState<string>('');

    // Modal State
    const [modalData, setModalData] = useState<ChartDataDay | null>(null);

    // Initialize selectedDate with today's date if empty
    useEffect(() => {
        if (!selectedDate) {
            const tzOptions = { timeZone: 'America/Sao_Paulo', year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const };
            const todayStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(new Date());
            setSelectedDate(todayStr);
        }
    }, [selectedDate]);

    // Load plates from server
    useEffect(() => {
        fetch(`/api/pac/fast-pass/config?terminal=${terminal}`)
            .then(res => res.json())
            .then(data => {
                if (data.plates) setPlates(data.plates);
                setConfigLoaded(true);
            })
            .catch(err => {
                console.error("Erro ao carregar placas do DB", err);
                setConfigLoaded(true);
            });
    }, [terminal]);

    const savePlatesToServer = async (newPlates: string[]) => {
        setPlates(newPlates);
        try {
            await fetch('/api/pac/fast-pass/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ terminal, plates: newPlates })
            });
        } catch(e) {
            console.error("Erro ao salvar placas", e);
        }
    };

    const addPlate = () => {
        const clean = newPlate.trim().toUpperCase();
        if (clean && !plates.includes(clean)) {
            savePlatesToServer([...plates, clean]);
            setNewPlate('');
        }
    };

    const removePlate = (p: string) => {
        savePlatesToServer(plates.filter(x => x !== p));
    };

    const fetchData = useCallback(async (isBackground = false) => {
        if (!configLoaded) return;
        if (plates.length === 0 || !selectedDate) {
            setLoading(false);
            if (plates.length === 0) setData(null);
            return;
        }

        try {
            if (!isBackground) setLoading(true);
            setError(null);
            const platesQuery = plates.join(',');
            const res = await fetch(`/api/pac/fast-pass?terminal=${terminal}&plates=${encodeURIComponent(platesQuery)}&date=${selectedDate}`);
            
            if (!res.ok) throw new Error('Failed to fetch data');
            
            const result = await res.json();
            setData(result);
            setLastFetch(new Date().toLocaleTimeString());
        } catch (e: any) {
            console.error(e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [terminal, plates, selectedDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Timer for auto-refresh
    useEffect(() => {
        if (plates.length === 0 || !selectedDate) return;
        
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    fetchData(true);
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(timer);
    }, [fetchData, plates.length, selectedDate]);

    const fmtH = (n: number | null | undefined) => (n !== null && n !== undefined) ? n.toFixed(1) + 'h' : '--';
    const fmtDate = (iso: string | null | undefined) => {
        if (!iso) return '—';
        try {
            const date = new Date(iso);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `${day}/${month} ${time}`;
        } catch { return iso; }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-blue-500/30 overflow-x-hidden custom-scrollbar pb-24">
            
            {/* SIDEBAR */}
            {isMenuOpen && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsMenuOpen(false)} />
                    <div className="relative w-72 bg-[#0a0a0a] border-r border-gray-800 h-full shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col pt-12">
                        <button onClick={() => setIsMenuOpen(false)} className="absolute top-4 right-4 text-gray-400 p-2"><X className="w-6 h-6" /></button>
                        <div className="px-6 mb-8">
                            <h2 className="text-xl font-black text-white tracking-tighter">CCO - RUMO</h2>
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Navegação</span>
                        </div>
                        <div className="flex-1 px-4 space-y-2">
                            <Link href="/" className="flex items-center gap-3 p-4 rounded-xl text-gray-300 hover:bg-gray-800/50 hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>
                                <Activity className="w-5 h-5 text-blue-500" />
                                <span className="font-bold">Dashboard Principal</span>
                            </Link>
                            <Link href="/origens" className="flex items-center gap-3 p-4 rounded-xl text-gray-300 hover:bg-gray-800/50 hover:text-white transition-colors group" onClick={() => setIsMenuOpen(false)}>
                                <Map className="w-5 h-5 text-emerald-500" />
                                <span className="font-bold">Mapa de Origens</span>
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER */}
            <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-gray-800/50 p-4">
                <div className="max-w-6xl mx-auto flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="p-2 bg-gray-900 border border-gray-800 rounded-xl text-white hover:bg-gray-800 transition-all">
                                <X className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter flex items-center gap-2">
                                    <Zap className="w-6 h-6 text-yellow-500 fill-yellow-500/20" />
                                    RADAR FAST PASS
                                </h1>
                                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">{terminal}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="flex items-center bg-gray-900 border border-gray-800 rounded-xl px-3 py-1">
                                <Calendar className="w-4 h-4 text-blue-500 mr-2" />
                                <input 
                                    type="date" 
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer"
                                />
                            </div>
                            <div className="hidden md:flex flex-col items-end mr-4 ml-4">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Atualização</span>
                                <span className="text-xs font-black text-blue-400">{lastFetch || '--:--'}</span>
                            </div>
                            <div className="hidden md:flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1">
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">{countdown}s</span>
                            </div>
                            <button onClick={() => fetchData()} className={clsx("p-2 bg-gray-900 border border-gray-800 rounded-full", loading ? "text-blue-500 animate-spin" : "text-gray-400 hover:text-white")}>
                                <Activity className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* KPIs GERAIS */}
                    {data && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Ciclo Médio no Dia</span>
                                <span className="text-2xl font-black text-white">{fmtH(data.kpis.avg_ciclo_dia)}</span>
                            </div>
                            <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Viagens Fechadas no Dia</span>
                                <span className="text-2xl font-black text-emerald-400">{data.kpis.closed_trips_count}</span>
                            </div>
                            <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 flex flex-col col-span-2 md:col-span-1">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Média de Viagens / Caminhão</span>
                                <span className="text-2xl font-black text-blue-400">{data.kpis.avg_trips_per_truck.toFixed(1)} <span className="text-sm font-bold text-gray-500">v/d</span></span>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-4 flex flex-col gap-6 mt-4">
                
                {/* A/B TEST: Fast Pass vs Frota Padrão */}
                {!loading && data && (
                    <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl p-4 md:p-6 flex flex-col gap-6">
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tighter flex items-center gap-2">
                                ⚔️ A/B TEST: Fast Pass vs Frota Padrão
                            </h2>
                            <p className="text-xs text-gray-500">Comparação direta de performance (Ciclo e Volume de Viagens)</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* HOJE */}
                            <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">📅 Hoje (Dia Acumulado)</h3>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center bg-blue-900/10 border border-blue-900/30 p-3 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-400">Fast Pass</span>
                                            <span className="text-sm font-black text-white">{fmtH(data.kpis.avg_ciclo_dia)} Ciclo</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-300">{data.kpis.avg_trips_per_truck.toFixed(1)} <span className="text-[10px] text-gray-500">viagens/veículo</span></span>
                                    </div>
                                    <div className="flex justify-between items-center bg-gray-900/40 border border-gray-800 p-3 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-gray-400">Frota Padrão</span>
                                            <span className="text-sm font-black text-gray-300">{fmtH(data.kpis_padrao.avg_ciclo_dia)} Ciclo</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-400">{data.kpis_padrao.avg_trips_per_truck.toFixed(1)} <span className="text-[10px] text-gray-600">viagens/veículo</span></span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* MES */}
                            <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4 relative overflow-hidden">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">🏆 Mês Acumulado</h3>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center bg-blue-900/10 border border-blue-900/30 p-3 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-400">Fast Pass</span>
                                            <span className="text-sm font-black text-white">{fmtH(data.kpis_month.avg_ciclo_dia)} Ciclo</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-300">{data.kpis_month.avg_trips_per_truck.toFixed(1)} <span className="text-[10px] text-gray-500">viagens/veículo/dia</span></span>
                                    </div>
                                    <div className="flex justify-between items-center bg-gray-900/40 border border-gray-800 p-3 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-gray-400">Frota Padrão</span>
                                            <span className="text-sm font-black text-gray-300">{fmtH(data.kpis_padrao_month.avg_ciclo_dia)} Ciclo</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-400">{data.kpis_padrao_month.avg_trips_per_truck.toFixed(1)} <span className="text-[10px] text-gray-600">viagens/veículo/dia</span></span>
                                    </div>
                                </div>
                                {data.kpis_month.avg_ciclo_dia > 0 && data.kpis_padrao_month.avg_ciclo_dia > 0 && data.kpis_month.avg_ciclo_dia < data.kpis_padrao_month.avg_ciclo_dia && (
                                    <div className="absolute top-4 right-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                        {Math.round(((data.kpis_padrao_month.avg_ciclo_dia - data.kpis_month.avg_ciclo_dia) / data.kpis_padrao_month.avg_ciclo_dia) * 100)}% Mais Rápido
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* CONFIGURAÇÃO DE PLACAS */}
                <div className="bg-gray-900/20 border border-gray-800 rounded-2xl p-4 md:p-6 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Placas Monitoradas</h2>
                            <p className="text-xs text-gray-500">Gerencie as carretas prioritárias do processo Fast Pass.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input 
                                type="text" 
                                value={newPlate}
                                onChange={(e) => setNewPlate(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addPlate()}
                                placeholder="EX: AAA1234"
                                className="bg-black border border-gray-800 rounded-lg px-3 py-2 text-sm text-white uppercase focus:outline-none focus:border-blue-500 w-32"
                            />
                            <button onClick={addPlate} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors">
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        {plates.map(p => (
                            <div key={p} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5 group">
                                <Truck className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-black text-white">{p}</span>
                                <button onClick={() => removePlate(p)} className="text-gray-500 hover:text-red-400 transition-colors ml-2">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {plates.length === 0 && (
                            <span className="text-sm text-gray-600 italic">Nenhuma placa configurada.</span>
                        )}
                    </div>
                </div>

                {/* CARDS DAS PLACAS */}
                {loading && !data && plates.length > 0 && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                )}

                {!loading && plates.length > 0 && data && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.trucks.map(truck => {
                            const isMissing = !truck.latest_trip;
                            const t = truck.latest_trip;
                            const isClosed = t?.is_closed === 1;

                            return (
                                <div key={truck.placa} className={clsx(
                                    "relative overflow-hidden border rounded-2xl p-5 flex flex-col gap-4 transition-all",
                                    isMissing ? "bg-gray-900/10 border-gray-800/50" : 
                                    (isClosed ? "bg-emerald-950/20 border-emerald-900/30" : "bg-blue-950/20 border-blue-900/30")
                                )}>
                                    {/* CABEÇALHO DO CARD */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className={clsx(
                                                "w-12 h-12 rounded-xl flex items-center justify-center border",
                                                isMissing ? "bg-gray-900 border-gray-800 text-gray-600" :
                                                (isClosed ? "bg-emerald-900/40 border-emerald-500/30 text-emerald-400" : "bg-blue-900/40 border-blue-500/30 text-blue-400")
                                            )}>
                                                <Truck className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black tracking-tighter text-white">{truck.placa}</h3>
                                                <span className={clsx(
                                                    "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                                    isMissing ? "bg-gray-800 text-gray-400" :
                                                    (isClosed ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400")
                                                )}>
                                                    {isMissing ? 'SEM REGISTRO' : (isClosed ? 'VIAGEM FECHADA' : 'VIAGEM ATIVA')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-gray-500 font-bold uppercase">Última Atualização</span>
                                            <span className="text-xs font-black text-gray-300">{fmtDate(t?.ts_ult)}</span>
                                        </div>
                                    </div>

                                    {/* DADOS DA VIAGEM */}
                                    {!isMissing && t && (
                                        <>
                                            <div className="flex flex-col gap-2 p-3 bg-black/40 rounded-xl border border-white/5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase">Situação Atual</span>
                                                    <span className="text-sm font-black text-white">{t.situacao || '—'}</span>
                                                </div>
                                                
                                                <div className="flex flex-col gap-2 border-l-2 border-gray-800 ml-2 pl-3 mt-1 py-1">
                                                    {t.dt_emissao && (
                                                        <div className="relative flex items-center justify-between">
                                                            <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-gray-700 ring-4 ring-black/40" />
                                                            <span className="text-xs text-gray-500">Emissão de Nota</span>
                                                            <span className="text-xs font-bold text-gray-500">{fmtDate(t.dt_emissao)}</span>
                                                        </div>
                                                    )}
                                                    {t.dt_agendamento && (
                                                        <div className="relative flex items-center justify-between mt-1">
                                                            <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-indigo-500/50 ring-4 ring-black/40" />
                                                            <span className="text-xs text-indigo-400/80">Agendamento</span>
                                                            <span className="text-xs font-bold text-indigo-400/80">{fmtDate(t.dt_agendamento)}</span>
                                                        </div>
                                                    )}
                                                    {t.chegada && (
                                                        <div className="relative flex items-center justify-between mt-1">
                                                            <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-gray-600 ring-4 ring-black/40" />
                                                            <span className="text-xs text-gray-400">Chegada</span>
                                                            <span className="text-xs font-bold text-gray-300">{fmtDate(t.chegada)}</span>
                                                        </div>
                                                    )}
                                                    
                                                    {!isClosed && (
                                                        <div className="relative flex items-center justify-between mt-1">
                                                            <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-black/40 animate-pulse" />
                                                            <span className="text-xs text-blue-400 font-bold truncate max-w-[140px]">{t.evento || 'Atualização'}</span>
                                                            <span className="text-xs font-black text-white">{fmtDate(t.ts_ult)}</span>
                                                        </div>
                                                    )}

                                                    {isClosed && t.peso_saida && (
                                                        <div className="relative flex items-center justify-between mt-1">
                                                            <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-black/40" />
                                                            <span className="text-xs text-emerald-400 font-bold truncate max-w-[140px]">Viagem Fechada</span>
                                                            <span className="text-xs font-black text-white">{fmtDate(t.peso_saida)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex flex-col p-2 bg-black/20 rounded-lg">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase">Ciclo Total (Última)</span>
                                                    <span className="text-lg font-black text-white">
                                                        {t.ciclo_h === null ? <span className="text-sm text-yellow-500 uppercase tracking-widest font-black">Em Andamento</span> : fmtH(t.ciclo_h)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col p-2 bg-black/20 rounded-lg">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase">Aguardando / Interno</span>
                                                    <span className="text-sm font-bold text-gray-300">
                                                        {fmtH(t.aguardando_h)} / {fmtH(t.interno_h)}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {isMissing && (
                                        <div className="flex-1 flex items-center justify-center p-6 bg-black/20 rounded-xl border border-white/5">
                                            <span className="text-sm text-gray-500 font-bold">Nenhum dado encontrado para esta data.</span>
                                        </div>
                                    )}

                                    {/* RODAPÉ DO CARD (KPIs do Caminhão) */}
                                    <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-emerald-500/50" />
                                            <span className="text-xs font-bold text-gray-400">
                                                Fechadas: <strong className="text-white">{truck.closed_trips_count}</strong>
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-blue-500/50" />
                                            <span className="text-xs font-bold text-gray-400">
                                                Média: <strong className="text-white">{fmtH(truck.avg_ciclo)}</strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* GRÁFICO EVOLUTIVO */}
                {!loading && plates.length > 0 && data && data.chart_data && data.chart_data.length > 0 && (
                    <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl p-4 md:p-6 flex flex-col mt-4">
                        <div>
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Evolução de Performance</h3>
                            <p className="text-xs text-gray-500">Comparativo do ciclo médio diário (últimos 7 dias)</p>
                        </div>
                        <div className="flex items-end justify-between h-48 border-b border-gray-800 pb-2 gap-2 mt-4 overflow-x-auto custom-scrollbar">
                            {data.chart_data.filter(d => d.date >= '2026-05-05').map((dayData, idx, arr) => {
                                const maxAvg = Math.max(...arr.flatMap(d => [d.avg_ciclo_fp || 0, d.avg_ciclo_std || 0]), 1);
                                const pctFp = ((dayData.avg_ciclo_fp || 0) / maxAvg) * 100;
                                const pctStd = ((dayData.avg_ciclo_std || 0) / maxAvg) * 100;
                                const hasDataFp = dayData.avg_ciclo_fp && dayData.avg_ciclo_fp > 0;
                                const hasDataStd = dayData.avg_ciclo_std && dayData.avg_ciclo_std > 0;

                                return (
                                    <div key={idx} className="flex flex-col items-center flex-1 min-w-[60px] group cursor-pointer" onClick={() => {
                                        if (dayData.total_trips > 0) setModalData(dayData);
                                    }}>
                                        <div className="flex gap-1 w-full justify-center h-[140px] items-end relative">
                                            {/* Fast Pass Bar */}
                                            <div 
                                                className={clsx(
                                                    "w-[14px] md:w-[20px] rounded-t-sm transition-all duration-300 relative",
                                                    hasDataFp ? "bg-blue-500 group-hover:bg-blue-400" : "bg-gray-800/30"
                                                )}
                                                style={{ height: hasDataFp ? `${Math.max(pctFp, 5)}%` : '4px' }}
                                            >
                                                {hasDataFp && (
                                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-blue-400">
                                                        {fmtH(dayData.avg_ciclo_fp)}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Padrão Bar */}
                                            <div 
                                                className={clsx(
                                                    "w-[14px] md:w-[20px] rounded-t-sm transition-all duration-300 relative",
                                                    hasDataStd ? "bg-gray-700 group-hover:bg-gray-600" : "bg-gray-800/30"
                                                )}
                                                style={{ height: hasDataStd ? `${Math.max(pctStd, 5)}%` : '4px' }}
                                            >
                                                {hasDataStd && (
                                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-gray-400">
                                                        {fmtH(dayData.avg_ciclo_std)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="h-8 mt-2 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-gray-500 group-hover:text-white transition-colors">{dayData.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="flex items-center justify-center gap-6 mt-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded bg-blue-500" />
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Fast Pass</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded bg-gray-700" />
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Frota Padrão</span>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* MODAL */}
            {modalData && (
                <FastPassDayModal 
                    isOpen={!!modalData}
                    onClose={() => setModalData(null)}
                    dayLabel={modalData.label}
                    dayDate={modalData.date}
                    totalTrips={modalData.total_trips}
                    avgCiclo={modalData.avg_ciclo}
                    trucks={modalData.trucks}
                />
            )}
        </div>
    );
}

function Loader2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

export default function FastPassPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-[#050505] flex items-center justify-center text-blue-500"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
            <FastPassContent />
        </Suspense>
    );
}
