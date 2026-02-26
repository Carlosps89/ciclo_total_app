import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
from pathlib import Path

# =========================
# CONFIGURAÇÃO BÁSICA
# =========================

st.set_page_config(
    page_title="Controle de Ciclo Total",
    layout="wide",
)

DADOS_DIR = Path("dados")

# 🔁 Ajuste os nomes dos arquivos aqui, se estiverem diferentes na sua pasta
ARQ_2023 = DADOS_DIR / "ciclo_2023.parquet"
ARQ_2024 = DADOS_DIR / "ciclo_2024.parquet"
ARQ_2025 = DADOS_DIR / "ciclo_2025.parquet"


# =========================
# FUNÇÕES DE APOIO
# =========================

def encontrar_coluna(df: pd.DataFrame, descricao: str, cond, obrigatoria: bool = True):
    """
    Encontra a primeira coluna cujo nome (minúsculo/strip) satisfaça a condição cond(nome).
    cond: função que recebe uma string (nome da coluna em lower/strip) e retorna True/False.
    """
    cols = []
    for c in df.columns:
        nome = c.lower().strip()
        if cond(nome):
            cols.append(c)

    if not cols:
        if obrigatoria:
            raise KeyError(
                f"Não encontrei coluna para {descricao}. Colunas disponíveis: {list(df.columns)}"
            )
        else:
            return None

    # Se houver mais de uma, usa a primeira
    return cols[0]


def preparar_ano(caminho: Path, ano: int) -> pd.DataFrame:
    """Lê o Excel de um ano, encontra as colunas, calcula os indicadores e devolve um DataFrame padronizado."""

    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho}")

    df = pd.read_parquet(caminho)
    df.columns = df.columns.map(lambda x: str(x).strip())

    # =========================
    # ENCONTRAR COLUNAS-BASE
    # =========================
    # Emissão da Nota
    col_emissao = encontrar_coluna(
        df,
        "Emissão da Nota",
        lambda s: "emiss" in s and "nota" in s,
    )

    # Criação do Agendamento (Opção A: preferir "Data do agendamento")
    candidatos_data_ag = [
        c
        for c in df.columns
        if "data do agendamento" in c.lower().strip()
    ]
    if candidatos_data_ag:
        col_agendamento = candidatos_data_ag[0]
    else:
        col_agendamento = encontrar_coluna(
            df,
            "Data do agendamento",
            lambda s: "agend" in s,
        )

    # Chegada TRO
    col_chegada = encontrar_coluna(
        df,
        "Chegada TRO",
        lambda s: "chegada" in s and "tro" in s,
    )

    # Saída TRO
    col_saida = encontrar_coluna(
        df,
        "Saída TRO",
        lambda s: "saida" in s and "tro" in s,
    )

    # Dimensões (Cliente / Produto / Origem)
    try:
        col_cliente = encontrar_coluna(
            df,
            "Cliente",
            lambda s: "client" in s,
        )
    except KeyError:
        col_cliente = None

    try:
        col_produto = encontrar_coluna(
            df,
            "Produto",
            lambda s: "produt" in s,
        )
    except KeyError:
        col_produto = None

    try:
        col_origem = encontrar_coluna(
            df,
            "Origem",
            lambda s: "origem" in s or "orig." in s,
        )
    except KeyError:
        col_origem = None

    # =========================
    # CONVERTER PARA DATETIME
    # =========================
    for col in [col_emissao, col_agendamento, col_chegada, col_saida]:
        df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=False)

    # =========================
    # CALCULAR INDICADORES (EM HORAS)
    # =========================
    # Ciclo Total: Saída TRO - Emissão da Nota
    delta_total = df[col_saida] - df[col_emissao]
    ciclo_total_h = delta_total.dt.total_seconds() / 3600

    # Ciclo Interno: Saída TRO - Chegada TRO
    delta_interno = df[col_saida] - df[col_chegada]
    ciclo_interno_h = delta_interno.dt.total_seconds() / 3600

    # Tempo de Viagem: Chegada TRO - Criação do Agendamento
    delta_viagem = df[col_chegada] - df[col_agendamento]
    tempo_viagem_h = delta_viagem.dt.total_seconds() / 3600

    # Tempo de Agendamento: Criação do Agendamento - Emissão da Nota
    delta_agendamento = df[col_agendamento] - df[col_emissao]
    tempo_agendamento_h = delta_agendamento.dt.total_seconds() / 3600

    # =========================
    # DIMENSÕES
    # =========================
    # Base de data: usamos Saída TRO; se vazia, usa Chegada TRO
    base_data = df[col_saida].where(df[col_saida].notna(), df[col_chegada])

    out = pd.DataFrame({
        "Ano": int(ano),
        "Data": pd.to_datetime(base_data.dt.date),
    })
    out["Mes"] = out["Data"].dt.month
    out["Dia"] = out["Data"].dt.day

    if col_cliente is not None:
        out["Cliente"] = df[col_cliente].astype(str).str.strip()
    else:
        out["Cliente"] = "N/A"

    if col_produto is not None:
        out["Produto"] = df[col_produto].astype(str).str.strip()
    else:
        out["Produto"] = "N/A"

    if col_origem is not None:
        out["Origem"] = df[col_origem].astype(str).str.strip()
    else:
        out["Origem"] = "N/A"

    # Indicadores finais
    out["Ciclo Total (h)"] = ciclo_total_h
    out["Ciclo Interno (h)"] = ciclo_interno_h
    out["Tempo de Viagem (h)"] = tempo_viagem_h
    out["Tempo de Agendamento (h)"] = tempo_agendamento_h

    # Remove linhas sem data
    out = out.dropna(subset=["Data"])

    return out


