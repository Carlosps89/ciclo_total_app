'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Historico Page Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-[40px] max-w-xl w-full shadow-2xl backdrop-blur-xl animate-in zoom-in duration-500">
        <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center border border-red-500/30 mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        
        <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
          Ops! Ocorreu um Erro de Renderização
        </h2>
        <p className="text-white/40 text-sm mb-8 leading-relaxed">
          Ocorreu uma exceção no lado do cliente que impediu o carregamento da página.
          Isso pode ser causado por dados malformados ou conflito de bibliotecas.
        </p>

        <div className="bg-black/40 rounded-2xl p-4 mb-8 text-left border border-white/5">
           <div className="text-[10px] text-white/20 uppercase font-black mb-2 tracking-widest">Detalhes Técnicos:</div>
           <code className="text-xs text-red-400 font-mono break-all line-clamp-3">
             {error.message || 'Erro desconhecido'}
           </code>
        </div>

        <button
          onClick={() => reset()}
          className="w-full flex items-center justify-center gap-2 bg-white text-black font-black uppercase py-4 rounded-2xl hover:bg-gray-200 transition-all active:scale-95 shadow-xl"
        >
          <RefreshCcw className="w-4 h-4" />
          Tentar Novamente
        </button>
      </div>
      
      <p className="mt-8 text-[9px] text-white/20 uppercase tracking-[0.4em] font-black">
        PAC Mission Control • Error Recovery System
      </p>
    </div>
  );
}
