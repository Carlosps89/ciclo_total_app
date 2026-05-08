'use client';

import React, { useState } from 'react';
import { X, Calendar, Truck, ChevronDown, ChevronUp, MapPin, Clock, Flag, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

interface TripDetail {
    gmo_id: string;
    is_closed: number;
    situacao: string;
    evento: string;
    ciclo_h: number | null;
    aguardando_h: number | null;
    viagem_h: number | null;
    interno_h: number | null;
    ts_ult: string;
    chegada?: string;
    peso_saida?: string;
    dt_agendamento?: string;
    dt_emissao?: string;
}

interface TruckDayInfo {
    placa: string;
    count: number;
    avg_ciclo: number | null;
    trips?: TripDetail[];
}

interface FastPassDayModalProps {
    isOpen: boolean;
    onClose: () => void;
    dayLabel: string;
    dayDate: string;
    totalTrips: number;
    avgCiclo: number;
    trucks: TruckDayInfo[];
}

export function FastPassDayModal({ isOpen, onClose, dayLabel, dayDate, totalTrips, avgCiclo, trucks }: FastPassDayModalProps) {
    const [expandedPlaca, setExpandedPlaca] = useState<string | null>(null);

    if (!isOpen) return null;

    const fmtH = (n: number | null | undefined) => (n !== null && n !== undefined ? n.toFixed(1) + 'h' : '--');
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

    const toggleExpand = (placa: string) => {
        setExpandedPlaca(prev => prev === placa ? null : placa);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center font-sans">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
            <div className="relative w-full max-w-md bg-[#0a0a0a] border border-gray-800 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col m-4 max-h-[90vh]">
                
                {/* HEADER */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/40 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tighter">Resumo do Dia</h2>
                            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">{dayDate} ({dayLabel})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* RESUMO GERAL */}
                <div className="grid grid-cols-2 gap-px bg-gray-800 shrink-0">
                    <div className="bg-[#0a0a0a] p-4 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] uppercase font-bold text-gray-500 mb-1">Total Viagens</span>
                        <span className="text-2xl font-black text-emerald-400">{totalTrips}</span>
                    </div>
                    <div className="bg-[#0a0a0a] p-4 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] uppercase font-bold text-gray-500 mb-1">Ciclo Médio</span>
                        <span className="text-2xl font-black text-white">{fmtH(avgCiclo)}</span>
                    </div>
                </div>

                {/* DETALHAMENTO */}
                <div className="p-4 bg-gray-900/10 overflow-y-auto custom-scrollbar flex-1">
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-3">Detalhamento por Carreta</h3>
                    
                    {trucks.length === 0 ? (
                        <div className="py-8 text-center flex flex-col items-center text-gray-500">
                            <Truck className="w-8 h-8 mb-2 opacity-50" />
                            <span className="text-sm font-bold">Nenhuma viagem registrada</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {trucks.map(truck => {
                                const isExpanded = expandedPlaca === truck.placa;
                                const hasTrips = truck.trips && truck.trips.length > 0;

                                return (
                                    <div key={truck.placa} className="flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-all">
                                        
                                        {/* TRUCK ROW */}
                                        <div 
                                            className={clsx("flex justify-between items-center p-3 cursor-pointer hover:bg-gray-800/50 transition-colors", isExpanded && "bg-gray-800/30")}
                                            onClick={() => { if (hasTrips) toggleExpand(truck.placa) }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Truck className="w-4 h-4 text-gray-400" />
                                                <span className="font-black text-white">{truck.placa}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-right">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-gray-500">Viagens</span>
                                                    <span className="text-sm font-black text-emerald-400">{truck.count}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-gray-500">Ciclo</span>
                                                    <span className="text-sm font-black text-white">{fmtH(truck.avg_ciclo)}</span>
                                                </div>
                                                {hasTrips && (
                                                    <div className="ml-1 text-gray-500">
                                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* TRIPS LIST EXPANDED */}
                                        {isExpanded && hasTrips && (
                                            <div className="flex flex-col gap-2 p-3 bg-black/40 border-t border-gray-800">
                                                {truck.trips!.map((trip, idx) => (
                                                    <div key={trip.gmo_id || idx} className="flex flex-col bg-gray-900/50 border border-gray-800/50 rounded-lg p-3">
                                                        <div className="flex justify-between items-center mb-2 border-b border-gray-800/50 pb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-800 text-gray-400 uppercase">
                                                                    ID: {trip.gmo_id || 'N/A'}
                                                                </span>
                                                                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded uppercase", trip.is_closed ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-500")}>
                                                                    {trip.is_closed ? "Fechada" : "Ativa"}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs font-black text-white">Ciclo: {fmtH(trip.ciclo_h)}</span>
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-3 gap-2 mt-1">
                                                            <div className="flex flex-col items-center p-2 bg-black/30 rounded text-center">
                                                                <Clock className="w-3 h-3 text-gray-500 mb-1" />
                                                                <span className="text-[9px] uppercase font-bold text-gray-500">Aguardando</span>
                                                                <span className="text-xs font-bold text-gray-300">{fmtH(trip.aguardando_h)}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center p-2 bg-black/30 rounded text-center">
                                                                <MapPin className="w-3 h-3 text-blue-500 mb-1" />
                                                                <span className="text-[9px] uppercase font-bold text-gray-500">Viagem</span>
                                                                <span className="text-xs font-bold text-blue-400">{fmtH(trip.viagem_h)}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center p-2 bg-black/30 rounded text-center">
                                                                <Flag className="w-3 h-3 text-emerald-500 mb-1" />
                                                                <span className="text-[9px] uppercase font-bold text-gray-500">Interno</span>
                                                                <span className="text-xs font-bold text-emerald-400">{fmtH(trip.interno_h)}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-1 border-l-2 border-gray-800 ml-2 pl-3 mt-3 py-1">
                                                            {trip.dt_emissao && (
                                                                <div className="relative flex items-center justify-between">
                                                                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-gray-700 ring-4 ring-[#111827]" />
                                                                    <span className="text-[10px] text-gray-500">Emissão de Nota</span>
                                                                    <span className="text-[10px] font-bold text-gray-500">{fmtDate(trip.dt_emissao)}</span>
                                                                </div>
                                                            )}
                                                            {trip.dt_agendamento && (
                                                                <div className="relative flex items-center justify-between mt-1">
                                                                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-indigo-500/50 ring-4 ring-[#111827]" />
                                                                    <span className="text-[10px] text-indigo-400/80">Agendamento</span>
                                                                    <span className="text-[10px] font-bold text-indigo-400/80">{fmtDate(trip.dt_agendamento)}</span>
                                                                </div>
                                                            )}
                                                            {trip.chegada && (
                                                                <div className="relative flex items-center justify-between mt-1">
                                                                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-gray-600 ring-4 ring-[#111827]" />
                                                                    <span className="text-[10px] text-gray-400">Chegada</span>
                                                                    <span className="text-[10px] font-bold text-gray-300">{fmtDate(trip.chegada)}</span>
                                                                </div>
                                                            )}
                                                            {!trip.is_closed && (
                                                                <div className="relative flex items-center justify-between mt-1">
                                                                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-[#111827] animate-pulse" />
                                                                    <span className="text-[10px] text-blue-400 font-bold truncate max-w-[120px]">{trip.evento || 'Atualização'}</span>
                                                                    <span className="text-[10px] font-black text-white">{fmtDate(trip.ts_ult)}</span>
                                                                </div>
                                                            )}
                                                            {trip.is_closed && trip.peso_saida && (
                                                                <div className="relative flex items-center justify-between mt-1">
                                                                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-[#111827]" />
                                                                    <span className="text-[10px] text-emerald-400 font-bold truncate max-w-[120px]">Viagem Fechada</span>
                                                                    <span className="text-[10px] font-black text-white">{fmtDate(trip.peso_saida)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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
