nano rodar_dashboard.command#!/bin/zsh

# Caminho da pasta do projeto
cd /Users/carlospereira/ciclo_total_app

# Ativa a virtualenv
source .venv/bin/activate

# Sobe o Streamlit
streamlit run app.py
