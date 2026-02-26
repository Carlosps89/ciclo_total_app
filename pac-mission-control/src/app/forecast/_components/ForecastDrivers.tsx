'use client';

interface Props {
  drivers: any[]; // List of drivers from the selected hour
  selectedHour: string | null;
  loading?: boolean;
}

export function ForecastDrivers({ drivers, selectedHour, loading }: Props) {
  
  if (loading) {
      return (
        <div className="h-full bg-gray-900/20 border border-gray-800 rounded p-4 flex flex-col items-center justify-center text-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-white/30 text-xs uppercase tracking-widest">Carregando detalhes...</p>
        </div>
      );
  }

  if (!selectedHour) {
      return (
        <div className="h-full bg-gray-900/20 border border-gray-800 rounded p-4 flex flex-col items-center justify-center text-center">
            <p className="text-white/30 text-xs uppercase tracking-widest">Selecione uma hora no gráfico para ver detalhes</p>
        </div>
      );
  }

  return (
    <div className="h-full bg-gray-900/20 border border-gray-800 rounded p-4 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-4 flex justify-between items-center">
            <span>Drivers ({drivers.length})</span>
            <span className="text-blue-400">{selectedHour}</span>
        </h3>
        
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-2 custom-scrollbar">
            {drivers.length === 0 ? (
                <p className="text-white/20 text-xs italic">Nenhum agendamento para esta hora.</p>
            ) : (
                drivers.map((d, i) => (
                    <div key={i} className="bg-black/40 border border-gray-800 p-2 rounded text-xs hover:border-blue-500/50 transition">
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-white">{d.placa}</span>
                            <span className="text-[10px] text-white/40">{d.gmo_id}</span>
                        </div>
                        <div className="flex justify-between items-end">
                             <div className="flex flex-col">
                                <span className="text-[10px] text-white/50">Janela</span>
                                <span className="text-white/80">{d.janela_agendamento ? d.janela_agendamento.substring(11,16) : '--:--'}</span>
                             </div>
                             <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${d.evento && d.evento.toLowerCase().includes('programado') ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                {d.evento}
                             </span>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );
}
