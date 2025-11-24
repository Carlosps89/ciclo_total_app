import math
import pandas as pd
import plotly.express as px
import streamlit as st

# =========================
# CONFIGURAÇÕES BÁSICAS
# =========================

st.set_page_config(
    page_title="Controle de Ciclo Total",
    layout="wide"
)

st.title("🚛 Controle de Ciclo Total")

ARQUIVO_EXCEL = "dados/Analise_Tempo_Origem_Chegada_TRO.xlsx"


# =========================
# CARREGAMENTO E TRATAMENTO
# =========================

@st.cache_data
def carregar_dados(caminho: str) -> pd.DataFrame:
    df = pd.read_excel(caminho, engine="openpyxl")

    # Limpa nomes de colunas
    df.columns = [c.strip() for c in df.columns]

    # Converte colunas de data/hora
    col_datas = ["Emissão Nota", "agendamento", "Chegada TRO", "Saida TRO", "Data"]
    for col in col_datas:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # ----- Indicadores -----
    # 1) Tempo de Agendamento: Emissão da Nota -> Criação do Agendamento
    if "Emissão Nota" in df.columns and "agendamento" in df.columns:
        df["tempo_agendamento_h"] = (
            df["agendamento"] - df["Emissão Nota"]
        ).dt.total_seconds() / 3600

    # 2) Tempo de Viagem: Criação do Agendamento -> Chegada TRO
    if "agendamento" in df.columns and "Chegada TRO" in df.columns:
        df["tempo_viagem_h"] = (
            df["Chegada TRO"] - df["agendamento"]
        ).dt.total_seconds() / 3600

    # 3) Ciclo Interno: Chegada TRO -> Saída TRO
    if "Chegada TRO" in df.columns and "Saida TRO" in df.columns:
        df["ciclo_interno_h"] = (
            df["Saida TRO"] - df["Chegada TRO"]
        ).dt.total_seconds() / 3600

    # 4) Ciclo Total: Emissão da Nota -> Saída TRO
    if "Emissão Nota" in df.columns and "Saida TRO" in df.columns:
        df["ciclo_total_h"] = (
            df["Saida TRO"] - df["Emissão Nota"]
        ).dt.total_seconds() / 3600
    elif (
        "tempo_agendamento_h" in df.columns
        and "tempo_viagem_h" in df.columns
        and "ciclo_interno_h" in df.columns
    ):
        df["ciclo_total_h"] = (
            df["tempo_agendamento_h"]
            + df["tempo_viagem_h"]
            + df["ciclo_interno_h"]
        )

    # Padroniza texto
    for col in ["Produto", "Cliente", "Origem"]:
        if col in df.columns:
            df[col] = df[col].astype(str)

    # Detecta coluna de GMO
    gmo_col = None
    for c in df.columns:
        if c.strip().lower() in ["gmo", "gmo_id", "id_gmo"]:
            gmo_col = c
            break

    # Coluna base de data
    if "Data" in df.columns:
        base = "Data"
    elif "Chegada TRO" in df.columns:
        base = "Chegada TRO"
    else:
        st.error("Nenhuma coluna de data encontrada ('Data' ou 'Chegada TRO').")
        return pd.DataFrame()

    df = df[df[base].notna()].copy()

    df["data_base"] = df[base]
    df["ano"] = df["data_base"].dt.year
    df["mes"] = df["data_base"].dt.to_period("M").dt.to_timestamp()
    df["dia"] = df["data_base"].dt.date
    df["hora"] = df["data_base"].dt.hour
    df["data_hora"] = df["data_base"].dt.floor("H")

    df.attrs["gmo_col"] = gmo_col

    return df


df_raw = carregar_dados(ARQUIVO_EXCEL)

if df_raw.empty:
    st.stop()

COL_DATA_BASE = "data_base"


# =========================
# MODO DE VISUALIZAÇÃO
# =========================

view_mode = st.radio(
    "Modo de visualização",
    ["Desktop", "Mobile"],
    horizontal=True
)

# =========================
# FILTROS (SIDEBAR) – iguais para desktop e mobile
# =========================

with st.sidebar.expander("Filtros", expanded=(view_mode == "Desktop")):
    df = df_raw.copy()

    data_min = df[COL_DATA_BASE].min().date()
    data_max = df[COL_DATA_BASE].max().date()

    periodo = st.date_input(
        "Período",
        value=(data_min, data_max)
    )

    if isinstance(periodo, tuple) and len(periodo) == 2:
        inicio, fim = periodo
        df = df[
            (df[COL_DATA_BASE].dt.date >= inicio)
            & (df[COL_DATA_BASE].dt.date <= fim)
        ]

    for campo in ["Origem", "Cliente", "Produto"]:
        if campo in df.columns:
            valores = ["Todos"] + sorted(df[campo].dropna().unique().tolist())
            escolha = st.selectbox(campo, valores)
            if escolha != "Todos":
                df = df[df[campo] == escolha]

