'use client';

import { useState, useEffect } from 'react';
import { 
    UserPlus, Trash2, Shield, User, Mail, ChevronLeft, 
    Loader2, Pencil, Check, X, Bell, Phone, CheckSquare, Square
} from 'lucide-react';
import Link from 'next/link';

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'OPERACAO',
    whatsapp_number: '',
    reports_config: { daily: false, fraud: false }
  });

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        setUsers(await res.json());
      } else {
        setError('Falha ao carregar usuários. Verifique sua permissão.');
      }
    } catch (e) {
      setError('Erro de conexão ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openModal = (user?: any) => {
    if (user) {
      setCurrentEditId(user.id);
      setFormData({
        name: user.name,
        email: user.email,
        password: '', // Don't pre-fill password for editing
        role: user.role,
        whatsapp_number: user.whatsapp_number || '',
        reports_config: user.reports_config || { daily: false, fraud: false }
      });
    } else {
      setCurrentEditId(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'OPERACAO',
        whatsapp_number: '',
        reports_config: { daily: false, fraud: false }
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const method = currentEditId ? 'PATCH' : 'POST';
    const body = currentEditId ? { id: currentEditId, ...formData } : formData;

    try {
      const res = await fetch('/api/admin/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao salvar usuário.');
      }
    } catch (e) {
      setError('Erro de conexão ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Deseja realmente excluir este usuário?')) return;
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        setError('Falha ao excluir usuário.');
      }
    } catch (e) {
      setError('Erro de conexão ao excluir usuário.');
    }
  };

  const toggleReport = (key: 'daily' | 'fraud') => {
    setFormData({
        ...formData,
        reports_config: {
            ...formData.reports_config,
            [key]: !formData.reports_config[key]
        }
    });
  };

  return (
    <div className="h-screen bg-black text-white p-8 font-sans overflow-y-auto overflow-x-hidden custom-scrollbar">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-800 rounded-full transition">
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter">Gestão de Usuários</h1>
              <p className="text-gray-500 text-sm uppercase tracking-widest mt-1">Configurações de Acesso e WhatsApp</p>
            </div>
          </div>
          <button 
            onClick={() => openModal()}
            className="bg-[#32a3dd] hover:bg-[#42b3ed] text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 transition"
          >
            <UserPlus className="w-4 h-4" /> Novo Usuário
          </button>
        </header>

        {error && (
          <div className="mb-8 bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center gap-3">
            <Shield className="w-4 h-4 text-red-500" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-600" /></div>
          ) : users.length === 0 ? (
            <div className="bg-gray-900/10 border border-dashed border-gray-800 p-20 rounded-3xl text-center">
                <User className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">Nenhum usuário cadastrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users.map(user => (
                <div key={user.id} className="bg-gray-900/20 border border-gray-800 p-6 rounded-3xl hover:border-[#32a3dd]/40 transition group relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl opacity-10 pointer-events-none ${user.role === 'ADM' ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${user.role === 'ADM' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {user.role === 'ADM' ? <Shield className="w-8 h-8" /> : <User className="w-8 h-8" />}
                    </div>
                    <div className="flex gap-1">
                        <button 
                            onClick={() => openModal(user)}
                            className="p-2 hover:bg-[#32a3dd]/10 text-gray-600 hover:text-[#32a3dd] rounded-xl transition"
                        >
                            <Pencil className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-2 hover:bg-red-500/10 text-gray-600 hover:text-red-500 rounded-xl transition"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-white">{user.name}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-black mb-4">
                      <Mail className="w-3 h-3" /> {user.email} 
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${user.role === 'ADM' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                            {user.role}
                        </span>
                        {user.whatsapp_number && (
                            <span className="bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5" /> {user.whatsapp_number}
                            </span>
                        )}
                    </div>

                    {/* Subscriptions Mini-View */}
                    <div className="border-t border-gray-800 pt-4 flex gap-4">
                        <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${user.reports_config?.daily ? 'text-[#32a3dd]' : 'text-gray-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${user.reports_config?.daily ? 'bg-[#32a3dd]' : 'bg-gray-800'}`}></div>
                            Resumo Diário
                        </div>
                        <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${user.reports_config?.fraud ? 'text-red-400' : 'text-gray-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${user.reports_config?.fraud ? 'bg-red-400' : 'bg-gray-800'}`}></div>
                            Alertas
                        </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create Modal (Popup) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
            
            <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-8">
                    <header className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter">
                                {currentEditId ? 'Editar Perfil' : 'Novo Usuário'}
                            </h2>
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mt-1">Configurações e Permissões</p>
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="bg-gray-900 hover:bg-gray-800 p-2 rounded-2xl transition">
                            <X className="w-6 h-6" />
                        </button>
                    </header>

                    <form onSubmit={handleSaveUser} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-black text-gray-500 ml-1">Nome Completo</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                                    <input 
                                        required
                                        className="w-full bg-black border border-gray-800 rounded-2xl pl-11 pr-4 py-3 text-sm focus:border-[#32a3dd] focus:ring-1 focus:ring-[#32a3dd] outline-none transition"
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-black text-gray-500 ml-1">E-mail Corporativo</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                                    <input 
                                        required type="email"
                                        className="w-full bg-black border border-gray-800 rounded-2xl pl-11 pr-4 py-3 text-sm focus:border-[#32a3dd] focus:ring-1 focus:ring-[#32a3dd] outline-none transition"
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-black text-gray-500 ml-1">
                                    {currentEditId ? 'Nova Senha (Opcional)' : 'Senha de Acesso'}
                                </label>
                                <div className="relative">
                                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                                    <input 
                                        required={!currentEditId}
                                        type="password"
                                        placeholder={currentEditId ? '••••••••' : ''}
                                        className="w-full bg-black border border-gray-800 rounded-2xl pl-11 pr-4 py-3 text-sm focus:border-[#32a3dd] focus:ring-1 focus:ring-[#32a3dd] outline-none transition placeholder:text-gray-700"
                                        value={formData.password}
                                        onChange={e => setFormData({...formData, password: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-black text-gray-500 ml-1">Perfil de Acesso</label>
                                <select 
                                    className="w-full bg-black border border-gray-800 rounded-2xl px-4 py-3 text-sm focus:border-[#32a3dd] focus:ring-1 focus:ring-[#32a3dd] outline-none transition appearance-none"
                                    value={formData.role}
                                    onChange={e => setFormData({...formData, role: e.target.value})}
                                >
                                    <option value="OPERACAO">OPERAÇÃO</option>
                                    <option value="ANALISTA">ANALISTA</option>
                                    <option value="ADM">ADMINISTRADOR (ADM)</option>
                                </select>
                            </div>
                        </div>

                        {/* WhatsApp Section */}
                        <div className="bg-gray-900/10 border border-gray-800/50 p-6 rounded-[2rem] space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#32a3dd] flex items-center gap-2">
                                <Bell className="w-4 h-4" /> Notificações WhatsApp
                            </h3>
                            
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-black text-gray-500 ml-1">Número (WhatsApp)</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                                    <input 
                                        placeholder="Ex: 5563999999999"
                                        className="w-full bg-black border border-gray-800 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-[#32a3dd] outline-none transition placeholder:text-gray-800 font-mono"
                                        value={formData.whatsapp_number}
                                        onChange={e => setFormData({...formData, whatsapp_number: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <button 
                                    type="button"
                                    onClick={() => toggleReport('daily')}
                                    className={`flex items-center gap-2 p-3 rounded-xl border transition text-left ${formData.reports_config.daily ? 'bg-[#32a3dd]/10 border-[#32a3dd]/30 text-[#32a3dd]' : 'bg-black/50 border-gray-800 text-gray-500'}`}
                                >
                                    {formData.reports_config.daily ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">Resumo Diário (06h)</span>
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => toggleReport('fraud')}
                                    className={`flex items-center gap-2 p-3 rounded-xl border transition text-left ${formData.reports_config.fraud ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-black/50 border-gray-800 text-gray-500'}`}
                                >
                                    {formData.reports_config.fraud ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">Alertas de Fraude</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-black py-4 rounded-2xl transition uppercase tracking-widest text-xs"
                            >
                                Cancelar
                            </button>
                            <button 
                                disabled={saving}
                                className="flex-[2] bg-[#32a3dd] hover:bg-[#42b3ed] text-white font-black py-4 rounded-2xl transition shadow-lg shadow-[#32a3dd]/20 uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                {saving ? 'SALVANDO...' : (currentEditId ? 'SALVAR ALTERAÇÕES' : 'CRIAR USUÁRIO')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
