
'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Check, X, Building2, MapPin, Target } from 'lucide-react';

interface PlazaTarget {
    terminal: string;
    origem: string;
    meta_h: number;
}

export default function AdminTargetsPage() {
    const [targets, setTargets] = useState<PlazaTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<number>(0);
    const [newTarget, setNewTarget] = useState<PlazaTarget>({ terminal: 'TRO', origem: '', meta_h: 46.53 });
    const [availablePracas, setAvailablePracas] = useState<string[]>([]);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        fetchTargets();
        fetchPracas('TRO');
    }, []);

    const fetchPracas = async (term: string) => {
        try {
            const res = await fetch(`/api/pac/pracas?terminal=${term}`);
            const data = await res.json();
            // Filter out 'TODAS' and uppercase
            setAvailablePracas(data.pracas?.filter((p: string) => p !== 'TODAS').map((p: string) => p.toUpperCase()) || []);
        } catch (error) {
            console.error('Erro ao buscar praças:', error);
        }
    };

    const fetchTargets = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/targets');
            const data = await res.json();
            setTargets(data);
        } catch (error) {
            console.error('Erro ao buscar metas:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (target: PlazaTarget) => {
        try {
            await fetch('/api/admin/targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(target)
            });
            setEditing(null);
            fetchTargets();
        } catch (error) {
            alert('Erro ao salvar meta');
        }
    };

    const handleDelete = async (terminal: string, origem: string) => {
        if (!confirm('Tem certeza que deseja remover esta meta?')) return;
        try {
            await fetch('/api/admin/targets', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ terminal, origem })
            });
            fetchTargets();
        } catch (error) {
            alert('Erro ao remover meta');
        }
    };

    const filteredTargets = targets.filter(t => 
        t.origem.toLowerCase().includes(search.toLowerCase()) ||
        t.terminal.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="h-screen bg-black p-4 md:p-8 font-sans overflow-y-auto custom-scrollbar flex flex-col">
            <div className="max-w-6xl mx-auto w-full">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                            Gestão de Metas Operacionais
                        </h1>
                        <p className="text-gray-400 mt-2">Configuração por Praça Logística</p>
                    </div>
                    
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                    >
                        <Plus size={20} />
                        Nova Meta
                    </button>
                </header>

                <div className="relative mb-8">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input 
                        type="text" 
                        placeholder="Pesquisar por praça..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-gray-900/50 border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all"
                    />
                </div>

                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-900 border-b border-gray-800 text-gray-400 text-sm uppercase tracking-wider">
                                <th className="px-6 py-4 font-semibold">Terminal</th>
                                <th className="px-6 py-4 font-semibold">Praça (Agrupamento)</th>
                                <th className="px-6 py-4 font-semibold text-center">Meta (h)</th>
                                <th className="px-6 py-4 font-semibold text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">Carregando metas...</td>
                                </tr>
                            ) : filteredTargets.map((t, idx) => (
                                <tr 
                                    key={`${t.terminal}-${t.origem}`} 
                                    onClick={() => {
                                        if (editing !== `${t.terminal}-${t.origem}`) {
                                            setEditing(`${t.terminal}-${t.origem}`); 
                                            setEditValue(t.meta_h);
                                        }
                                    }}
                                    className="hover:bg-white/5 transition-colors group cursor-pointer"
                                >
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                                <Building2 size={16} />
                                            </div>
                                            <span className="font-semibold">{t.terminal}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="text-gray-500">
                                                <MapPin size={16} />
                                            </div>
                                            <span className="text-gray-300">{t.origem}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        {editing === `${t.terminal}-${t.origem}` ? (
                                            <input 
                                                type="number" 
                                                value={editValue}
                                                step="0.01"
                                                autoFocus
                                                onChange={(e) => setEditValue(parseFloat(e.target.value))}
                                                className="w-24 bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-center outline-none"
                                            />
                                        ) : (
                                            <span className={`font-mono ${t.meta_h === 46.5333 ? 'text-gray-500' : 'text-green-400 font-bold'}`}>
                                                {t.meta_h.toFixed(2)}h
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-2 transition-opacity">
                                            {editing === `${t.terminal}-${t.origem}` ? (
                                                <>
                                                    <button onClick={() => handleSave({ ...t, meta_h: editValue })} className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30">
                                                        <Check size={18} />
                                                    </button>
                                                    <button onClick={() => setEditing(null)} className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">
                                                        <X size={18} />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button 
                                                        onClick={() => { setEditing(`${t.terminal}-${t.origem}`); setEditValue(t.meta_h); }}
                                                        className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20"
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(t.terminal, t.origem)}
                                                        className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            {/* Modal para Nova Meta */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-md p-8 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <Target className="text-indigo-400" />
                                Cadastrar Nova Meta
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm text-gray-500 mb-2 uppercase tracking-wider font-bold">Terminal / Praça</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: TRO"
                                    value={newTarget.terminal}
                                    onChange={(e) => setNewTarget({ ...newTarget, terminal: e.target.value.toUpperCase() })}
                                    className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-all font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-500 mb-2 uppercase tracking-wider font-bold">Praça Logística</label>
                                <select 
                                    value={newTarget.origem}
                                    onChange={(e) => setNewTarget({ ...newTarget, origem: e.target.value.toUpperCase() })}
                                    className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-all font-bold text-white appearance-none"
                                >
                                    <option value="">Selecione a Praça...</option>
                                    <option value="GLOBAL">GLOBAL (TODAS AS PRAÇAS)</option>
                                    {availablePracas.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-600 mt-2 italic">A meta será aplicada a todos os municípios pertencentes à praça.</p>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-500 mb-2 uppercase tracking-wider font-bold">Valor da Meta (Horas)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    value={newTarget.meta_h}
                                    onChange={(e) => setNewTarget({ ...newTarget, meta_h: parseFloat(e.target.value) })}
                                    className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-all font-mono font-bold"
                                />
                            </div>

                            <button 
                                onClick={() => { handleSave(newTarget); setShowModal(false); }}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-4"
                            >
                                Salvar Configuração
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