@st.cache_data(show_spinner="Carregando e padronizando dados de ciclo...")
def carregar_ciclo() -> pd.DataFrame:
    """Carrega 2023/2024/2025, padroniza e concatena em um único DataFrame."""
    frames = []

    if ARQ_2023.exists():
        frames.append(preparar_ano(ARQ_2023, 2023))
    if ARQ_2024.exists():
        frames.append(preparar_ano(ARQ_2024, 2024))
    if ARQ_2025.exists():
        # Se você ainda não tiver 2025, comente esta linha
        frames.append(preparar_ano(ARQ_2025, 2025))

    if not frames:
        st.error("Nenhum arquivo de dados encontrado na pasta 'dados'. Verifique os caminhos.")
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)

    # Garantir tipos numéricos e remover linhas ruins antes de astype(int)
    for col in ["Ano", "Mes", "Dia"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Remove linhas onde Ano/Mes/Dia não existem
    df = df.dropna(subset=["Ano", "Mes", "Dia"])

    df["Ano"] = df["Ano"].astype(int)
    df["Mes"] = df["Mes"].astype(int)
    df["Dia"] = df["Dia"].astype(int)

    return df


def aplicar_filtros(df: pd.DataFrame) -> pd.DataFrame:
    """Aplica filtros de Ano, Mês, Produto, Cliente, Período (Data)."""

    if df.empty:
        return df

    with st.sidebar:
        st.header("Filtros")

        anos_disponiveis = sorted(df["Ano"].unique().tolist())
        anos_sel = st.multiselect(
            "Ano",
            options=anos_disponiveis,
            default=anos_disponiveis,
        )

        meses_disponiveis = sorted(df["Mes"].unique().tolist())
        meses_sel = st.multiselect(
            "Mês (1–12)",
            options=meses_disponiveis,
            default=meses_disponiveis,
        )

        produtos_disponiveis = sorted(df["Produto"].dropna().astype(str).unique().tolist())
        produtos_sel = st.multiselect(
            "Produto",
            options=produtos_disponiveis,
            default=produtos_disponiveis,
        )

        clientes_disponiveis = sorted(df["Cliente"].dropna().astype(str).unique().tolist())
        clientes_sel = st.multiselect(
            "Cliente",
            options=clientes_disponiveis,
            default=clientes_disponiveis,
        )

        # Filtro de período (por Data)
        data_min = df["Data"].min()
        data_max = df["Data"].max()
        periodo = st.date_input(
            "Período (Data)",
            value=(data_min, data_max),
        )

    df_f = df.copy()

    if anos_sel:
        df_f = df_f[df_f["Ano"].isin(anos_sel)]

    if meses_sel:
        df_f = df_f[df_f["Mes"].isin(meses_sel)]

    if produtos_sel:
        df_f = df_f[df_f["Produto"].astype(str).isin(produtos_sel)]

    if clientes_sel:
        df_f = df_f[df_f["Cliente"].astype(str).isin(clientes_sel)]

    if isinstance(periodo, (list, tuple)) and len(periodo) == 2:
        data_ini, data_fim = periodo
        data_ini = pd.to_datetime(data_ini)
        data_fim = pd.to_datetime(data_fim)
        df_f = df_f[(df_f["Data"] >= data_ini) & (df_f["Data"] <= data_fim)]

    return df_f


def mostrar_big_numbers(df: pd.DataFrame):
    """Mostra os 4 KPIs principais como métricas."""
    st.subheader("KPIs Gerais (médias do filtro aplicado)")

    if df.empty:
        st.info("Sem dados para exibir KPIs com os filtros atuais.")
        return

    indicadores = [
        ("Ciclo Total (h)", "Ciclo Total"),
        ("Ciclo Interno (h)", "Ciclo Interno"),
        ("Tempo de Viagem (h)", "Tempo de Viagem"),
        ("Tempo de Agendamento (h)", "Tempo de Agendamento"),
    ]

    cols = st.columns(len(indicadores))

    for (col_name, label), col in zip(indicadores, cols):
        valor = df[col_name].mean()
        with col:
            if pd.isna(valor):
                st.metric(label, "–")
            else:
                st.metric(label, f"{valor:.1f} h")


def grafico_ciclos(df: pd.DataFrame):
    """Gráfico de barras com colunas agrupadas por Ano (lado a lado)."""

    st.subheader("Análise Temporal do Ciclo")

    indicadores = {
        "Ciclo Total (h)": "Ciclo Total (h)",
        "Ciclo Interno (h)": "Ciclo Interno (h)",
        "Tempo de Viagem (h)": "Tempo de Viagem (h)",
        "Tempo de Agendamento (h)": "Tempo de Agendamento (h)",
    }

    indicador_label = st.selectbox(
        "Indicador",
        options=list(indicadores.keys()),
        index=0,
    )
    indicador_col = indicadores[indicador_label]

    granularidade = st.radio(
        "Nível de análise",
        options=["Ano", "Mês", "Dia"],
        index=1,  # começa em "Mês"
        horizontal=True,
    )

    if df.empty:
        st.warning("Sem dados para os filtros selecionados.")
        return

    # Agrupamento conforme granularidade
    if granularidade == "Ano":
        df_g = df.groupby("Ano", as_index=False)[indicador_col].mean()
        x_col = "Ano"
        fig = px.bar(
            df_g,
            x=x_col,
            y=indicador_col,
            color="Ano",
            barmode="group",
            text=indicador_col,
        )

    elif granularidade == "Mês":
        df_g = df.groupby(["Ano", "Mes"], as_index=False)[indicador_col].mean()
        df_g["MesLabel"] = df_g["Mes"].astype(str).str.zfill(2)
        x_col = "MesLabel"
        fig = px.bar(
            df_g,
            x=x_col,
            y=indicador_col,
            color="Ano",
            barmode="group",  # 🔹 agrupado, não empilhado
            text=indicador_col,
        )
        fig.update_layout(xaxis_title="Mês")

    else:  # Dia
        df_g = df.groupby(["Ano", "Data"], as_index=False)[indicador_col].mean()
        x_col = "Data"
        fig = px.bar(
            df_g,
            x=x_col,
            y=indicador_col,
            color="Ano",
            barmode="group",
            text=indicador_col,
        )
        fig.update_layout(xaxis_title="Data")

    # Formatação rótulos
    fig.update_traces(
        texttemplate="%{text:.1f}",
        textposition="outside",
    )
    fig.update_layout(
        yaxis_title=f"{indicador_label}",
        legend_title="Ano",
        xaxis_tickangle=-45,
        margin=dict(l=40, r=20, t=40, b=80),
    )

    st.plotly_chart(fig, use_container_width=True)


# =========================
# MAIN
# =========================

def main():
    st.title("Controle de Ciclo Total")

    df_ciclo = carregar_ciclo()
    if df_ciclo.empty:
        return

    df_filtrado = aplicar_filtros(df_ciclo)

    mostrar_big_numbers(df_filtrado)
    grafico_ciclos(df_filtrado)


if __name__ == "__main__":
    main()