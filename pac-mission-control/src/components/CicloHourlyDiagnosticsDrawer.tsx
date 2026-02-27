"use client";

import React, { useEffect, useState } from 'react';
import { VehicleItem } from '@/lib/types';
import { X, CalendarClock, TrendingUp, Loader2, ChevronRight, Activity, Download } from 'lucide-react';
import clsx from 'clsx';
// import * as xlsx from 'xlsx';
export interface StageData {
    name: string;
    avg_hour: number;
    avg_day: number;
    contrib: number;
}

export interface DriverItem {
    nome: string;
    share_hora: number;
    share_dia: number;
    ciclo_medio_dia: number;
}

export interface DiagnosticsDrawerPayload {
    hour: number;
    summary: {
        volume: number;
        ciclo_medio_hora: number;
        ciclo_medio_dia: number;
        delta_h: number;
    };
    stages: StageData[];
    mix_ops: {
        mix_effect: number;
        ops_effect: number;
        verdict: string;
    };
    drivers: {
        origem: DriverItem[];
        produto: DriverItem[];
        cliente: DriverItem[];
    };
    vehicles: VehicleItem[];
}

interface CicloHourlyDiagnosticsDrawerProps {
    open: boolean;
    onClose: () => void;
    hour: number | null;
    terminal: string;
    date?: string;
    produto?: string;
    praca?: string;
}

