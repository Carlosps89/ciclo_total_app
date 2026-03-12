import React, { useState } from 'react';
import { Zap, AlertTriangle, Crosshair, Filter, Activity, MapPin } from 'lucide-react';
import { Bar } from 'react-chartjs-2';

export interface SystemicData {
  simulation: {
    real_avg: number;
    scenario_a: number;
    scenario_b: number;
  };
  histograms: {
    emissao_vs_janela: { bucket: string; count: number }[];
    agendamento_vs_janela: { bucket: string; count: number }[];
  }
  anomalies: {
    entity: string;
    total_trips: number;
    violations: number;
    violation_pct: number;
    avg_excess_hours: number;
  }[];
}

export function WhatIfSimulator({ data, onApplyScenario }: { data: SystemicData['simulation'], onApplyScenario?: (scenario: string) => void }) {
  const [activeScenario, setActiveScenario] = useState<string>('real');
  
  const handleScenarioClick = (scenario: string) => {
    setActiveScenario(scenario);
    if (onApplyScenario) onApplyScenario(scenario);
  };

  return (
    <div className="bg-[#020813] border border-blue-500/20 rounded-[32px] p-8 relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-black text-white uppercase flex items-center gap-3">
            <Zap className="text-blue-400" /> Simulador de Eficiência Sistêmica
          </h3>
          <p className="text-xs text-white/40 uppercase tracking-widest mt-1">Impacto financeiro e temporal da correção de anomalias administrativas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => handleScenarioClick('real')}
          className={`bg-white/5 border p-6 rounded-2xl cursor-pointer transition-all ${activeScenario === 'real' ? 'border-white/40 ring-2 ring-white/10' : 'border-white/10 opacity-70 hover:opacity-100 hover:border-white/20'}`}
        >
          <span className="text-[10px] text-white/50 uppercase font-black tracking-widest block mb-4">Baseline Real</span>
          <div className="flex items-baseline gap-1">
             <div className="text-5xl font-black text-white">{data.real_avg}</div>
             <div className="text-xl font-bold text-white/40">h</div>
          </div>
          <p className="text-[9px] text-white/30 uppercase mt-4 font-bold">Ciclo Total Médio Global</p>
        </div>

        <div 
          onClick={() => handleScenarioClick('scenario_a')}
          className={`bg-emerald-500/5 border p-6 rounded-2xl group transition-all cursor-pointer ${activeScenario === 'scenario_a' ? 'border-emerald-500/50 ring-2 ring-emerald-500/20' : 'border-emerald-500/20 opacity-70 hover:opacity-100 hover:bg-emerald-500/10'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] text-emerald-400 uppercase font-black tracking-widest">Cenário A: Filtro de Outliers</span>
            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md">-{ (data.real_avg - data.scenario_a).toFixed(1) }h</span>
          </div>
          <div className="flex items-baseline gap-1">
             <div className="text-5xl font-black text-emerald-300">{data.scenario_a}</div>
             <div className="text-xl font-bold text-emerald-500/40">h</div>
          </div>
          <p className="text-[9px] text-white/30 uppercase mt-4">Simulação excluso o Top 10% (P90) piores tempos</p>
        </div>

        <div 
          onClick={() => handleScenarioClick('scenario_b')}
          className={`bg-blue-500/5 border p-6 rounded-2xl group transition-all cursor-pointer ${activeScenario === 'scenario_b' ? 'border-blue-500/50 ring-2 ring-blue-500/20' : 'border-blue-500/20 opacity-70 hover:opacity-100 hover:bg-blue-500/10'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] text-blue-400 uppercase font-black tracking-widest">Cenário B: Nivelamento P25</span>
            <span className="text-xs font-bold bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md">-{ (data.real_avg - data.scenario_b).toFixed(1) }h</span>
          </div>
          <div className="flex items-baseline gap-1">
             <div className="text-5xl font-black text-blue-300">{data.scenario_b}</div>
             <div className="text-xl font-bold text-blue-500/40">h</div>
          </div>
          <p className="text-[9px] text-white/30 uppercase mt-4">Simulação nivelando atrasados ao 1º Quartil (Target)</p>
        </div>
      </div>
    </div>
  );
}

