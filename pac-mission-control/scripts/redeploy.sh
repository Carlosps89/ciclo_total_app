#!/bin/bash

# Script de Redesign/Deploy para VM
# Resolve erros de "Server Action mismatch" e "Client-side exceptions"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "--- Iniciando Redesign/Rebuild do Sistema ---"

# 1. Puxar as últimas correções (caso o usuário não tenha feito)
git pull origin main

# 2. Rebuild do Next.js (CRÍTICO para produção)
echo "[1/2] Compilando assets do frontend..."
npm run build

if [ $? -eq 0 ]; then
    # 3. Reiniciar PM2 com as novas variáveis e build
    echo "[2/2] Reiniciando servidor PM2..."
    pm2 restart pac-dashboard --update-env
    echo "--- Sucesso! ---"
    echo "DICA: Lembre-se de dar Ctrl+F5 no seu navegador."
else
    echo "!!! Erro na compilação. Deployment cancelado. !!!"
    exit 1
fi
