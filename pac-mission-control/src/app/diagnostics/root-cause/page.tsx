"use client";

import React, { useState, useEffect, Suspense } from 'react';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend
} from 'chart.js';
import { useSearchParams } from 'next/navigation';
import { GlobalOutlierHeader, CycleSimulator, StageHistogram, HiddenPatternTable, OutlierData } from '@/components/OutliersDashboard';
import OutlierDrilldownModal from '@/components/OutlierDrilldownModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function RCADashboardContent() {
  const searchParams = useSearchParams();
  const terminal = searchParams.get('terminal') || 'TRO';

  const dtNow = new Date();
  const dtMinus7 = new Date();
  dtMinus7.setDate(dtNow.getDate() - 7);

  const defaultStart = dtMinus7.toISOString().split('T')[0];
  const defaultEnd = dtNow.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(searchParams.get('startDate') || defaultStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || defaultEnd);

  // Advanced Customization States (Iteration 6)
  const [iqrMultiplier, setIqrMultiplier] = useState<number>(1.5);
  const [manualLimits, setManualLimits] = useState<{ emissao: number, agendamento: number, viagem: number, verde: number, interno: number }>({
    emissao: 0, agendamento: 0, viagem: 0, verde: 0, interno: 0
  });
  const [offenderFilter, setOffenderFilter] = useState<string>('');
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [histogramSteps, setHistogramSteps] = useState<{ emissao: number, agendamento: number, viagem: number, verde: number, interno: number }>({
    emissao: 24, agendamento: 24, viagem: 24, verde: 24, interno: 12
  });

  // Load Whitelist from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('@pac:whitelist');
      if (stored) {
        setWhitelist(JSON.parse(stored));
      }
    } catch (e) { console.error('Error loading whitelist', e); }
  }, []);

  const handleIgnoreGmo = (gmo: string) => {
    setWhitelist(prev => {
      const newLst = [...prev, gmo];
      localStorage.setItem('@pac:whitelist', JSON.stringify(newLst));
      return newLst;
    });
  };

  const [outlierData, setOutlierData] = useState<OutlierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [drilldown, setDrilldown] = useState<{
    isOpen: boolean;
    stageId: string;
    stageName: string;
    minHours: number;
    maxHours: number | null;
  }>({
    isOpen: false, stageId: '', stageName: '', minHours: 0, maxHours: null
  });

  const handleBarClick = (stageId: string, stageName: string, bucket: { minHours: number, maxHours: number | null }) => {
    setDrilldown({
      isOpen: true,
      stageId,
      stageName,
      minHours: bucket.minHours,
      maxHours: bucket.maxHours,
    });
  };

  useEffect(() => {
    setLoading(true);

    const qs = new URLSearchParams();
    qs.append('terminal', terminal);
    qs.append('startDate', startDate);
    qs.append('endDate', endDate);
    qs.append('iqrMultiplier', iqrMultiplier.toString());
    if (manualLimits.emissao > 0) qs.append('overrideEmissao', manualLimits.emissao.toString());
    if (manualLimits.agendamento > 0) qs.append('overrideAgendamento', manualLimits.agendamento.toString());
    if (manualLimits.viagem > 0) qs.append('overrideViagem', manualLimits.viagem.toString());
    if (manualLimits.verde > 0) qs.append('overrideVerde', manualLimits.verde.toString());
    if (manualLimits.interno > 0) qs.append('overrideInterno', manualLimits.interno.toString());
    if (offenderFilter) qs.append('offenderFilter', offenderFilter);
    if (whitelist.length > 0) qs.append('whitelist', whitelist.join(','));

    // Dynamic Histograms Granularity
    qs.append('stepEmissao', histogramSteps.emissao.toString());
    qs.append('stepAgendamento', histogramSteps.agendamento.toString());
    qs.append('stepViagem', histogramSteps.viagem.toString());
    qs.append('stepVerde', histogramSteps.verde.toString());
    qs.append('stepInterno', histogramSteps.interno.toString());

    fetch(`/api/pac/diagnostics/outliers-engine?${qs.toString()}`)
      .then(res => res.json())
      .then(outlierJson => {
        setOutlierData(outlierJson);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [terminal, startDate, endDate, iqrMultiplier, manualLimits, offenderFilter, whitelist, histogramSteps]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await fetch(`/api/pac/diagnostics/root-cause/export?terminal=${terminal}&startDate=${startDate}&endDate=${endDate}`);
      const json = await res.json();

      const ws = XLSX.utils.json_to_sheet(json.vehicles);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Veículos Análise");
      XLSX.writeFile(wb, `Outliers_Export_${terminal}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  if (loading && !outlierData) {
    return (
      <div className="min-h-screen bg-[#010b1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-rose-500"></div>
          <span className="text-slate-500 font-mono tracking-widest animate-pulse uppercase text-xs font-bold">Calculando IQR Escala Total (Athena)...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#010b1a] text-white font-sans flex flex-col p-4 md:p-8 gap-8 overflow-y-auto overflow-x-hidden custom-scrollbar relative">
      <style jsx global>{`
        body { margin: 0; } 
        /* Previne rolagem dupla no desktop, mas mantem a rolagem deste container */
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}</style>

      {outlierData && (
        <>
          <GlobalOutlierHeader
            terminal={terminal}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            exporting={exporting}
            onExport={handleExport}
            iqr={iqrMultiplier}
            setIqr={setIqrMultiplier}
            limits={manualLimits}
            setLimits={setManualLimits}
          />
          <CycleSimulator simulation={outlierData.simulation} offenderFilter={offenderFilter} clearFilter={() => setOffenderFilter('')} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            <StageHistogram
              title="Emissão x Agendamento (Faturamento Precoce)"
              data={outlierData.histograms.emissao}
              outlierThreshold={outlierData.thresholds.emissao}
              onBarClick={(bucket) => handleBarClick('emissao_agendamento', 'Emissão x Agendamento (Faturamento Precoce)', bucket)}
              step={histogramSteps.emissao}
              onStepChange={(val) => setHistogramSteps(p => ({ ...p, emissao: val }))}
            />
            <StageHistogram
              title="Agendamento x Janela (Viagem Fantasma)"
              data={outlierData.histograms.agendamento}
              outlierThreshold={outlierData.thresholds.agendamento}
              onBarClick={(bucket) => handleBarClick('agendamento_janela', 'Agendamento x Janela (Viagem Fantasma)', bucket)}
              step={histogramSteps.agendamento}
              onStepChange={(val) => setHistogramSteps(p => ({ ...p, agendamento: val }))}
            />
            <StageHistogram
              title="Tempo de Viagem Total (Estrada + Espera)"
              data={outlierData.histograms.viagem}
              outlierThreshold={outlierData.thresholds.viagem}
              onBarClick={(bucket) => handleBarClick('viagem', 'Tempo de Viagem Total (Estrada + Espera)', bucket)}
              step={histogramSteps.viagem}
              onStepChange={(val) => setHistogramSteps(p => ({ ...p, viagem: val }))}
            />
            <StageHistogram
              title="Tempo em Área Verde (Triagem Física)"
              data={outlierData.histograms.verde}
              outlierThreshold={outlierData.thresholds.verde}
              onBarClick={(bucket) => handleBarClick('verde', 'Tempo em Área Verde (Triagem Física)', bucket)}
              step={histogramSteps.verde}
              onStepChange={(val) => setHistogramSteps(p => ({ ...p, verde: val }))}
            />
            <StageHistogram
              title="Tempo Interno (Operação de Terminal)"
              data={outlierData.histograms.interno}
              outlierThreshold={outlierData.thresholds.interno}
              onBarClick={(bucket) => handleBarClick('interno', 'Tempo Interno (Operação de Terminal)', bucket)}
              step={histogramSteps.interno}
              onStepChange={(val) => setHistogramSteps(p => ({ ...p, interno: val }))}
            />
          </div>
          <HiddenPatternTable data={outlierData.patterns} onFilter={setOffenderFilter} activeFilter={offenderFilter} />

          <OutlierDrilldownModal
            isOpen={drilldown.isOpen}
            onClose={() => setDrilldown(prev => ({ ...prev, isOpen: false }))}
            terminal={terminal}
            startDate={startDate}
            endDate={endDate}
            praca={searchParams.get('praca') || 'TODAS'}
            produto={searchParams.get('produto') || ''}
            stageId={drilldown.stageId}
            stageName={drilldown.stageName}
            minHours={drilldown.minHours}
            maxHours={drilldown.maxHours}
          />
        </>
      )
      }
    </div >
  );
}

export default function RCADashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#010b1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-rose-500"></div>
          <span className="text-slate-500 font-mono tracking-widest animate-pulse uppercase text-xs font-bold">Iniciando Ambiente...</span>
        </div>
      </div>
    }>
      <RCADashboardContent />
    </Suspense>
  );
}
