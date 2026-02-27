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
      <div className="absolute inset-0 bg-gradient-to-b from-[#010b1a]/95 via-[#001a33]/85 to-[#010b1a]/95" />
      
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

          {/* RUMO LOGO (Official Reproduction) */}
          <div className="mb-10 flex flex-col items-center">
            <svg viewBox="0 0 240 80" className="w-48 h-16 text-white fill-current">
              {/* Lowercase "rumo" text reproduction using paths for precision */}
              <path d="M15 45c0-10 8-15 20-15h5v25h-5v-18h-2c-8 0-13 4-13 10v8h-5v-10zM55 30h5v25h-5v-3h-1c-3 3-7 5-11 5-8 0-14-6-14-14s6-14 14-14c4 0 8 2 11 5v-4zm-11 19c5 0 10-4 10-10s-5-10-10-10-10 4-10 10 5 10 10 10zM75 30h5v3c3-3 7-5 11-5 8 0 14 6 14 14s-6 14-14 14c-4 0-8-2-11-5v13h-5V30zm16 19c5 0 10-4 10-10s-5-10-10-10-10 4-10 10 5 10 10 10zM140 43c0 8-6 14-14 14s-14-6-14-14c0-8 6-14 14-14s14 6 14 14zm-14 9c5 0 9-4 9-9s-4-9-9-9-9 4-9 9 4 9 9 9z" transform="translate(0, -5)" />
              
              {/* Circular Swirl Icon */}
              <g transform="translate(160, 30) scale(0.6)">
                <path d="M30 0C13.5 0 0 13.5 0 30c0 1.5.1 3 .3 4.5l14-4.5c-.2-1-.3-2-.3-3 0-9 7.3-16.3 16.3-16.3 1 0 2 .1 3 .3L38 1s-4-1-8-1z" opacity="0.9" />
                <path d="M60 30c0 16.5-13.5 30-30 30-1.5 0-3-.1-4.5-.3l4.5-14c1 .2 2 .3 3 .3 9 0 16.3-7.3 16.3-16.3 0-1-.1-2-.3-3L59 22s1 4 1 8z" opacity="0.8" />
                <path d="M0 30C0 13.5 13.5 0 30 0c1.5 0 3 .1 4.5.3l-4.5 14c-1-.2-2-.3-3-.3-9 0-16.3 7.3-16.3 16.3 0 1 .1 2 .3 3L1 38s-1-4-1-8z" opacity="0.7" />
              </g>
            </svg>
            
            <h2 className="text-sm font-black text-white/90 mt-4 tracking-[4px] uppercase text-center border-t border-white/10 pt-4 w-full">
              Centro de Controle Rodoviário
            </h2>
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
