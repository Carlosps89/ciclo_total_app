'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  Filler
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { useEffect, useState, useCallback } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

interface TrendItem {
  day: string;
  ciclo_medio: number;
  volume: number;
}

interface HistoricalTrendData {
  startDate: string;
  endDate: string;
  data: TrendItem[];
}

export function HistoricalTrendChart({ 
  terminal, 
  startDate, 
  endDate, 
  produto, 
  praca 
}: { 
  terminal: string, 
  startDate: string, 
  endDate: string, 
  produto?: string, 
  praca?: string 
}) {
  const [data, setData] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
        const pParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
        const prParam = praca ? `&praca=${encodeURIComponent(praca)}` : '';
        const res = await fetch(`/api/pac/historico/trend?terminal=${terminal}&startDate=${startDate}&endDate=${endDate}${pParam}${prParam}`);
        if(res.ok) {
            const json: HistoricalTrendData = await res.json();
            setData(json.data);
        }
    } catch(e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  }, [terminal, startDate, endDate, produto, praca]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = {
    labels: (data || []).map(d => {
        if (!d?.day) return '';
        try {
            const parts = d.day.split('-');
            if (parts.length < 3) return d.day;
            const [, m, day] = parts;
            return `${day}/${m}`;
        } catch { return d.day || ''; }
    }),
    datasets: [
      {
        label: 'Média Ciclo (h)',
        data: data.map(i => i.ciclo_medio),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        yAxisID: 'y',
        type: 'line' as const,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#10b981',
        pointBorderWidth: 2,
        datalabels: {
          display: true,
          align: 'top' as const,
          anchor: 'end' as const,
          color: '#10b981',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (value: number) => {
            if (value === null || value === undefined) return '';
            try {
              return `${Number(value).toFixed(1)}h`;
            } catch { return `${value}h`; }
          },
          padding: 4,
          offset: 2
        }
      },
      {
        label: 'Volume (veíc.)',
        data: data.map(i => i.volume),
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        yAxisID: 'y1',
        type: 'bar' as const,
        barThickness: 30,
        datalabels: {
          display: true,
          align: 'top' as const,
          anchor: 'start' as const,
          color: '#ffffff',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (value: number) => value.toString(),
          padding: 4,
          offset: 2
        }
      },
    ],
  };

  const options: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        left: 8,
        top: 20 // Extra space for top labels
      }
    },
    plugins: {
      datalabels: {
        display: false // Turned off globally, enabled per dataset
      },
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: 'rgba(255, 255, 255, 0.7)',
          font: { size: 10, weight: 'bold' as const },
          usePointStyle: true,
          pointStyle: 'rectRounded',
          padding: 15
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(5, 5, 5, 0.95)',
        titleColor: '#fff',
        titleFont: { size: 12, weight: 'bold' },
        bodyColor: '#ccc',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
            label: (context: { dataset: { label?: string }; parsed: { y: number | null }; datasetIndex: number }) => {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                    label += context.parsed.y + (context.datasetIndex === 0 ? 'h' : ' veíc.');
                }
                return label;
            }
        }
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        afterFit: (scale) => {
           scale.width = 48; // Force width to match Heatmap's Hour column (w-12 = 48px)
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { 
          color: 'rgba(255, 255, 255, 0.9)', // High contrast white
          font: { size: 10, weight: 'bold' },
          callback: (value) => `${value}h`
        },
        title: { display: false }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: { 
          color: '#3b82f6', // Brighter blue
          font: { size: 10, weight: 'bold' }
        },
        title: { display: false }
      },
      x: {
        grid: { display: false },
        ticks: { 
          color: 'rgba(255, 255, 255, 0.9)', // High contrast white
          font: { size: 10, weight: 'bold', family: 'monospace' }, 
          maxRotation: 0,
          padding: 10
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-900/20 p-4 rounded-xl border border-gray-800/50 flex flex-col">
       <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <h3 className="text-[10px] uppercase font-bold text-white tracking-[0.2em]">
            Ciclo x Volume
          </h3>
       </div>
       <div className="flex-1 min-h-0">
         <Chart type="bar" data={chartData} options={options} />
       </div>
    </div>
  );
}
