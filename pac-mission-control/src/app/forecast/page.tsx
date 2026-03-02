"use client";

import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ForecastDataItem {
  hour: string;
  avg_cycle_h: number;
  truck_count: number;
}

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ForecastContent() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';
  const [data, setData] = useState<ForecastDataItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/pac/forecast?terminal=${terminal}`)
      .then(res => res.json())
      .then(json => {
        setData(json.forecast || []);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, [terminal]);

  const chartData = {
    labels: data.map(d => {
      const date = new Date(d.hour);
      const h = date.getHours().toString().padStart(2, '0');
      const dLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      return `${h}h (${dLabel})`;
    }),
    datasets: [
      {
        label: 'Ciclo Projetado (h)',
        data: data.map(d => d.avg_cycle_h),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#3b82f6'
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: { parsed: { y: number | null } }) => `Ciclo: ${(context.parsed.y ?? 0).toFixed(1)}h`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: '#94a3b8' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#010b1a] p-8 text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Projected Cycle Recovery</h1>
            <p className="text-slate-400 mt-2">Tendência do ciclo baseada na carga atual do pátio e médias históricas.</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <span className="block text-xs uppercase text-blue-400 font-bold mb-1">Carga Monitorada</span>
            <span className="text-2xl font-bold">{data.reduce((acc, curr) => acc + curr.truck_count, 0)} Caminhões</span>
          </div>
        </div>

        <div className="bg-[#02132b] rounded-2xl border border-white/5 p-6 h-[500px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : data.length > 0 ? (
            <Line data={chartData} options={options} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <p className="text-xl">Nenhum caminhão ativo para projeção.</p>
              <p className="text-sm">Os dados aparecem conforme caminhões entram no fluxo &quot;CHEGUEI&quot;.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-[#02132b] p-6 rounded-2xl border border-white/5">
                <h3 className="text-slate-400 text-sm font-medium mb-4 uppercase tracking-wider">Metodologia</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                    Calculamos o tempo já decorrido desde a emissão e somamos a média histórica das etapas restantes (Viagem/Interno) para projetar a curva de recuperação.
                </p>
            </div>
            <div className="bg-[#02132b] p-6 rounded-2xl border border-white/5">
                <h3 className="text-slate-400 text-sm font-medium mb-4 uppercase tracking-wider">Próximos Passos</h3>
                <ol className="text-xs text-slate-300 list-decimal list-inside space-y-2">
                    <li>Segregar previsões por Origem</li>
                    <li>Utilizar Percentis (P25/P75) dinâmicos</li>
                    <li>Filtro avançado por Categoria de Produto</li>
                </ol>
            </div>
            <div className="bg-[#02132b] p-6 rounded-2xl border border-white/5 flex flex-col justify-center items-center">
                <button 
                  onClick={() => window.location.href = `/?terminal=${terminal}`}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20"
                >
                    Voltar para Cockpit
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#010b1a] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
      <ForecastContent />
    </Suspense>
  );
}
