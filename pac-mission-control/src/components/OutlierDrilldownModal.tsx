import React, { useEffect, useState } from 'react';
import { X, Activity, Truck, User, MapPin, BarChart3, List, Map as MapIcon, EyeOff, Clock } from 'lucide-react';
import { Bar } from 'react-chartjs-2';

interface DrilldownVehicle {
  gmo: string;
  cliente: string;
  origem: string;
  horas: number;
}

interface DrilldownHistogramBucket {
  bucket: number;
  label: string;
  volume: number;
}

interface HeatmapCell {
  day: string;
  dayIdx: number;
  hour: number;
  volume: number;
}

interface OutlierDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  terminal: string;
  startDate: string;
  endDate: string;
  praca: string;
  produto: string;
  stageName: string; // The UI display name
  stageId: string; // The API identifier (e.g., 'emissao_agendamento')
  minHours: number;
  maxHours: number | null;
  onIgnoreGmo?: (gmo: string) => void;
}

export default function OutlierDrilldownModal({
  isOpen,
  onClose,
  terminal,
  startDate,
  endDate,
  praca,
  produto,
  stageName,
  stageId,
  minHours,
  maxHours,
  onIgnoreGmo
}: OutlierDrilldownModalProps) {
  const [vehicles, setVehicles] = useState<DrilldownVehicle[]>([]);
  const [histogram, setHistogram] = useState<DrilldownHistogramBucket[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [stepData, setStepData] = useState<number>(1);
  const [userStepReq, setUserStepReq] = useState<number | null>(null);
  const [stepInputVal, setStepInputVal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'heatmap'>('table');

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      terminal,
      startDate,
      endDate,
      praca,
      produto,
      stage: stageId,
      minHours: minHours.toString()
    });

    if (maxHours !== null) {
      qs.append('maxHours', maxHours.toString());
    }

    if (userStepReq !== null) {
      qs.append('step', userStepReq.toString());
    }

    fetch(`/api/pac/diagnostics/outliers-drilldown?${qs.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setVehicles(data.vehicles || []);
        setHistogram(data.histogram || []);
        setHeatmap(data.heatmap || []);
        if (data.meta && data.meta.step) setStepData(data.meta.step);
      })
      .catch(e => {
        console.error(e);
        setError("Falha ao comunicar com o Athena para Drill-down.");
      })
      .finally(() => {
        setLoading(false);
      });

  }, [isOpen, terminal, startDate, endDate, praca, produto, stageId, minHours, maxHours, userStepReq]);

  // Chartjs custom plugin for percentage over bars
  const percentagePlugin = {
    id: 'percentagePlugin',
    afterDatasetsDraw(chart: any) {
      const { ctx, data } = chart;
      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#cbd5e1'; // slate-300
      ctx.textAlign = 'center';

      const dataset = data.datasets[0];
      const meta = chart.getDatasetMeta(0);
      const total = dataset.data.reduce((a: number, b: number) => a + b, 0);

      meta.data.forEach((bar: any, index: number) => {
        const val = dataset.data[index];
        if (val > 0 && total > 0) {
          const pct = ((val / total) * 100).toFixed(1) + '%';
          ctx.fillText(pct, bar.x, bar.y - 6);
        }
      });
      ctx.restore();
    }
  };

  const renderHeatmap = () => {
    // Determine max volume for color scale
    const maxHeat = Math.max(...heatmap.map(h => h.volume), 1);
    const getHeatColor = (vol: number) => {
      if (vol === 0) return 'rgba(255,255,255,0.02)';
      const intensity = 0.2 + (vol / maxHeat) * 0.8;
      return `rgba(249, 115, 22, ${intensity})`; // Orange neon base
    };

    const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="bg-[#0b121c] border border-orange-500/20 rounded-[32px] p-8 mt-4 shadow-2xl relative">
        <div className="mb-6 flex justify-between items-center">
          <h3 className="text-sm font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
            <MapIcon size={16} /> Mapa de Calor Operacional
          </h3>
          <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Frequência por Dia e Hora</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar pb-4">
          <div className="min-w-[800px] flex flex-col gap-1">
            {/* Header Row (Hours) */}
            <div className="flex items-center gap-1 mb-2">
              <div className="w-20 shrink-0"></div>
              {hours.map(h => (
                <div key={h} className="flex-1 text-center text-[9px] font-black text-slate-500 uppercase">{h}h</div>
              ))}
            </div>
            {/* Heatmap Grid */}
            {days.map(dayName => (
              <div key={dayName} className="flex items-center gap-1 h-8 group hover:bg-white/5 rounded-lg px-1 transition-colors">
                <div className="w-20 shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-white transition-colors">{dayName.slice(0, 3)}</div>
                {hours.map(h => {
                  const cellInfo = heatmap.find(cell => cell.day === dayName && cell.hour === h);
                  const vol = cellInfo ? cellInfo.volume : 0;
                  return (
                    <div
                      key={`${dayName}-${h}`}
                      className="flex-1 h-full rounded transition-all hover:scale-110 hover:shadow-[0_0_10px_rgba(249,115,22,0.5)] hover:z-10 relative cursor-crosshair group/cell"
                      style={{ backgroundColor: getHeatColor(vol) }}
                    >
                      {vol > 0 && (
                        <div className="absolute opacity-0 group-hover/cell:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#020a14] border border-orange-500/30 text-white text-[10px] font-black px-3 py-1.5 rounded-lg shadow-xl pointer-events-none whitespace-nowrap z-50">
                          {vol} caminhões<br /><span className="text-orange-400">{dayName} às {h}h</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-12 animate-in fade-in duration-300">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-6xl bg-[#0a0f14] h-full max-h-[90vh] border border-blue-500/20 rounded-[32px] shadow-[0_0_100px_rgba(59,130,246,0.15)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500">

        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-red-500/5 rounded-full blur-[80px] pointer-events-none" />

        {/* HEADER */}
        <div className="px-8 py-6 border-b border-white/5 flex justify-between items-start bg-white/2 relative z-10">
          <div className="flex gap-4 items-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Activity size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3 w-full">
                {stageName}
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono tracking-widest">{vehicles.length} Ocorrências</span>
              </h2>
              <div className="flex items-center gap-2 mt-1 px-1">
                <Clock size={12} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-400">
                  {maxHours !== null
                    ? `Veículos impactados de ${minHours}h até ${maxHours}h no processo`
                    : `Veículos com impacto extremo: +${minHours}h no processo`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-[#0b121c] p-1 rounded-full border border-white/10 shadow-inner">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'table' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <List size={14} /> Tabela
              </button>
              <button
                onClick={() => setViewMode('heatmap')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'heatmap' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <MapIcon size={14} /> Mapa de Calor
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-90"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* BODY (List) */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10 w-full">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-6">
              <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-blue-500 animate-spin" />
              <div className="flex flex-col items-center gap-2">
                <span className="text-blue-400 font-mono tracking-widest uppercase text-sm font-bold animate-pulse">Garimpando Identificadores...</span>
                <span className="text-slate-500 text-xs text-center max-w-sm">O Athena está varrendo a base de dados filtrada para encontrar as placas exatas deste quadrante.</span>
              </div>
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-rose-400">
              <Activity size={48} className="opacity-50" />
              <span className="font-bold">{error}</span>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-slate-500">
              <span className="font-bold">Nenhum veículo encontrado no corte exato do back-end.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">

              {/* MICRO-HISTOGRAM BLOCK */}
              {histogram.length > 0 && (
                <div className="bg-[#0b121c] border border-white/5 rounded-3xl p-6 shadow-inner relative flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                      <BarChart3 size={14} /> Micro-Distribuição
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest border border-white/10 px-2 py-1 rounded-md">
                        Auto: {stepData}h
                      </span>
                      <span className="text-[10px] text-white/40 font-bold ml-2">FORÇAR STEP (HOURS):</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Ex: 2"
                        value={stepInputVal}
                        onChange={e => setStepInputVal(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(stepInputVal);
                          if (val > 0) setUserStepReq(val);
                          else setUserStepReq(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = parseInt(stepInputVal);
                            if (val > 0) setUserStepReq(val);
                            else setUserStepReq(null);
                          }
                        }}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white w-16 text-center focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="h-40 w-full relative">
                    <Bar
                      plugins={[percentagePlugin]}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 20 } },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            backgroundColor: '#02132b', titleColor: '#fff', bodyColor: '#fff',
                            titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 12, weight: 'bold' },
                            borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12,
                            callbacks: { label: (ctx: any) => `Volume: ${ctx.raw} caminhões` }
                          }
                        },
                        scales: {
                          x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' }, maxRotation: 45, minRotation: 45 } },
                          y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10, weight: 'normal' } } }
                        }
                      }}
                      data={{
                        labels: histogram.map(h => h.label),
                        datasets: [{
                          data: histogram.map(h => h.volume),
                          backgroundColor: 'rgba(244, 63, 94, 0.4)',
                          hoverBackgroundColor: 'rgba(244, 63, 94, 0.8)',
                          borderRadius: 4,
                          barPercentage: 0.8
                        }]
                      }}
                    />
                  </div>
                </div>
              )}

              {viewMode === 'heatmap' && renderHeatmap()}

              {viewMode === 'table' && (
                <>
                  {/* TABLE LIST */}
                  <div className="grid grid-cols-12 px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <div className="col-span-3">Ticket (GMO)</div>
                    <div className="col-span-5">Cliente Emissor</div>
                    <div className="col-span-2">Origem Mapeada</div>
                    <div className="col-span-2 text-right">Tempo Absoluto</div>
                  </div>

                  {vehicles.map((v, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 items-center bg-[#0d1218] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 transition-colors duration-300 rounded-2xl px-6 py-4 w-full"
                    >
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                          <Truck size={14} />
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-300 truncate">{v.gmo}</span>
                        {onIgnoreGmo && (
                          <button
                            onClick={() => {
                              onIgnoreGmo(v.gmo);
                              setVehicles(prev => prev.filter(x => x.gmo !== v.gmo));
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-md transition-all ml-auto"
                            title="Ignorar esta Placa (Adicionar à Whitelist)"
                          >
                            <EyeOff size={14} />
                          </button>
                        )}
                      </div>

                      <div className="col-span-5 flex items-center gap-3 text-sm font-bold text-white truncate pr-4">
                        <User size={14} className="text-slate-500 shrink-0" />
                        <span className="truncate">{v.cliente}</span>
                      </div>

                      <div className="col-span-2 flex items-center gap-2 text-xs font-medium text-slate-400 truncate pr-4">
                        <MapPin size={12} className="text-slate-500 shrink-0" />
                        <span className="truncate">{v.origem}</span>
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <div className="px-3 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono font-black text-sm">
                          {v.horas.toFixed(1)}h
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
