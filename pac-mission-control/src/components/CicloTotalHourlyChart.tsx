'use client';

import {
  Chart as ChartJS,
  type ChartOptions,
  type TooltipItem
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useEffect, useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import CicloHourlyDiagnosticsDrawer from './CicloHourlyDiagnosticsDrawer';
import { registerCharts } from '@/lib/chart-init';

// Initialized via central function inside the component

interface CondensedHourlyItem {
  h: number; // 0..23
  p50: number;
  p90: number;
  avg: number; // Matches backend "avg_val" mapped to "avg"
  vol: number;
}

export function CicloTotalHourlyChart({ terminal, produto, praca, refreshKey }: { terminal: string, produto?: string, praca?: string, refreshKey?: number }) {
  registerCharts();
  const [data, setData] = useState<CondensedHourlyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
        const prodParam = produto ? `&produto=${encodeURIComponent(produto)}` : '';
        const pracaParam = praca ? `&praca=${encodeURIComponent(praca)}` : '';
        const res = await fetch(`/api/pac/ciclo-hourly?terminal=${terminal}${prodParam}${pracaParam}`);
        if(res.ok) {
            const json = await res.json();
            if (Array.isArray(json)) {
                setData(json);
            } else if (json && Array.isArray(json.data)) {
                setData(json.data);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(data.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, produto, praca, refreshKey]);


  const chartData = {
    labels: Array.from({length: 24}, (_, i) => `${i}h`),
    datasets: [
      {
        label: 'Média Ciclo (h)',
        data: data.map(d => d.avg), // Using AVG
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        datalabels: {
          display: (context: any) => {
            const val = context.dataset.data[context.dataIndex];
            return typeof val === 'number' && val > 0;
          },
          align: 'center' as const,
          anchor: 'center' as const,
          color: '#ffffff',
          font: {
            size: 14,
            weight: 'bold' as const
          },
          formatter: (value: number) => value > 0 ? value.toFixed(1) : ''
        }
      }
    ]
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (elements.length > 0 && data) {
         const index = elements[0].index;
         const item = data[index];
         if (item && item.vol > 0) {
             setSelectedHour(item.h);
         }
      }
    },
    plugins: {
      legend: {
         display: false
      },
      datalabels: {
        // Global datalabels config
      },
      tooltip: {
         callbacks: {
            label: (context: TooltipItem<'bar'>) => {
                const idx = context.dataIndex;
                const item = data[idx];
                return [
                    `Média: ${item.avg.toFixed(1)}h`,
                    `Vol: ${item.vol} veíc.`,
                    `P90: ${item.p90 ? item.p90.toFixed(1) : '-'}h`,
                    `(Clique para ver o diagnóstico raiz)`
                ];
            }
         }
      }
    },
    scales: {
        y: {
            beginAtZero: true,
            grid: { color: '#333' },
            ticks: { color: '#888' },
            title: { display: true, text: 'Horas (h)', color: '#666' }
        },
        x: {
            grid: { display: false },
            ticks: { color: '#888', font: { size: 10 } }
        }
    }
  };

  return (
    <div className="bg-gray-900/20 border border-gray-800 rounded-xl p-4 flex flex-col h-[280px] w-full relative">
       <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" />
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-white/95 uppercase tracking-widest">
                       Ciclo Total por Hora (D)
                    </span>
                    <span className="text-[9px] text-white/50 uppercase tracking-wider">
                       Média do ciclo total (h) por hora - finalizados
                    </span>
                </div>
            </div>
            {loading && <Loader2 className="w-4 h-4 text-white/30 animate-spin" />}
       </div>

       <div className="flex-1 min-h-0">
          <Bar data={chartData} options={options} />
       </div>

       <CicloHourlyDiagnosticsDrawer 
          open={selectedHour !== null}
          onClose={() => setSelectedHour(null)}
          hour={selectedHour}
          terminal={terminal}
          produto={produto}
          praca={praca}
       />
    </div>
  );
}
