#!/bin/bash
# Script para iniciar o Analista CCO (Bot Telegram) no Mac
# Ciclo Total App

cd "/Users/carlospereira/ciclo_total_app/pac-mission-control"

# Carregar o NVM (para garantir que o node/npm funcionem)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "--- Iniciando PAC Insight (Bot Telegram) ---"

# Tentar instalar o PM2 se não existir
if ! command -v pm2 &> /dev/null
then
    echo "[INFO] Instalando PM2..."
    npm install -g pm2
fi

# Iniciar o bot via PM2 usando o npx com tsx
echo "[INFO] Iniciando processo no PM2..."
pm2 start ecosystem.config.js --only pac-bot-agent

echo "--------------------------------------------"
echo "Status do Bot:"
pm2 status pac-bot-agent
echo "--------------------------------------------"
echo "Pode fechar esta janela. O bot continuará rodando em segundo plano."
read -p "Pressione ENTER para fechar..."