if df.empty:
    st.warning("Nenhum dado encontrado com os filtros selecionados.")
    st.stop()

GMO_COL = df.attrs.get("gmo_col", df_raw.attrs.get("gmo_col", None))


# =========================
# FUNÇÃO AUXILIAR – gráfico de barras
# =========================

def grafico_barras(df_in, indicador_nome, indicador_col, nivel, mobile=False):
    # Agrupamento
    if nivel == "Ano":
        df_group = (
            df_in.groupby("ano")[indicador_col]
            .mean()
            .reset_index()
            .rename(columns={"ano": "eixo"})
        )
        eixo_label = "Ano"
    elif nivel == "Mês":
        df_group = (
            df_in.groupby("mes")[indicador_col]
            .mean()
            .reset_index()
            .rename(columns={"mes": "eixo"})
        )
        eixo_label = "Mês"
    elif nivel == "Dia":
        df_group = (
            df_in.groupby("dia")[indicador_col]
            .mean()
            .reset_index()
            .rename(columns={"dia": "eixo"})
        )
        eixo_label = "Dia"
    else:  # Hora
        df_group = (
            df_in.groupby("hora")[indicador_col]
            .mean()
            .reset_index()
            .rename(columns={"hora": "eixo"})
        )
        eixo_label = "Hora do dia"

    if df_group.empty:
        st.warning("Nenhum dado disponível para o nível de análise selecionado.")
        return

    fig = px.bar(
        df_group,
        x="eixo",
        y=indicador_col,
        title=f"{indicador_nome} por {eixo_label}" if not mobile else "",
        text=indicador_col,
        color_discrete_sequence=["#003865"],  # Azul Rumo
    )
    fig.update_traces(
        texttemplate="%{y:.2f}",
        textposition="outside",
        cliponaxis=False,
    )
    fig.update_xaxes(title=eixo_label)
    fig.update_yaxes(title="Horas")
    fig.update_layout(
        uniformtext_minsize=8,
        uniformtext_mode="hide",
        margin=dict(t=40 if not mobile else 10, b=40, l=40, r=20),
    )
    st.plotly_chart(fig, use_container_width=True)


# =========================
# LAYOUT DESKTOP
# =========================

if view_mode == "Desktop":
    # BIG NUMBERS em 4 colunas
    st.subheader("Indicadores principais (médias em horas)")
    c1, c2, c3, c4 = st.columns(4)

    c1.metric(
        "Ciclo Total",
        f"{df['ciclo_total_h'].mean():.2f} h" if "ciclo_total_h" in df.columns else "-",
    )

    c2.metric(
        "Tempo de Viagem",
        f"{df['tempo_viagem_h'].mean():.2f} h" if "tempo_viagem_h" in df.columns else "-",
    )

    c3.metric(
        "Ciclo Interno",
        f"{df['ciclo_interno_h'].mean():.2f} h" if "ciclo_interno_h" in df.columns else "-",
    )

    c4.metric(
        "Tempo de Agendamento",
        f"{df['tempo_agendamento_h'].mean():.2f} h" if "tempo_agendamento_h" in df.columns else "-",
    )

    # CARD 1 – Gráfico de barras
    st.subheader("Análise temporal do ciclo")

    indicadores = {
        "Ciclo Total": "ciclo_total_h",
        "Tempo de Viagem": "tempo_viagem_h",
        "Ciclo Interno": "ciclo_interno_h",
        "Tempo de Agendamento": "tempo_agendamento_h",
    }

    indicador_nome = st.selectbox(
        "Indicador para o gráfico",
        list(indicadores.keys())
    )
    indicador_col = indicadores[indicador_nome]

    nivel = st.selectbox(
        "Nível de análise",
        ["Ano", "Mês", "Dia", "Hora"],
        index=1  # default Mês
    )

    grafico_barras(df, indicador_nome, indicador_col, nivel, mobile=False)

    # CARD 2 – Tabela por GMO + paginação
    st.subheader("Indicadores médios por GMO")

    if GMO_COL is not None and GMO_COL in df.columns:
        cols_indicadores = [
            c for c in ["ciclo_total_h", "tempo_viagem_h", "ciclo_interno_h", "tempo_agendamento_h"]
            if c in df.columns
        ]

        df_gmo = (
            df.groupby(GMO_COL)[cols_indicadores]
            .mean()
            .reset_index()
            .rename(columns={GMO_COL: "GMO"})
        )

        total_linhas = len(df_gmo)
        if total_linhas == 0:
            st.info("Nenhum GMO encontrado com os filtros atuais.")
        else:
            col_pag1, col_pag2 = st.columns(2)
            with col_pag1:
                page_size = st.number_input(
                    "Linhas por página",
                    min_value=10,
                    max_value=500,
                    value=50,
                    step=10
                )
            num_pages = math.ceil(total_linhas / page_size)
            with col_pag2:
                page = st.number_input(
                    "Página",
                    min_value=1,
                    max_value=max(num_pages, 1),
                    value=1,
                    step=1
                )

            start = int((page - 1) * page_size)
            end = int(start + page_size)

            df_page = df_gmo.iloc[start:end].copy()
            for c in cols_indicadores:
                df_page[c] = df_page[c].round(2)

            st.dataframe(df_page, use_container_width=True)
            st.caption(f"Página {page} de {num_pages} — Total: {total_linhas} GMOs")
    else:
        st.info("Nenhuma coluna de GMO encontrada na base (GMO, gmo, gmo_id...).")


