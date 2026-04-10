'use client';

import {
  Chart as ChartJS,
  type ChartOptions,
  LinearScale,
  CategoryScale,
  BarElement,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
  Filler,
  BarController,
  LineController
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, BarChart3 } from 'lucide-react';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  BarController,
  LineController,
  Legend,
  Tooltip,
  Filler,
  ChartDataLabels
);

interface TrendItem {
  day: string;
  volume: number;
  avg_cycle: number;
}

export function PlazaTrendChart({ terminal, origem }: { terminal: string, origem?: string }) {
  const [data, setData] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = `/api/pac/plaza-trend?terminal=${terminal}${origem ? `&origem=${encodeURIComponent(origem)}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setData(json.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [terminal, origem]);

  // Format labels to show only Day (ex: "10")
  const labels = data.map(d => d.day.split('-')[2]);

  const chartData = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Ciclo Médio (h)',
        data: data.map(d => d.avg_cycle),
        borderColor: '#14b8a6', // Teal 500
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#14b8a6',
        pointRadius: 4,
        tension: 0.3,
        yAxisID: 'y1',
        fill: true,
        datalabels: {
          display: true,
          align: 'top' as const,
          color: '#14b8a6',
          font: { weight: 'bold' as const, size: 12 },
          formatter: (v: number) => v.toFixed(1)
        }
      },
      {
        type: 'bar' as const,
        label: 'Vol. Descargas',
        data: data.map(d => d.volume),
        backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue 500
        borderColor: '#3b82f6',
        borderWidth: 1,
        yAxisID: 'y',
        datalabels: {
          display: true,
          align: 'bottom' as const,
          color: '#ffffff',
          font: { size: 10 },
          formatter: (v: number) => v > 0 ? v : ''
        }
      }
    ]
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#ffffff', boxWidth: 12, font: { size: 12 } }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
      datalabels: {
        clip: false
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: '#888' },
        title: { display: true, text: 'Veículos', color: '#666' }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: { color: '#14b8a6' },
        title: { display: true, text: 'Horas (h)', color: '#14b8a6' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#888' }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl p-6 flex flex-col h-screen w-full select-none">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/20 rounded-lg">
            <TrendingUp className="w-6 h-6 text-teal-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white uppercase tracking-tight">
              Tendência Operacional (MTD)
            </h1>
            <p className="text-sm text-gray-500 uppercase tracking-widest">
              {origem || 'Terminal Total (TRO)'} • Ciclo Médio vs Volume
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono uppercase text-gray-400">
           <div className="flex items-center gap-2">
             <div className="w-3 h-3 bg-blue-500/50 border border-blue-500 rounded-sm"></div>
             <span>Volume</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-3 h-3 bg-teal-500"></div>
             <span>Ciclo (h)</span>
           </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Chart type="bar" data={chartData} options={options} />
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center text-[10px] text-gray-600 uppercase tracking-widest">
        <span>PAC Mission Control | Rumo Logistics</span>
        <span>Mês: {new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</span>
      </div>
    </div>
  );
}
