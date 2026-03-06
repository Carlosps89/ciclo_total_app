#!/bin/bash
# Script para iniciar o sistema PAC (Atalho para duplo clique no Mac)

# Limpa a tela do terminal
clear

echo "======================================================="
echo "     INICIANDO O SERVIDOR PAC - MISSION CONTROL"
echo "======================================================="
echo ""

# Resolve o diretório local onde este arquivo está
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Navega até a pasta do painel
cd "$DIR/pac-mission-control" || exit

# Executa o script de inicialização existente (que possui autenticação na AWS etc)
./scripts/start-with-auth.sh
