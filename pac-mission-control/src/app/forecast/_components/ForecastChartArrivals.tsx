'use client';

import React from 'react';
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
  Filler
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

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

interface Props {
  hours: string[];
  programmed: number[];
  predicted: number[];
  totals: {
    programmed_total: number;
    predicted_total: number;
  };
  dateLabel: string;
  onBarClick: (index: number) => void;
}

export function ForecastChartArrivals({ hours, programmed, predicted, totals, dateLabel, onBarClick }: Props) {

  const data = {
    labels: hours.map(h => `${h}h`),
    datasets: [
      {
        type: 'line' as const,
        label: 'Projetado (Linear)',
        data: predicted,
        borderColor: '#a855f7', // Purple 500
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.4, // Smooth curve
        fill: false,
        yAxisID: 'y',
        order: 1,
        datalabels: {
          display: (context: any) => (context.dataset.data[context.dataIndex] || 0) > 0,
          align: 'top' as const,
          anchor: 'end' as const,
          color: '#a855f7',
          font: { size: 9, weight: 'bold' as const },
          formatter: (value: number) => value > 0 ? value.toFixed(0) : ''
        }
      },
      {
        type: 'bar' as const,
        label: 'Programado',
        data: programmed,
        backgroundColor: (context: any) => {
           const ctx = context.chart.ctx;
           const gradient = ctx.createLinearGradient(0, 0, 0, 300);
           gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // Blue 500
           gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');
           return gradient;
        },
        borderColor: 'rgba(59, 130, 246, 0.5)',
        borderWidth: 1,
        hoverBackgroundColor: 'rgba(59, 130, 246, 0.7)',
        yAxisID: 'y',
        order: 2,
        datalabels: {
          display: (context: any) => (context.dataset.data[context.dataIndex] || 0) > 0,
          align: 'bottom' as const,
          anchor: 'end' as const,
          color: 'rgba(59, 130, 246, 0.8)',
          offset: 2,
          font: { size: 9, weight: 'bold' as const },
          formatter: (value: number) => value > 0 ? value.toFixed(0) : ''
        }
      }
    ]
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          color: '#e5e7eb', // gray-200
          font: {
            size: 11,
            family: 'Inter, sans-serif',
            weight: 'bold'
          },
          usePointStyle: true,
          boxWidth: 8
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
            title: (items: any[]) => {
                if (!items.length) return '';
                const idx = items[0].dataIndex;
                const h = hours[idx];
                return `${h}h (${dateLabel})`;
            }
        }
      }
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
          borderDash: [2, 4]
        },
        ticks: {
          color: '#9ca3af',
          font: { size: 10 }
        },
        beginAtZero: true
      },
      x: {
        grid: {
          color: 'rgba(75, 85, 99, 0.1)'
        },
        ticks: {
          color: '#9ca3af',
          font: { size: 10 }
        }
      }
    },
    onClick: (evt: any, elements: any[]) => {
        if (elements && elements.length > 0) {
            const index = elements[0].index;
            onBarClick(index);
        }
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-between items-center mb-4 px-2 shrink-0">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
             CHEGADAS ({dateLabel})
          </h2>
          <div className="flex gap-3">
             <div className="bg-blue-900/40 border border-blue-500/30 px-3 py-1 rounded text-center min-w-[80px]">
                 <span className="block text-[9px] text-blue-300 uppercase font-bold tracking-wider">Programado</span>
                 <span className="text-sm font-bold text-white">{totals.programmed_total}</span>
             </div>
             <div className="bg-purple-900/40 border border-purple-500/30 px-3 py-1 rounded text-center min-w-[80px] relative group">
                 <span className="block text-[9px] text-purple-300 uppercase font-bold tracking-wider">Projetado</span>
                 <div className="flex items-center justify-center gap-1">
                    <span className="text-sm font-bold text-white">{totals.predicted_total}</span>
                    {totals.predicted_total !== totals.programmed_total && (
                        <span className="text-[9px] text-gray-400 font-normal opacity-70">
                           {totals.predicted_total > totals.programmed_total ? '+' : ''}
                           {totals.predicted_total - totals.programmed_total}
                        </span>
                    )}
                 </div>
                 {/* Tooltip for spillover explanation */}
                 {totals.predicted_total !== totals.programmed_total && (
                     <div className="absolute top-full right-0 mt-1 w-48 bg-black/90 border border-gray-700 text-[10px] p-2 rounded shadow-xl z-50 hidden group-hover:block text-gray-300 leading-tight">
                        O volume total difere porque parte da carga foi antecipada para o dia anterior ou recebida do dia seguinte.
                     </div>
                 )}
             </div>
          </div>
      </div>
      <div className="flex-1 w-full min-h-0 relative">
          <Chart type='bar' data={data} options={options} />
      </div>
    </div>
  );
}