export function DistributionCharts({ histograms }: { histograms: SystemicData['histograms'] }) {
  const getChartData = (dataPoints: { bucket: string; count: number }[], color: string) => {
    return {
      labels: dataPoints.map(d => d.bucket),
      datasets: [
        {
          label: 'Veículos',
          data: dataPoints.map(d => d.count),
          backgroundColor: dataPoints.map(d => d.bucket === '>72h' || d.bucket === '48-72h' ? '#ef4444' : color),
          borderRadius: 4,
          barPercentage: 0.7
        }
      ]
    };
  };

  const chartOptions: any = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#02132b', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
      y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[320px]">
      <div className="bg-[#0b1018] border border-white/5 rounded-[2.5rem] p-8 flex flex-col">
        <h4 className="text-xs text-white/60 font-black uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Distância: Emissão NF vs Janela Agendamento
        </h4>
        <div className="flex-1 min-h-0 relative">
            <div className="absolute top-0 right-4 flex items-center gap-2 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 z-10">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">SLA Violação &gt; 72h</span>
            </div>
            <Bar data={getChartData(histograms.emissao_vs_janela, '#10b981')} options={chartOptions} />
        </div>
      </div>

      <div className="bg-[#0b1018] border border-white/5 rounded-[2.5rem] p-8 flex flex-col">
        <h4 className="text-xs text-white/60 font-black uppercase tracking-widest mb-6 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-blue-400" />
            Distância: Criação Agendamento vs Janela Real
        </h4>
        <div className="flex-1 min-h-0 relative">
             <div className="absolute top-0 right-4 flex items-center gap-2 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 z-10">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">SLA Violação &gt; 72h</span>
            </div>
            <Bar data={getChartData(histograms.agendamento_vs_janela, '#3b82f6')} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}

export function RuleBreakersTable({ anomalies }: { anomalies: SystemicData['anomalies'] }) {
  return (
    <div className="bg-[#02132b] rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
      <div className="p-8 bg-gradient-to-r from-rose-500/10 to-transparent border-b border-rose-500/10 flex items-center justify-between">
         <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20">
                 <AlertTriangle className="w-6 h-6 text-rose-500" />
             </div>
             <div>
                <h3 className="text-lg font-black text-rose-400 uppercase tracking-widest">Radar de Anomalias Administrativas</h3>
                <p className="text-[10px] text-rose-500/50 font-bold uppercase tracking-widest mt-1">SLA Rule-Breakers (Faturamento e Agendamento Precoce &gt; 72h)</p>
             </div>
         </div>
      </div>
      <div className="overflow-x-auto max-h-[500px] custom-scrollbar pb-10">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#02132b] z-10 border-b border-white/5">
            <tr>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Origem / Cliente Faturado</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Volume (Viagens)</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Proporção de Violação (&gt;72h Antecedência)</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Penalidade Média Absoluta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {anomalies.map((anom, idx) => {
              const isCritical = anom.violation_pct > 30;
              return (
                <tr key={idx} className="hover:bg-white/2 transition-colors group">
                  <td className="px-8 py-6">
                     <div className="flex items-center gap-3">
                         <MapPin className={`w-4 h-4 ${isCritical ? 'text-rose-500' : 'text-slate-500'} bg-white/5 p-1 rounded box-content`} />
                         <span className="font-bold text-sm text-white uppercase">{anom.entity}</span>
                     </div>
                  </td>
                  <td className="px-8 py-6 font-mono text-slate-400 text-sm">{anom.total_trips}</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-48 h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className={`h-full transition-all duration-1000 ${isCritical ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : 'bg-orange-500'}`} 
                          style={{ width: `${Math.min(anom.violation_pct, 100)}%` }} 
                        />
                      </div>
                      <span className={`text-xs font-black ${isCritical ? 'text-rose-400' : 'text-orange-400'}`}>
                          {anom.violation_pct}% ({anom.violations} v.)
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                      <span className={`text-xs font-black py-1.5 px-3 rounded-lg bg-black/40 border border-white/5 ${isCritical ? 'text-rose-400 border-rose-500/20' : 'text-slate-400'}`}>
                          +{anom.avg_excess_hours}h Excedentes
                      </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
