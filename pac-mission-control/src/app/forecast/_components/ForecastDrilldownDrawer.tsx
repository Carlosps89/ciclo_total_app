'use client';

import { X, Loader2, CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  terminal: string;
  targetHour: string; // YYYY-MM-DD HH:00:00
}

export function ForecastDrilldownDrawer({ isOpen, onClose, terminal, targetHour }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ Evita que o body role quando o drawer estiver aberto (previne quebra visual)
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && targetHour) fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetHour]);

  const fetchDetails = async () => {
    setLoading(true);
    setItems([]);
    try {
      const res = await fetch(`/api/pac/forecast/drilldown?terminal=${terminal}&hour=${encodeURIComponent(targetHour)}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.rows || []); // Adjusted to match API response (data.rows usually) - Prompt said data.items but check existing API.
        // Checking previous drilldown implementation...
        // Previous drilldown response: { ok: true, rows: [...] }
        // So I should use data.rows.
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (d: string) => {
    try {
      const date = new Date(d.replace(' ', 'T'));
      return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}h`;
    } catch { return d; }
  };

  return (
    <div
      className={[
        "fixed inset-y-0 right-0 w-[460px] z-50",
        "bg-gray-950 border-l border-gray-800 shadow-2xl",
        "transform transition-transform duration-300",
        // ✅ importantíssimo: drawer não pode “estourar” layout
        "overflow-hidden flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
      aria-hidden={!isOpen}
    >
      {/* HEADER */}
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 shrink-0 bg-gray-900/50">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase text-white/60 tracking-widest font-bold">
            Detalhamento de Previsão
          </span>
          <span className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-purple-500" />
            {targetHour ? fmtDate(targetHour) : "--"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-800 rounded text-white/80 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ✅ CONTENT COM SCROLL INDEPENDENTE */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-white/70">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-xs">Identificando prováveis chegadas...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-white/60 italic text-sm">
            Nenhum veículo identificado com alta probabilidade para esta hora.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="px-2 py-2 text-[10px] uppercase text-white/60 font-bold grid grid-cols-12 gap-2">
              <div className="col-span-3">PLACA</div>
              <div className="col-span-4">ORIGEM</div>
              <div className="col-span-3">JANELA</div>
              <div className="col-span-2 text-right">PROB.</div>
            </div>

            {items.map((item, i) => (
              <div
                key={i}
                className="p-3 bg-gray-900/20 border border-gray-800/60 rounded hover:bg-gray-800/50 transition grid grid-cols-12 gap-2 items-center"
              >
                <div className="col-span-3 flex flex-col">
                  <span className="text-sm font-bold text-white">{item.placa}</span>
                  <span className="text-[10px] text-white/60">#{item.gmo_id}</span>
                </div>

                <div className="col-span-4 text-[11px] text-white/85 truncate" title={item.origem}>
                  {item.origem}
                </div>

                <div className="col-span-3 flex flex-col">
                  <span className="text-xs text-white">{fmtDate(item.janela_agendamento || item.window)}</span> 
                  {/* Handle potentially different column names. 'window' in example vs maybe 'janela_agendamento' in API */}
                  
                  {item.delta_h > 0 && (
                    <span className="text-[10px] text-purple-300">Antecipa {item.delta_h}h</span>
                  )}
                </div>

                <div className="col-span-2 text-right">
                  <span className={`text-xs font-bold ${item.probability > 0.5 ? "text-green-400" : "text-yellow-400"}`}>
                    {(item.probability * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
