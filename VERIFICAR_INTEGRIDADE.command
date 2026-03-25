#!/bin/bash
# Carrega o ambiente do usuário para encontrar node/npx/npm
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile"
[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc"

cd "$(dirname "$0")/pac-mission-control"
clear
echo "=========================================================="
echo "   📊 PAC Mission - Verificador de Integridade v1.0      "
echo "=========================================================="
echo "Comparando dados entre a Visão Original e o Novo Snapshot..."
echo ""

npx tsx scripts/verify-integrity.ts

echo ""
echo "=========================================================="
echo "Instruções:"
echo "1. Os totais devem ser idênticos ou muito próximos."
echo "2. A 'Avg_Ciclo_H' deve ser exatamente igual."
echo "=========================================================="
echo ""
read -p "Pressione Enter para fechar..."
