export interface CycleStage {
    stage: string;
    avg_h: number;
    p90_h: number;
    meta_h: number;
    volume: number;
    status: 'green' | 'yellow' | 'red';
}

export interface SummaryResponse {
    terminal: string;
    updated_at: string;
    meta?: {
        panel_updated_at_brt: string;
        aws_last_peso_saida_brt: string | null;
        aws_last_cheguei_brt: string | null;
        athena_cache_expires_at?: string;
    };
    stages: {
        aguardando_agendamento: CycleStage;
        tempo_viagem: CycleStage;
        tempo_interno: CycleStage;
    };
}

export interface CycleTotalBucket {
    label: string;
    avg_h: number;
    p50_h: number;
    p95_h: number;
    volume: number;
    // New fields for CCO
    base_volume?: number;      // Total scheduled (for Dia)
    finished_volume?: number;  // Total finished (for Dia)
    acima_meta_count?: number;
    acima_meta_pct?: number;
    delta_meta_h?: number;
    is_fallback?: boolean;
}

export interface CycleTotalResponse {
    terminal: string;
    updated_at: string;
    ciclo_total: {
        hora_atual: CycleTotalBucket;
        dia: CycleTotalBucket;
        mes: CycleTotalBucket;
        ano: CycleTotalBucket;
    };
}

export interface OutlierItem {
    gmo_id: string;
    placa: string;
    origem: string;
    produto: string;
    terminal: string;
    etapa: string;
    valor_h: number;
    updated_at: string;
    // Detailed Timestamps for Drill-down
    dt_emissao?: string;
    dt_agendamento?: string;
    dt_janela?: string;
    dt_cheguei?: string;
    dt_chamada?: string;
    dt_chegada?: string;
    dt_peso_saida?: string;
    // Specific Stage Metrics
    h_agendamento?: number;
    h_viagem?: number;
    h_interno?: number;
}

export interface VehicleItem {
    gmo_id: string;
    placa: string;
    origem: string;
    produto: string;
    cliente?: string;
    ciclo_total_h: number;
    h_verde: number;
    h_interno: number;
    h_viagem: number;
    h_aguardando: number;
    // Timestamps for details
    dt_emissao?: string;
    dt_agendamento?: string;
    dt_janela?: string;
    dt_cheguei?: string;
    dt_chamada?: string;
    dt_chegada?: string;
    dt_peso_saida?: string;
}

export interface OutliersResponse {
    terminal: string;
    updated_at: string;
    items: OutlierItem[];
}

export interface AnticipationResponse {
    terminal: string;
    updated_at: string;
    antecipando_agora: {
        count: number;
        pct: number;
        avg_h: number;
    };
    base_agora: {
        count_total: number;
    };
    top_origens: {
        origem: string;
        count: number;
    }[];
    histogram: {
        bucket: string;
        count: number;
        pct: number;
    }[];
    window_bars?: {
        now_sp_iso: string;
        d0: { hour: number; count: number }[];
        d1: { hour: number; count: number }[];
        d2: { hour: number; count: number }[];
        d0_total: number;
        d1_total: number;
        d2_total: number;
    };
    rolling_windows?: {
        hour_rel: number;
        label: string;
        count: number;
        ts: string;
        day_offset: number;
    }[];
}
export interface PracaStatsItem {
    praca: string;
    avg_h: number;
    volume: number;
    acima_meta_pct: number;
    status: 'green' | 'yellow' | 'red';
}

export interface PracaStatsResponse {
    terminal: string;
    date: string;
    updated_at: string;
    items: PracaStatsItem[];
}
