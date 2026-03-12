import React from 'react';
import { Calendar, Download, Scale, Scissors, AlertTriangle, ChevronDown, X } from 'lucide-react';
import { Bar } from 'react-chartjs-2';

export interface OutlierData {
  simulation: {
    real_avg: number;
    avg_no_outliers: number;
    avg_leveled_p25: number;
    delta_cut: number;
    delta_level: number;
    total_vol: number;
  };
  thresholds: {
    ciclo: number;
    viagem: number;
    interno: number;
    agendamento: number;
    verde: number;
    emissao: number;
  };
  histograms: {
    agendamento: { label: string; volume: number; maxHours: number }[];
    viagem: { label: string; volume: number; maxHours: number }[];
    interno: { label: string; volume: number; maxHours: number }[];
    verde: { label: string; volume: number; maxHours: number }[];
    emissao: { label: string; volume: number; maxHours: number }[];
  };
  patterns: {
    entityName: string;
    totalVol: number;
    outlierVol: number;
    outlierAvgTime: number;
    rootCauseBadge: string;
  }[];
}

interface Props {
  startDate: string;
  endDate: string;
  terminal: string;
  setStartDate?: (d: string) => void;
  setEndDate?: (d: string) => void;
  onExport: () => void;
  exporting: boolean;
  iqr?: number;
  setIqr?: (v: number) => void;
  limits?: { emissao: number, agendamento: number, viagem: number, verde: number, interno: number };
  setLimits?: (v: { emissao: number, agendamento: number, viagem: number, verde: number, interno: number }) => void;
}

export function GlobalOutlierHeader({ startDate, endDate, terminal, setStartDate, setEndDate, onExport, exporting, iqr, setIqr }: Props) {
  return (
    <div className="bg-[#020a14]/90 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 lg:p-8 flex flex-col md:flex-row justify-between items-center shadow-2xl">
      <div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent flex items-center gap-4 tracking-tighter">
          DIAGNÓSTICO DE ANOMALIAS
          <span className="text-[11px] font-black bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded-lg tracking-widest uppercase mt-1 lg:mt-0 shadow-inner">Outliers Engine</span>
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-sm uppercase font-black tracking-[0.3em] text-white/70">{terminal}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
          <p className="text-xs text-white/50 uppercase tracking-widest font-bold">Investigação de Cauda Longa e Simulação de Cenários (What-If)</p>
        </div>
      </div>
      <div className="flex gap-4 mt-8 md:mt-0 items-center flex-wrap md:flex-nowrap">
        <div className="flex gap-2 shadow-xl bg-[#0b121c] border border-white/10 p-2 rounded-[24px]">
          <div className="relative group">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate?.(e.target.value)}
              className="appearance-none cursor-text flex items-center gap-3 bg-transparent hover:bg-white/5 transition-all px-4 py-2 pl-12 rounded-[16px] text-xs font-black uppercase tracking-widest text-[#cbd5e1] outline-none border-none"
            />
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none group-hover:scale-110 transition-transform" />
          </div>
          <div className="w-px bg-white/10 my-2"></div>
          <div className="relative group">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate?.(e.target.value)}
              className="appearance-none cursor-text flex items-center gap-3 bg-transparent hover:bg-white/5 transition-all px-4 py-2 pl-12 rounded-[16px] text-xs font-black uppercase tracking-widest text-[#cbd5e1] outline-none border-none"
            />
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400 pointer-events-none group-hover:scale-110 transition-transform" />
          </div>
        </div>

        {setIqr && iqr !== undefined && (
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl shadow-inner ml-2">
            <span className="text-[10px] uppercase font-black tracking-widest text-[#cbd5e1]">Tolerância (Multiplicador IQR):</span>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="4.0"
              value={iqr}
              onChange={(e) => setIqr(parseFloat(e.target.value) || 1.5)}
              className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-emerald-400 font-black text-sm w-16 text-center outline-none focus:border-emerald-500 transition-colors"
              title="Padrão estatístico é 1.5. Aumente para ser mais tolerante com anomalias."
            />
            <span className="text-[10px] text-white/40 font-bold uppercase">x</span>
          </div>
        )}

        <button
          onClick={onExport}
          disabled={exporting}
          className={`flex items-center gap-3 px-8 py-4 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all shadow-xl ${exporting
            ? 'bg-white/5 border border-white/5 text-slate-500 cursor-not-allowed'
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 active:scale-95'
            }`}
        >
          {exporting ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-rose-400" /> : <Download className="w-5 h-5" />}
          {exporting ? 'Exportando...' : 'Exportar Base Completa'}
        </button>
      </div>
    </div>
  );
}

