#!/bin/bash

# Script de Redesign/Deploy para VM
# Resolve erros de "Server Action mismatch" e "Client-side exceptions"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "--- Iniciando Redesign/Rebuild do Sistema ---"

# 1. Puxar as últimas correções (FORÇADO para evitar conflitos)
echo "[1/3] Atualizando código do repositório..."
git fetch origin main
git reset --hard origin/main

# 2. Rebuild do Next.js (CRÍTICO para produção)
echo "[2/3] Limpando cache e compilando nova versão..."
rm -rf .next
npm install # ou npm ci se preferir mais rigor
npm run build

if [ $? -eq 0 ]; then
    # 3. Reiniciar PM2 (O RESTART REAL DO SERVIDOR)
    echo "[3/3] Reiniciando processo no PM2..."
    pm2 restart pac-dashboard --update-env || pm2 restart all --update-env
    echo "--- Sucesso! ---"
    echo "DICA: Lembre-se de dar Ctrl+F5 no seu navegador."
else
    echo "!!! Erro na compilação. Deployment cancelado. !!!"
    exit 1
fi
