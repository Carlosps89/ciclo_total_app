from pathlib import Path
import time

import pandas as pd
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

# =========================
# CONFIGURAÇÕES DE ARQUIVOS
# =========================

BASE_DIR = Path(__file__).parent
DADOS_DIR = BASE_DIR / "dados"

# Usa exatamente os nomes que você tem hoje na pasta "dados"
ARQ_CICLO_2023 = DADOS_DIR / "Analise_Tempo Origem x Chegada TRO -2023.xlsx"
ARQ_CICLO_2024 = DADOS_DIR / "Analise_Tempo Origem x Chegada TRO -2024.xlsx"
ARQ_CICLO_2025 = DADOS_DIR / "Analise_Tempo_Origem_Chegada_TRO.xlsx"
ARQ_MOTORISTAS = DADOS_DIR / "TRO - Dados motoristas 2023-2024-2025.xlsx"

# Saídas em parquet
ARQ_PARQUET_23 = DADOS_DIR / "ciclo_2023.parquet"
ARQ_PARQUET_24 = DADOS_DIR / "ciclo_2024.parquet"
ARQ_PARQUET_25 = DADOS_DIR / "ciclo_2025.parquet"
ARQ_PARQUET_MOTORISTAS = DADOS_DIR / "motoristas_2023_2025.parquet"

# Cache de geocodificação
ARQ_GEO_CIDADES = DADOS_DIR / "geo_cidades.parquet"


# =========================
# FUNÇÕES AUXILIARES
# =========================

def normalizar_gmo_serie(serie: pd.Series) -> pd.Series:
    """
    Normaliza a coluna GMO:
    - vira string
    - remove caracteres especiais (deixa só 0-9, A-Z)
    - caixa alta
    - vazio -> None
    """
    return (
        serie.astype(str)
        .str.strip()
        .str.replace(r"[^0-9A-Za-z]", "", regex=True)
        .str.upper()
        .replace({"": None})
    )


def carregar_ciclo_excel(caminho: Path, ano: int) -> pd.DataFrame:
    """
    Lê o Excel de ciclo para um determinado ano, tratando tudo como string
    para evitar problemas de Overflow/pyarrow, e normaliza GMO.
    """
    print(f"Lendo ciclo {ano} de {caminho.name} ...")

    # força todas as colunas a serem string para evitar Overflow de inteiros gigantes
    df = pd.read_excel(caminho, dtype=str)

    # strip em todas as colunas para limpar espaços
    df = df.apply(lambda col: col.astype(str).str.strip())

    # normalizar GMO se existir
    if "GMO" in df.columns:
        print(f"Normalizando coluna GMO para o ciclo {ano} ...")
        df["GMO"] = normalizar_gmo_serie(df["GMO"])

    # adiciona coluna Ano (como string ou int, tanto faz para parquet)
    df["Ano"] = str(ano)

    return df


def salvar_parquet(df: pd.DataFrame, caminho: Path):
    print(f"Salvando {caminho.name} ...")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(caminho, index=False)
    print(f"OK: {caminho}")


def preparar_ciclos():
    """Lê os excels de ciclo e salva tudo em parquet (por ano)."""
    if not ARQ_CICLO_2023.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {ARQ_CICLO_2023}")
    if not ARQ_CICLO_2024.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {ARQ_CICLO_2024}")
    if not ARQ_CICLO_2025.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {ARQ_CICLO_2025}")

    df23 = carregar_ciclo_excel(ARQ_CICLO_2023, 2023)
    df24 = carregar_ciclo_excel(ARQ_CICLO_2024, 2024)
    df25 = carregar_ciclo_excel(ARQ_CICLO_2025, 2025)

    salvar_parquet(df23, ARQ_PARQUET_23)
    salvar_parquet(df24, ARQ_PARQUET_24)
    salvar_parquet(df25, ARQ_PARQUET_25)