export function CycleSimulator({ simulation, offenderFilter, clearFilter }: { simulation: OutlierData['simulation'], offenderFilter?: string, clearFilter?: () => void }) {
  return (
    <div className="flex flex-col relative mt-4">
      {offenderFilter && (
        <div className="absolute -top-3 left-6 z-10 bg-orange-600 text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(234,88,12,0.5)] flex items-center gap-2">
          <span>⚡ Filtrando Ofensor Alvo: {offenderFilter}</span>
          <button onClick={clearFilter} className="hover:bg-white/20 rounded-full p-0.5 ml-2 transition-colors">
            <X size={12} />
          </button>
        </div>
      )}
      <div className={`flex flex-col lg:flex-row bg-[#020a14] rounded-[40px] border transition-colors shadow-2xl overflow-hidden ${offenderFilter ? 'border-orange-500/50' : 'border-white/5'}`}>
        {/* Realidade */}
        <div className="flex-1 p-12 border-b lg:border-b-0 lg:border-r border-white/5 relative bg-white/5">
          <span className="text-xs text-white/50 font-black uppercase tracking-widest mb-6 block">Ciclo Médio Atual (Contaminado)</span>
          <div className="flex items-baseline gap-2 mt-4">
            <div className="text-[5.5rem] leading-none font-black text-white">{simulation.real_avg}</div>
            <div className="text-3xl font-black text-white/30">h</div>
          </div>
          <div className="mt-8 flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2 rounded-xl w-fit shadow-inner">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
            <p className="text-[11px] text-[#cbd5e1] uppercase font-black tracking-widest">Volume Analisado: {simulation.total_vol.toLocaleString()} viagens</p>
          </div>
        </div>

        {/* Simulação: Corte de Outliers */}
        <div className="flex-1 p-12 relative group bg-emerald-500/5 transition-colors border-b lg:border-b-0 lg:border-r border-white/5 hover:bg-emerald-500/10">
          <Scissors className="absolute top-10 right-10 w-8 h-8 text-emerald-500/40 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
          <span className="text-xs text-emerald-400/80 font-black uppercase tracking-widest mb-6 block">Cenário: Exclusão IQR Total</span>
          <div className="flex items-baseline gap-2 mt-4">
            <div className="text-7xl font-black text-emerald-400">{simulation.avg_no_outliers}</div>
            <div className="text-3xl font-black text-emerald-500/40">h</div>
          </div>
          <div className="mt-8 flex items-start gap-4">
            <span className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-black rounded-[10px] shadow-sm">-{simulation.delta_cut}h</span>
            <p className="text-[10px] text-white/50 uppercase font-bold leading-relaxed max-w-[220px]">Simulação cortando (removendo) as viagens que extrapolam o teto do P75 + 1.5*IQR</p>
          </div>
        </div>

        {/* Simulação: Nivelamento P25 */}
        <div className="flex-1 p-12 relative group bg-blue-500/5 transition-colors hover:bg-blue-500/10">
          <Scale className="absolute top-10 right-10 w-8 h-8 text-blue-500/40 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
          <span className="text-xs text-blue-400/80 font-black uppercase tracking-widest mb-6 block">Cenário: Mediana 1º Quartil</span>
          <div className="flex items-baseline gap-2 mt-4">
            <div className="text-7xl font-black text-blue-400">{simulation.avg_leveled_p25}</div>
            <div className="text-3xl font-black text-blue-500/40">h</div>
          </div>
          <div className="mt-8 flex items-start gap-4">
            <span className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-black rounded-[10px] shadow-sm">-{simulation.delta_level}h</span>
            <p className="text-[10px] text-white/50 uppercase font-bold leading-relaxed max-w-[220px]">Simulação nivelando penalidades para que os ofensores performem na velocidade ideal (P25)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StageHistogram({ title, data, outlierThreshold, onBarClick, step, onStepChange }: { title: string, data: { label: string, volume: number, maxHours: number }[], outlierThreshold: number, onBarClick?: (bucket: { minHours: number, maxHours: number | null }) => void, step?: number, onStepChange?: (val: number) => void }) {
  const [manualLimit, setManualLimit] = React.useState(outlierThreshold);
  const [selectedBars, setSelectedBars] = React.useState<number[]>([]);

  // Update internal limit if the backend changes it
  React.useEffect(() => {
    setManualLimit(outlierThreshold);
    setSelectedBars([]); // Reset selections on data reload
  }, [outlierThreshold, data]);

  const activeThreshold = manualLimit || outlierThreshold;

  const isAnomaly = (maxHours: number) => maxHours > activeThreshold;

  const totalVolume = data.reduce((sum, d) => sum + d.volume, 0);
  const selectedVolume = selectedBars.reduce((sum, idx) => sum + data[idx].volume, 0);
  const selectedPct = totalVolume > 0 ? ((selectedVolume / totalVolume) * 100).toFixed(1) : '0.0';

  const backgroundColors = data.map((bucket, i) => {
    if (selectedBars.includes(i)) return 'rgba(168, 85, 247, 0.9)'; // Purple 500 when selected
    return isAnomaly(bucket.maxHours) ? 'rgba(249, 115, 22, 0.9)' : 'rgba(56, 189, 248, 0.4)';
  });

  const hoverColors = data.map((bucket, i) => {
    if (selectedBars.includes(i)) return 'rgba(168, 85, 247, 1)';
    return isAnomaly(bucket.maxHours) ? 'rgba(249, 115, 22, 1)' : 'rgba(56, 189, 248, 0.6)';
  });

  const borderColors = data.map((bucket, i) => {
    return selectedBars.includes(i) ? 'rgba(255, 255, 255, 0.8)' : 'transparent';
  });

  const maxPossibleValue = data.length > 0 ? Math.max(...data.map(d => d.maxHours)) : activeThreshold * 2;
  const linePercentage = Math.min((activeThreshold / maxPossibleValue) * 100, 95);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event: any, elements: any[]) => {
      if (elements.length > 0) {
        const idx = elements[0].index;

        if (event.native && event.native.shiftKey) {
          setSelectedBars(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
          );
          return;
        }

        if (!onBarClick) return;

        const bucket = data[idx];

        let minHours = 0;
        let maxHours: number | null = null;

        const label = bucket.label;
        const nums = label.match(/\d+/g);

        if (label.includes('Entre') && nums && nums.length >= 2) {
          minHours = parseInt(nums[0]);
          maxHours = parseInt(nums[1]);
        } else if (label.includes('Mais de') && nums && nums.length >= 1) {
          minHours = parseInt(nums[0]);
        } else if (label.includes('Agorinha')) {
          minHours = 0;
          maxHours = 1;
        } else if (nums && nums.length >= 2) {
          // Matches "0h - 24h" from OutliersEngine format
          minHours = parseInt(nums[0]);
          maxHours = parseInt(nums[1]);
        } else {
          minHours = bucket.maxHours > 0 ? bucket.maxHours - 2 : 0;
          maxHours = bucket.maxHours;
        }

        onBarClick({ minHours, maxHours });
      }
    },
    onHover: (event: any, chartElement: any[]) => {
      if (event.native && event.native.target) {
        event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#02132b',
        titleColor: '#fff',
        bodyColor: '#fff',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 14, weight: 'bold' },
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 16,
        callbacks: {
          label: (ctx: any) => `Volume: ${ctx.raw} viagens`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 12, weight: 'bold' }, maxRotation: 45, minRotation: 45 }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { display: false },
        ticks: { color: '#cbd5e1', font: { size: 12, weight: '500' } }
      }
    }
  };

  return (
    <div className="bg-[#0b121c] border border-white/5 rounded-[36px] p-10 h-[450px] flex flex-col relative group shadow-2xl">
      {selectedBars.length > 0 && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 bg-purple-600/90 text-white border border-purple-400/50 shadow-[0_0_40px_rgba(168,85,247,0.5)] px-6 py-3 rounded-2xl flex items-center gap-4 backdrop-blur-md animate-in zoom-in-95 duration-200">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200">Volume Aferido ({selectedBars.length} faixas)</span>
            <span className="text-xl font-bold">{selectedVolume.toLocaleString()} caminhões</span>
          </div>
          <div className="w-px h-8 bg-purple-400/30"></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200">Impacto Relativo</span>
            <span className="text-2xl font-black">{selectedPct}%</span>
          </div>
          <button onClick={() => setSelectedBars([])} className="ml-4 bg-black/20 hover:bg-black/40 p-2 rounded-full transition-colors border border-white/10">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col w-1/2">
          <h3 className="text-base font-black text-slate-200 uppercase tracking-widest">{title}</h3>
          <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Dica: Shift + Click nas barras para somar volumes
          </span>
        </div>
        <div className="flex items-center gap-4">
          {step !== undefined && onStepChange && (
            <div className="flex items-center gap-2 bg-[#020a14] border border-white/10 rounded-xl px-2 py-2 opacity-50 hover:opacity-100 transition-opacity focus-within:opacity-100 focus-within:border-purple-500/50">
              <span className="text-[10px] text-white/40 font-black uppercase tracking-widest pl-2" title="Tamanho do balde de agupamento">Lupa:</span>
              <select
                value={step}
                onChange={(e) => onStepChange(Number(e.target.value))}
                className="bg-transparent text-purple-400 font-bold outline-none text-xs cursor-pointer appearance-none"
              >
                <option value={2}>2h</option>
                <option value={3}>3h</option>
                <option value={4}>4h</option>
                <option value={6}>6h</option>
                <option value={12}>12h</option>
                <option value={24}>24h</option>
                <option value={48}>48h</option>
              </select>
              <ChevronDown size={14} className="text-purple-400 mr-2" />
            </div>
          )}
          <div className="flex items-center gap-2 bg-[#020a14] border border-white/10 rounded-xl px-4 py-2 opacity-50 hover:opacity-100 transition-opacity focus-within:opacity-100 focus-within:border-rose-500/50">
            <span className="text-[10px] text-white/40 font-black uppercase tracking-widest">Teto IQR:</span>
            <input
              type="number"
              className="bg-transparent text-rose-400 font-bold w-12 text-center outline-none text-xs"
              value={manualLimit.toFixed(0)}
              onChange={(e) => setManualLimit(Number(e.target.value))}
            />
            <span className="text-[10px] text-white/40 font-black">h</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-orange-500/10 rounded-xl border border-orange-500/20">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
            <span className="text-[10px] text-orange-400 font-black uppercase tracking-widest">Cauda Longa (Outlier)</span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative px-4">
        {/* Marcador de Linha de Anomalia */}
        <div
          className="absolute top-0 bottom-8 w-px border-l-2 border-dashed border-rose-500 z-10 pointer-events-none transition-all duration-300"
          style={{ left: `${linePercentage}%` }}
        >
          <div className="bg-rose-500 text-white text-[11px] font-black uppercase tracking-widest py-1.5 px-4 rounded-xl absolute -top-4 -translate-x-1/2 whitespace-nowrap shadow-[0_0_20px_rgba(244,63,94,0.6)]">
            Limite ({activeThreshold.toFixed(0)}h)
          </div>
        </div>

        <Bar
          data={{
            labels: data.map(d => d.label),
            datasets: [{
              data: data.map(d => d.volume),
              backgroundColor: backgroundColors,
              hoverBackgroundColor: hoverColors,
              borderColor: borderColors,
              borderWidth: 2,
              borderRadius: 6,
              barPercentage: 0.85
            }]
          }}
          options={chartOptions}
        />
      </div>
    </div>
  );
}

