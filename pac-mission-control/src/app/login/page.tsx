'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        // Redirecionar para o dashboard principal
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Falha ao entrar');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden font-sans">
      {/* Background Image with Blue Shadow Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/login-bg.png')" }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-[#010b1a]/95 via-[#001a33]/85 to-[#010b1a]/95" />
      
      {/* Decorative Lights */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#002d5a]/40 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#32a3dd]/20 rounded-full blur-[120px]" />

      {/* Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{ backgroundImage: 'radial-gradient(#32a3dd 1px, transparent 1px)', backgroundSize: '30px 30px' }}
      />

      <div className="z-10 w-full max-w-[420px] px-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
        {/* Login Card */}
        <div className="bg-[#0a1628]/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#32a3dd]/50 to-transparent" />

          {/* Official Branding Area */}
          <div className="mb-10 flex flex-col items-center">
            <h1 className="text-2xl font-black text-white tracking-[4px] uppercase text-center leading-tight">
              Centro de Controle Rodoviário
            </h1>
            <div className="w-12 h-1 bg-[#32a3dd] mt-6 rounded-full opacity-50" />
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3 animate-in shake duration-300">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-xs text-red-200 font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] text-[#32a3dd] font-black uppercase tracking-widest ml-1">E-mail Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-[#32a3dd] transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@rumo.com"
                  className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-[#32a3dd]/50 focus:ring-4 focus:ring-[#32a3dd]/5 transition-all outline-none placeholder:text-gray-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] text-[#32a3dd] font-black uppercase tracking-widest">Senha de Acesso</label>
                <button type="button" className="text-[9px] text-gray-500 hover:text-[#32a3dd] uppercase font-bold tracking-wider transition">Esqueci a senha?</button>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-[#32a3dd] transition-colors" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-[#32a3dd]/50 focus:ring-4 focus:ring-[#32a3dd]/5 transition-all outline-none placeholder:text-gray-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#002d5a] to-[#32a3dd] hover:from-[#003d7a] hover:to-[#42b3ed] text-white font-black uppercase tracking-[2px] py-4 rounded-2xl shadow-lg shadow-[#002d5a]/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <span>Acessar Painel</span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-[9px] text-gray-500 uppercase font-medium tracking-widest">
              Acesso restrito ao Centro de Controle Rodoviário
            </p>
          </div>
        </div>
        
        {/* Footer Info */}
        <p className="mt-6 text-center text-[9px] text-gray-600 uppercase font-black tracking-[2px]">
          © 2026 Rumo Logística • Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
