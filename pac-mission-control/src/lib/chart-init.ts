'use client';

import { Chart as ChartJS, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

let registered = false;

export function registerCharts() {
  if (registered) return;
  
  ChartJS.register(...registerables, ChartDataLabels);
  
  registered = true;
}
