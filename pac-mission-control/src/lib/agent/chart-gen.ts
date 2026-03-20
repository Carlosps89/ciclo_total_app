import QuickChart from 'quickchart-js';

export async function generateChartBuffer(type: string, data: { headers: string[], rows: any[][] }): Promise<Buffer> {
  const chart = new QuickChart();

  // Basic color palette from project rules
  const colors = {
    emerald: '#10b981',
    sky: '#0ea5e9',
    amber: '#f59e0b',
    blue: '#3b82f6',
    slate: '#64748b'
  };

  const labels = data.rows.map(row => row[0]); // Usually the first column
  const values = data.rows.map(row => parseFloat(row[1] || '0')); // Usually the second column

  const chartConfig: any = {
    type: type === 'histogram' ? 'bar' : type,
    data: {
      labels: labels.slice(0, 15), // Limit to top 15 for readability
      datasets: [{
        label: data.headers[1] || 'Valor',
        data: values.slice(0, 15),
        backgroundColor: colors.blue,
        borderColor: colors.blue,
        borderWidth: 1
      }]
    },
    options: {
      title: {
        display: true,
        text: `Análise de ${data.headers[1] || 'Dados'}`
      },
      plugins: {
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#fff',
          backgroundColor: 'rgba(34, 34, 34, 0.6)',
          borderRadius: 3,
        }
      }
    }
  };

  // Dark mode styling as per project rules
  chartConfig.options.scales = {
    yAxes: [{ gridLines: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { fontColor: '#fff' } }],
    xAxes: [{ gridLines: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { fontColor: '#fff' } }]
  };
  chart.setBackgroundColor('#010b1a');

  chart.setConfig(chartConfig);
  chart.setWidth(800);
  chart.setHeight(400);

  return await chart.toBinary();
}
