'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shield, User, Mail, ChevronLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingUser, setAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'OPERACAO' });

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (res.ok) {
        setNewUser({ name: '', email: '', password: '', role: 'OPERACAO' });
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Deseja realmente excluir este usuário?')) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-800 rounded-full transition">
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter">Gestão de Usuários</h1>
              <p className="text-gray-500 text-sm uppercase tracking-widest mt-1">Controle de Acessos Rumo</p>
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* New User Form */}
          <div className="bg-gray-900/30 border border-gray-800 p-6 rounded-3xl h-fit">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#32a3dd] mb-6 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Cadastrar Novo
            </h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">Nome Completo</label>
                <input 
                  required
                  className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2 text-sm focus:border-[#32a3dd] outline-none"
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">E-mail</label>
                <input 
                  required type="email"
                  className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2 text-sm focus:border-[#32a3dd] outline-none"
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">Senha Inicial</label>
                <input 
                  required type="password"
                  className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2 text-sm focus:border-[#32a3dd] outline-none"
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">Perfil de Acesso</label>
                <select 
                  className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2 text-sm focus:border-[#32a3dd] outline-none"
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value})}
                >
                  <option value="OPERACAO">OPERAÇÃO</option>
                  <option value="ANALISTA">ANALISTA</option>
                  <option value="ADM">ADM</option>
                </select>
              </div>
              <button 
                disabled={addingUser}
                className="w-full bg-[#32a3dd] hover:bg-[#42b3ed] text-white font-black py-3 rounded-xl transition mt-4 disabled:opacity-50"
              >
                {addingUser ? 'SALVANDO...' : 'CRIAR USUÁRIO'}
              </button>
            </form>
          </div>

          {/* User List */}
          <div className="lg:col-span-2 space-y-4">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-600" /></div>
            ) : users.map(user => (
              <div key={user.id} className="bg-gray-900/10 border border-gray-800 p-4 rounded-2xl flex items-center justify-between group hover:border-[#32a3dd]/30 transition">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${user.role === 'ADM' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {user.role === 'ADM' ? <Shield className="w-6 h-6" /> : <User className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{user.name}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-black">
                      <Mail className="w-3 h-3" /> {user.email} 
                      <span className="mx-1">•</span>
                      <span className={`${user.role === 'ADM' ? 'text-purple-400' : 'text-blue-400'}`}>{user.role}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteUser(user.id)}
                  className="p-3 hover:bg-red-500/10 text-gray-600 hover:text-red-500 rounded-xl transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
