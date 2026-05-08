import sqlite3
import pandas as pd
from prophet import Prophet
import os
from datetime import datetime
import sys
import warnings

# Silencia avisos do Prophet/CMDStan
warnings.filterwarnings('ignore')

# Caminhos de configuração
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(BASE_DIR, "data/pac_history.db")

def run_forecast():
    print("🤖 Iniciando Motor de Forecast MULTI-BUFFER (Prophet/PAC IA)...")
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Banco de dados não encontrado em {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    
    try:
        df_features = pd.read_sql_query("SELECT * FROM gmo_features", conn)
        if df_features.empty:
            print("⚠️ Sem dados históricos para treinar.")
            return
            
        df_targets = pd.read_sql_query("SELECT * FROM plaza_targets", conn)
        # Fallback benchmark se não houver plaza_targets
        p25_benchmark = 46.5
        try:
            p25_benchmark = pd.read_sql_query("SELECT value FROM operational_benchmarks WHERE key = 'p25_benchmark'", conn).iloc[0]['value']
        except: pass
        
    except Exception as e:
        print(f"❌ Erro ao ler tabelas: {e}")
        return

    terminals = df_features['terminal'].unique()
    
    for term in terminals:
        print(f"📈 Processando terminal: {term}")
        df_term = df_features[df_features['terminal'] == term].copy()
        df_term['ds'] = pd.to_datetime(df_term['day'])
        
        # Mapeamento de métricas para prever
        metrics = {
            'volume': 'pred_volume',
            'avg_ciclo_total_h': 'pred_ciclo_total_h',
            'load_programado': 'pred_load_programado',
            'load_fila_externa': 'pred_load_fila_externa',
            'load_transito': 'pred_load_transito',
            'load_fila_interna': 'pred_load_fila_interna'
        }
        
        results = {}
        last_date = df_term['ds'].max()
        future = None

        for source_col, target_col in metrics.items():
            print(f"   ∟ Prevendo {source_col}...")
            m = Prophet(yearly_seasonality=False, weekly_seasonality=True, daily_seasonality=False)
            
            # Treinamento
            train_df = df_term[['ds', source_col]].rename(columns={source_col: 'y'})
            m.fit(train_df)
            
            # Predição (7 dias)
            if future is None:
                future = m.make_future_dataframe(periods=7)
            
            forecast = m.predict(future)
            # Garantir que valores sejam positivos (clip at 0)
            forecast['yhat'] = forecast['yhat'].clip(lower=0)
            
            # Guardamos apenas os dias futuros para consolidação
            results[target_col] = forecast[forecast['ds'] > last_date][['ds', 'yhat']]

        # Consolidar Resultados
        pred_days = results['pred_volume'].copy()
        
        for i, row in pred_days.iterrows():
            day_ds = row['ds']
            values = {k: results[k][results[k]['ds'] == day_ds]['yhat'].values[0] for k in metrics.values()}
            
            # Regra Prescritiva Dinâmica sobre Ciclo Total
            term_target = df_targets[df_targets['terminal'] == term]
            target_h = term_target['meta_h'].mean() if not term_target.empty else p25_benchmark
            tolerance = target_h * 1.15
            
            ciclo_p = values['pred_ciclo_total_h']
            load_externa = values['pred_load_fila_externa']
            
            # Nova Regra: Alerta Crítico Fila Externa > 300
            recom = "MANTER ATUAL"
            if load_externa > 300:
                recom = "🚨 PRIMEIRO AVISO: REDUZIR ANTECIPAÇÃO"
            elif ciclo_p > tolerance:
                recom = "REDUZIR ANTECIPAÇÃO (0h)"
            elif ciclo_p < target_h * 0.7:
                recom = "LIBERAR ANTECIPAÇÃO (24h)"
                
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO gmo_forecast 
                (day, terminal, pred_volume, pred_ciclo_total_h, 
                 pred_load_programado, pred_load_fila_externa, pred_load_transito, pred_load_fila_interna,
                 taxa_antecipacao_atual, recom_acao, insight_ia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                day_ds.strftime('%Y-%m-%d'),
                term,
                round(values['pred_volume'], 1),
                round(values['pred_ciclo_total_h'], 1),
                round(values['pred_load_programado'], 1),
                round(values['pred_load_fila_externa'], 1),
                round(values['pred_load_transito'], 1),
                round(values['pred_load_fila_interna'], 1),
                0.0,
                recom,
                f"Fila Externa projetada em {round(load_externa,0)} caminhões. Ciclo total estimado em {round(ciclo_p,1)}h."
            ))
            
    conn.commit()
    conn.close()
    print("✅ Forecast MULTI-BUFFER concluído.")

if __name__ == "__main__":
    run_forecast()
