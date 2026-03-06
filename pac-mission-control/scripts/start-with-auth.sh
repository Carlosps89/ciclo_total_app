#!/bin/bash

# Configurações
PROFILE="rumo-sso"
DIR="/Users/carlospereira/ciclo_total_app/pac-mission-control"

cd "$DIR" || exit

echo "---------------------------------------------------"
echo "Iniciando Verificador de Conexão PAC..."
echo "Horário: $(date)"
echo "---------------------------------------------------"

# 1. Verifica se a sessão AWS SSO está ativa
# O comando get-caller-identity falha se o token estiver expirado
if ! aws sts get-caller-identity --profile "$PROFILE" > /dev/null 2>&1; then
    echo "[!] Sessão AWS expirada ou inexistente. Iniciando login..."
    # aws sso login abrirá o navegador no Mac
    aws sso login --profile "$PROFILE"
    
    # Pequena pausa para garantir que o login foi processado (opcional)
    sleep 5
else
    echo "[✓] Sessão AWS está ativa."
fi

# 2. Verifica se o processo do NPM RUN DEV já está rodando
# Procuramos por processos 'next-dev' ou similares
if pgrep -f "next dev" > /dev/null; then
    echo "[!] O servidor de desenvolvimento já está em execução."
    echo "Deseja reiniciar? (s/n)"
    # Se for rodar via Cron, não queremos que pare para perguntar.
    # Mas se for manual, é útil. Para automação pura, poderíamos ignorar.
else
    echo "[>] Iniciando NPM RUN DEV..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    npm run dev
fi