export function HiddenPatternTable({ data, onFilter, activeFilter }: { data: OutlierData['patterns'], onFilter?: (f: string) => void, activeFilter?: string }) {
  return (
    <div className="bg-[#031021] border border-orange-500/20 rounded-[40px] overflow-hidden shadow-2xl mt-4">
      <div className="p-10 border-b border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-orange-400 uppercase tracking-widest flex items-center gap-4">
            <AlertTriangle className="w-6 h-6" /> Matriz de Identificação de Padrões
          </h2>
          <p className="text-xs text-orange-500/60 font-black uppercase tracking-widest mt-2">Classificação de entidades penalizadoras pelo volume puro na cauda longa do histograma</p>
        </div>
        <div className="px-6 py-3 bg-[#0b121c] border border-orange-500/30 rounded-2xl shadow-inner">
          <span className="text-xs font-black text-orange-400 uppercase tracking-widest">Rankeado por Impacto IQR Excedente</span>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[800px] custom-scrollbar">
        <table className="w-full text-left bg-transparent block lg:table">
          <thead className="border-b border-white/5 sticky top-0 bg-[#031021] z-10 w-full hidden lg:table-header-group">
            <tr>
              <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Entidade Ofensora (Cliente/Origem)</th>
              <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Caminhões Movimentados</th>
              <th className="px-10 py-6 text-[11px] font-black text-orange-400 uppercase tracking-widest">Desvio Padrão (Cauda Longa Outlier)</th>
              <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Penalidade Média (Delta H)</th>
              <th className="px-10 py-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Diagnóstico da Causa Raiz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 w-full block lg:table-row-group">
            {data.map((row, i) => {
              const pct = (row.outlierVol / row.totalVol) * 100;
              const isActive = activeFilter === row.entityName;
              return (
                <tr
                  key={i}
                  className={`transition-all group w-full flex flex-col lg:table-row cursor-pointer ${isActive ? 'bg-orange-500/10 border-l-4 border-orange-500' : 'hover:bg-white/5 border-l-4 border-transparent'}`}
                  onClick={() => onFilter && onFilter(isActive ? '' : row.entityName)}
                >
                  <td className="px-10 py-8 lg:py-6">
                    <span className="font-bold text-[15px] text-white uppercase">{row.entityName}</span>
                  </td>
                  <td className="px-10 lg:py-6 pb-2 lg:pb-6 text-[15px] font-mono font-bold text-slate-400 hidden lg:table-cell">
                    {row.totalVol.toLocaleString()} Viagens
                  </td>
                  <td className="px-10 lg:py-6 pb-2 lg:pb-6 block lg:table-cell">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-14 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center font-mono font-black text-orange-400 text-xl shadow-inner">
                        {row.outlierVol}
                      </div>
                      <div>
                        <div className="h-2 w-48 bg-white/5 rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-orange-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-[#cbd5e1] uppercase font-bold tracking-widest">{pct.toFixed(0)}% da operação fora dos limites</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 lg:py-6 pb-2 lg:pb-6 block lg:table-cell">
                    <span className="text-sm font-black text-rose-400 py-2 px-4 bg-rose-500/10 border border-rose-500/20 rounded-xl shadow-sm">+{row.outlierAvgTime}h de Delay Médio</span>
                  </td>
                  <td className="px-10 lg:py-6 pb-8 lg:pb-6 block lg:table-cell">
                    <div className="inline-flex items-center gap-3 bg-[#081523] border border-white/10 px-5 py-3 rounded-xl group-hover:border-white/20 transition-all shadow-md">
                      <AlertTriangle className="w-5 h-5 text-rose-500" />
                      <span className="text-[11px] font-black text-[#cbd5e1] uppercase tracking-[0.2em]">{row.rootCauseBadge}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