export default function CicloHourlyDiagnosticsDrawer({ open, onClose, hour, terminal, date, produto, praca }: CicloHourlyDiagnosticsDrawerProps) {
    const [data, setData] = useState<DiagnosticsDrawerPayload | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeTab, setActiveTab ] = useState<'origem' | 'produto' | 'cliente'>('origem');
    const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(null);

    useEffect(() => {
        if (!open || hour === null) return;
        
        let active = true;
        const fetchDrawer = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ terminal, hour: String(hour) });
                if (date) params.append('date', date);
                if (produto) params.append('produto', produto);
                if (praca) params.append('praca', praca);

                const res = await fetch(`/api/pac/ciclo-hourly-diagnostics?${params.toString()}`);
                if (res.ok && active) {
                    const json = await res.json();
                    setData(json.drawer);
                }
            } catch (err) {
            console.error("Error fetching drawer info:", err);
        } finally {
            setLoading(false);
        }
    }

        fetchDrawer();
        return () => { active = false; };
    }, [open, hour, terminal, date, produto, praca]);

    const handleExportExcel = async () => {
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

        const xlsx = await import('xlsx');
        const ws = xlsx.utils.json_to_sheet(reportData);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Veículos");
        xlsx.writeFile(wb, `Ciclo_Veiculos_${terminal}_${hour}h_${date}.xlsx`);
    };

    if (!open) return null;

    const renderBar = (val: number, max: number, color: string) => {
        const pct = max > 0 ? Math.min((val / max) * 100, 100) : 0;
        return (
            <div className="w-full bg-zinc-800 rounded-full h-2 mt-1 relative overflow-hidden">
                <div 
                    className={`absolute top-0 left-0 h-full ${color}`} 
                    style={{ width: `${pct}%` }}
                />
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-100 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-lg bg-zinc-900 h-full shadow-2xl flex flex-col border-l border-zinc-800 animate-slide-in-right overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 bg-zinc-900 sticky top-0 z-10">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-white uppercase">DIAGNÓSTICO — {hour !== null ? String(hour).padStart(2, '0') : '00'}h</h2>
                        <button onClick={onClose} className="text-zinc-400 hover:text-white transition">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    {!loading && data && (
                        <div className="grid grid-cols-4 gap-2">
                            <div className="bg-zinc-800 rounded p-2 text-center">
                                <div className="text-[10px] text-zinc-400 uppercase font-bold">Ciclo</div>
                                <div className="text-sm font-bold text-white">{data.summary.ciclo_medio_hora}h</div>
                            </div>
                            <div className="bg-zinc-800 rounded p-2 text-center">
                                <div className="text-[10px] text-zinc-400 uppercase font-bold">Baseline</div>
                                <div className="text-sm font-bold text-white">{data.summary.ciclo_medio_dia}h</div>
                            </div>
                            <div className={`bg-zinc-800 rounded p-2 text-center border ${data.summary.delta_h > 0 ? 'border-red-500/30' : 'border-green-500/30'}`}>
                                <div className="text-[10px] text-zinc-400 uppercase font-bold">Δ vs Meta</div>
                                <div className={`text-sm font-bold ${data.summary.delta_h > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {data.summary.delta_h > 0 ? '+' : ''}{data.summary.delta_h}h
                                </div>
                            </div>
                            <div className="bg-zinc-800 rounded p-2 text-center">
                                <div className="text-[10px] text-zinc-400 uppercase font-bold">Volume</div>
                                <div className="text-sm font-bold text-white">{data.summary.volume}</div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {loading || !data ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                        </div>
                    ) : (
                        <>
                            {/* Sec A: Etapas */}
                            <section>
                                <h3 className="text-sm font-bold text-zinc-300 uppercase mb-4 border-b border-zinc-800 pb-2">O que puxou o ciclo na hora?</h3>
                                <div className="space-y-4">
                                    {(data.stages || []).map((st: StageData) => (
                                        <div key={st.name} className="bg-zinc-800/50 p-3 rounded border border-zinc-800">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-bold text-white capitalize">{st.name.replace(/_/g, ' ')}</span>
                                                <span className={`text-xs font-bold ${st.contrib > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    {st.contrib > 0 ? '+' : ''}{st.contrib}h (vs Dia)
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-zinc-400">
                                                        <span>Hora ({st.avg_hour}h)</span>
                                                    </div>
                                                    {renderBar(st.avg_hour, 30, st.contrib > 0 ? 'bg-red-500' : 'bg-blue-500')}
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-zinc-400">
                                                        <span>Dia ({st.avg_day}h)</span>
                                                    </div>
                                                    {renderBar(st.avg_day, 30, 'bg-zinc-600')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {data.stages.length > 0 && (
                                        <div className="mt-4 p-3 bg-[#3f3f46]/30 border-l-4 border-yellow-500 rounded text-sm">
                                            <span className="text-zinc-400">Tempo que mais aumentou: </span>
                                            <span className="text-white font-bold capitalize">
                                                {data.stages.reduce((prev: StageData, current: StageData) => (prev.contrib > current.contrib) ? prev : current).name.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Sec B: Mix vs Ops */}
                            <section>
                                <h3 className="text-sm font-bold text-zinc-300 uppercase mb-4 border-b border-zinc-800 pb-2">Efeito Mix x Efeito Operação</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-zinc-800 p-4 rounded text-center border border-zinc-700">
                                        <div className="text-xs text-zinc-400 font-bold mb-1">EFEITO MIX</div>
                                        <div className={`text-2xl font-bold ${data.mix_ops.mix_effect > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                            {data.mix_ops.mix_effect > 0 ? '+' : ''}{data.mix_ops.mix_effect}h
                                        </div>
                                    </div>
                                    <div className="bg-zinc-800 p-4 rounded text-center border border-zinc-700">
                                        <div className="text-xs text-zinc-400 font-bold mb-1">EFEITO OPERACIONAL</div>
                                        <div className={`text-2xl font-bold ${data.mix_ops.ops_effect > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                            {data.mix_ops.ops_effect > 0 ? '+' : ''}{data.mix_ops.ops_effect}h
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 text-center text-sm text-zinc-300">
                                    Nesta hora, a variação de ciclo é puxada pela <strong className="text-white">{data.mix_ops.verdict}</strong>.
                                </div>
                            </section>

                            {/* Sec C: Drivers */}
                            <section>
                                <h3 className="text-sm font-bold text-zinc-300 uppercase mb-3 border-b border-zinc-800 pb-2">Detalhes de Concentração</h3>
                                
                                <div className="flex space-x-2 mb-4 bg-zinc-800 p-1 rounded">
                                    {(['origem', 'produto', 'cliente'] as const).map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`flex-1 py-1.5 text-xs font-bold uppercase rounded ${activeTab === tab ? 'bg-zinc-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                <div className="bg-zinc-800/50 border border-zinc-800 rounded">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-zinc-800 text-zinc-400">
                                            <tr>
                                                <th className="p-2 font-bold w-1/2">Nome</th>
                                                <th className="p-2 font-bold text-right" title="Concentração na Hora (%)">V. Hora</th>
                                                <th className="p-2 font-bold text-right" title="Concentração no Dia (%)">V. Dia</th>
                                                <th className="p-2 font-bold text-right" title="Ciclo Médio no Dia">Ciclo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50">
                                            {(data.drivers[activeTab] || []).slice(0, 10).map((d: DriverItem, i: number) => {
                                                const isBigChange = (d.share_hora - d.share_dia) > 10;
                                                return (
                                                    <tr key={i} className="hover:bg-zinc-800 text-zinc-300">
                                                        <td className="p-2 truncate max-w-[150px]" title={d.nome}>
                                                            {isBigChange && <span className="text-red-400 mr-1" title="Aumento muito além da média">⚠️</span>}
                                                            {d.nome}
                                                        </td>
                                                        <td className="p-2 text-right font-bold text-white">{d.share_hora}%</td>
                                                        <td className="p-2 text-right">{d.share_dia}%</td>
                                                        <td className="p-2 text-right font-mono">{d.ciclo_medio_dia}h</td>
                                                    </tr>
                                                );
                                            })}
                                            {(!data.drivers[activeTab] || data.drivers[activeTab].length === 0) && (
                                                <tr>
                                                    <td colSpan={4} className="p-4 text-center text-zinc-500 italic">Nenhum dado encontrado</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Sec D: Veículos */}
                            <section>
                                <div className="flex justify-between items-center mb-3 border-b border-zinc-800 pb-2">
                                    <h3 className="text-sm font-bold text-zinc-300 uppercase">Veículos Impactantes</h3>
                                    {(data.vehicles && data.vehicles.length > 0) && (
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
                                    {(data.vehicles || []).map((v, i) => (
                                        <div 
                                            key={i} 
                                            onClick={() => setSelectedVehicle(v)}
                                            className="bg-zinc-800/40 border border-zinc-800 p-3 rounded-lg hover:bg-zinc-800/60 transition cursor-pointer group"
                                        >
                                            <div className="flex justify-between items-start mb-2 focus-within:ring-2 focus-within:ring-blue-500">
                                                <div>
                                                    <div className="text-white font-bold text-sm tracking-tight group-hover:text-blue-400 transition">{v.placa}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono">#{v.gmo_id} • {v.produto}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-bold text-white leading-none">{v.ciclo_total_h}h</div>
                                                    <div className="text-[10px] text-zinc-500 uppercase font-bold">Ciclo Total</div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mb-3">
                                                <span className="truncate max-w-[120px]">{v.origem}</span>
                                                <span>→</span>
                                                <span>{terminal}</span>
                                            </div>

                                            {/* Stage Breakdown Bars: Requested order Agenda / Viagem / Verde / Interno */}
                                            <div className="grid grid-cols-4 gap-1 h-1.5">
                                                <div className="bg-orange-500/80 rounded-l" title={`Aguardando: ${v.h_aguardando}h`} style={{ flex: Math.max(v.h_aguardando, 0.1) }}></div>
                                                <div className="bg-purple-500/80" title={`Viagem: ${v.h_viagem}h`} style={{ flex: Math.max(v.h_viagem, 0.1) }}></div>
                                                <div className="bg-green-500/80" title={`Área Verde: ${v.h_verde}h`} style={{ flex: Math.max(v.h_verde, 0.1) }}></div>
                                                <div className="bg-blue-500/80 rounded-r" title={`Interno: ${v.h_interno}h`} style={{ flex: Math.max(v.h_interno, 0.1) }}></div>
                                            </div>
                                            
                                            <div className="flex justify-between mt-2 text-[8px] text-zinc-500 font-bold uppercase tracking-tighter">
                                                <span>Agenda: {v.h_aguardando}h</span>
                                                <span>Viagem: {v.h_viagem}h</span>
                                                <span>Verde: {v.h_verde}h</span>
                                                <span>Interno: {v.h_interno}h</span>
                                            </div>
                                        </div>
                                    ))}
                                    {(!data.vehicles || data.vehicles.length === 0) && (
                                        <div className="text-center py-4 text-zinc-500 italic text-xs">Nenhum veículo registrado nesta hora</div>
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* VEHICLE DETAILS MODAL (Reused from outliers) */}
                {selectedVehicle && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedVehicle(null)}></div>
                        
                        <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh]">
                            {/* Modal Header */}
                            <div className="p-6 bg-linear-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800 flex justify-between items-center text-left">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex items-center justify-center shadow-inner">
                                        <Activity className="w-8 h-8 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white tracking-tight font-sans uppercase">{selectedVehicle.placa}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-blue-400 font-mono">#{selectedVehicle.gmo_id}</span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                                            <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">{selectedVehicle.produto}</span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedVehicle(null)}
                                    className="p-3 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Modal Content - Scrollable */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar text-left">
                                <div className="flex flex-col gap-6 relative">
                                    {/* Visual Line connecting stages */}
                                    <div className="absolute left-[31px] top-8 bottom-8 w-0.5 bg-linear-to-b from-blue-500/50 via-purple-500/50 to-emerald-500/50 hidden sm:block"></div>

                                    {/* Stage 1: Aguardando Agendamento */}
                                    <StageCard 
                                        title="Aguardando Agendamento"
                                        icon={<CalendarClock className="w-6 h-6 text-blue-400" />}
                                        color="blue"
                                        totalH={selectedVehicle.h_aguardando}
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

                                    {/* Stage 3: Ciclo Interno + Verde */}
                                    <StageCard 
                                        title="Operação no Terminal"
                                        icon={<Loader2 className="w-6 h-6 text-emerald-400" />}
                                        color="emerald"
                                        totalH={(selectedVehicle.h_verde || 0) + (selectedVehicle.h_interno || 0)}
                                        data={[
                                            { label: 'Chamada para Terminal', value: selectedVehicle.dt_chamada },
                                            { label: 'Entrada no Terminal', value: selectedVehicle.dt_chegada },
                                            { label: 'Peso de Saída', value: selectedVehicle.dt_peso_saida }
                                        ]}
                                    />
                                </div>

                                {/* Total Summary Mini-Card */}
                                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1">Impacto Total</span>
                                        <span className="text-3xl font-black text-white font-sans">{selectedVehicle.ciclo_total_h.toFixed(1)} <span className="text-sm font-normal text-white/50 uppercase">Horas</span></span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-tight text-right">Etapa atual</span>
                                        <span className="text-sm font-bold text-blue-300 mt-1 uppercase tracking-wider">Finalizado</span>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 bg-zinc-900/50 border-t border-zinc-800 text-center">
                                <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">CCO MISSION CONTROL • GMO #{selectedVehicle.gmo_id}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Sub-component for Stage Cards (matching page.tsx style)
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
                        "w-12 h-12 rounded-xl border flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform text-center",
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
                            <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
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
