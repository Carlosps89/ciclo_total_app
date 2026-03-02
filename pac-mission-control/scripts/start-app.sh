#!/bin/bash

# Script unificado para Gestão do PAC Mission Control
# Uso: ./scripts/start-app.sh

PROFILE="rumo-sso"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "--- 1/2 Verificando Autenticação AWS ---"
if ! aws sts get-caller-identity --profile "$PROFILE" > /dev/null 2>&1; then
    echo "[!] Sessão AWS expirada. Por favor, autorize no navegador..."
    aws sso login --profile "$PROFILE"
else
    echo "[✓] Autenticação AWS Ativa."
fi

echo "--- 2/2 Reiniciando Servidor no PM2 ---"
# Tenta reiniciar usando o arquivo de configuração
pm2 startOrRestart ecosystem.config.js

echo "------------------------------------------------"
echo "CONCLUÍDO! O dashboard está online."
echo "Logs em tempo real: pm2 logs pac-dashboard"
echo "------------------------------------------------"