def preparar_motoristas():
    """Converte o Excel de motoristas para parquet, normalizando GMO."""
    if not ARQ_MOTORISTAS.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {ARQ_MOTORISTAS}")

    print(f"Lendo motoristas de {ARQ_MOTORISTAS.name} ...")

    # tudo como string para evitar qualquer problema de tipo
    df = pd.read_excel(ARQ_MOTORISTAS, dtype=str)
    df = df.apply(lambda col: col.astype(str).str.strip())

    if "GMO" in df.columns:
        print("Normalizando coluna GMO na base de motoristas ...")
        df["GMO"] = normalizar_gmo_serie(df["GMO"])

    salvar_parquet(df, ARQ_PARQUET_MOTORISTAS)


# ===========
# GEOCODING
# ===========

def geocodificar_novas_cidades():
    """
    - Lê os parquet de ciclos (23,24,25)
    - Extrai lista de 'Origem'
    - Carrega cache existente 'geo_cidades.parquet', se houver
    - Geocodifica somente cidades novas
    - Atualiza o cache em parquet
    """
    print("Carregando ciclos em parquet para extrair lista de origens ...")

    if not ARQ_PARQUET_23.exists() or not ARQ_PARQUET_24.exists() or not ARQ_PARQUET_25.exists():
        raise FileNotFoundError(
            "Parquet de ciclos não encontrado. Rode preparar_ciclos() primeiro."
        )

    df23 = pd.read_parquet(ARQ_PARQUET_23)
    df24 = pd.read_parquet(ARQ_PARQUET_24)
    df25 = pd.read_parquet(ARQ_PARQUET_25)

    df_ciclos = pd.concat([df23, df24, df25], ignore_index=True)

    if "Origem" not in df_ciclos.columns:
        raise ValueError("Não encontrei a coluna 'Origem' na base de ciclos.")

    origens = (
        df_ciclos["Origem"]
        .astype(str)
        .str.strip()
        .str.upper()
        .dropna()
        .unique()
        .tolist()
    )

    print(f"Encontradas {len(origens)} origens distintas na base de ciclos.")

    # Carregar cache existente, se houver
    if ARQ_GEO_CIDADES.exists():
        geo_cache = pd.read_parquet(ARQ_GEO_CIDADES)
        print(f"Cache existente carregado: {len(geo_cache)} cidades.")
    else:
        geo_cache = pd.DataFrame(columns=["Origem", "lat", "lon"])

    cidades_ja_cadastradas = set(geo_cache["Origem"].astype(str).str.upper())
    novas_cidades = [c for c in origens if c not in cidades_ja_cadastradas]

    print(f"Cidades já geocodificadas: {len(cidades_ja_cadastradas)}")
    print(f"Cidades novas para geocodificar: {len(novas_cidades)}")

    if not novas_cidades:
        print("Nenhuma cidade nova para geocodificar. Nada a fazer.")
        return

    geolocator = Nominatim(user_agent="ciclo_total_app")
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)

    novos_registros = []

    for cidade in novas_cidades:
        try:
            query = f"{cidade}, Brasil"
            print(f"Geocodificando: {query} ...")
            location = geocode(query)

            if location:
                novos_registros.append(
                    {"Origem": cidade, "lat": location.latitude, "lon": location.longitude}
                )
                print(f"  OK: {location.latitude:.4f}, {location.longitude:.4f}")
            else:
                print("  NÃO ENCONTRADO, pulando.")
        except Exception as e:
            print(f"  Erro geocodificando {cidade}: {e}")
        time.sleep(1)  # segurança contra rate limit

    if novos_registros:
        df_novos = pd.DataFrame(novos_registros)
        geo_atualizado = pd.concat([geo_cache, df_novos], ignore_index=True)
    else:
        geo_atualizado = geo_cache

    salvar_parquet(geo_atualizado, ARQ_GEO_CIDADES)
    print("Geocoding concluído e cache atualizado.")


# ===========
# MAIN
# ===========

if __name__ == "__main__":
    print("=== Preparação de dados – ciclo_total_app ===")
    DADOS_DIR.mkdir(exist_ok=True)

    preparar_ciclos()
    preparar_motoristas()
    geocodificar_novas_cidades()

    print("✅ Preparação concluída. Parquet e geocoding prontos.")