# =========================
# LAYOUT MOBILE
# =========================

else:
    # BIG NUMBERS empilhados (cards)
    st.subheader("Indicadores (médias em horas)")

    def card_metric(label, value):
        st.markdown(
            f"""
            <div style="
                padding: 10px 14px;
                border-radius: 10px;
                background-color: #003865;
                color: white;
                margin-bottom: 8px;
            ">
                <div style="font-size: 14px; opacity: 0.8;">{label}</div>
                <div style="font-size: 22px; font-weight: bold;">{value}</div>
            </div>
            """,
            unsafe_allow_html=True
        )

    card_metric(
        "Ciclo Total",
        f"{df['ciclo_total_h'].mean():.2f} h" if "ciclo_total_h" in df.columns else "-"
    )
    card_metric(
        "Tempo de Viagem",
        f"{df['tempo_viagem_h'].mean():.2f} h" if "tempo_viagem_h" in df.columns else "-"
    )
    card_metric(
        "Ciclo Interno",
        f"{df['ciclo_interno_h'].mean():.2f} h" if "ciclo_interno_h" in df.columns else "-"
    )
    card_metric(
        "Tempo de Agendamento",
        f"{df['tempo_agendamento_h'].mean():.2f} h" if "tempo_agendamento_h" in df.columns else "-"
    )

    st.markdown("---")

    # Gráfico mais enxuto
    indicadores = {
        "Ciclo Total": "ciclo_total_h",
        "Tempo de Viagem": "tempo_viagem_h",
        "Ciclo Interno": "ciclo_interno_h",
        "Tempo de Agendamento": "tempo_agendamento_h",
    }

    indicador_nome = st.selectbox(
        "Indicador",
        list(indicadores.keys())
    )
    indicador_col = indicadores[indicador_nome]

    nivel = st.selectbox(
        "Nível",
        ["Mês", "Dia", "Ano", "Hora"],
        index=0
    )

    grafico_barras(df, indicador_nome, indicador_col, nivel, mobile=True)

    # Tabela por GMO mais enxuta (página menor)
    st.subheader("GMOs (médias dos indicadores)")

    if GMO_COL is not None and GMO_COL in df.columns:
        cols_indicadores = [
            c for c in ["ciclo_total_h", "tempo_viagem_h", "ciclo_interno_h", "tempo_agendamento_h"]
            if c in df.columns
        ]

        df_gmo = (
            df.groupby(GMO_COL)[cols_indicadores]
            .mean()
            .reset_index()
            .rename(columns={GMO_COL: "GMO"})
        )

        total_linhas = len(df_gmo)
        if total_linhas == 0:
            st.info("Nenhum GMO encontrado com os filtros atuais.")
        else:
            page_size = 20  # mobile: página menor
            num_pages = math.ceil(total_linhas / page_size)
            page = st.number_input(
                "Página",
                min_value=1,
                max_value=max(num_pages, 1),
                value=1,
                step=1
            )

            start = int((page - 1) * page_size)
            end = int(start + page_size)

            df_page = df_gmo.iloc[start:end].copy()
            for c in cols_indicadores:
                df_page[c] = df_page[c].round(2)

            st.dataframe(df_page, use_container_width=True, height=300)
            st.caption(f"Pág. {page}/{num_pages} — GMOs: {total_linhas}")
    else:
        st.info("Nenhuma coluna de GMO encontrada na base (GMO, gmo, gmo_id...).")