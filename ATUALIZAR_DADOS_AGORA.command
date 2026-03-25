#!/bin/bash
# Carrega o ambiente do usuário para encontrar node/npx/npm
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile"
[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc"

cd "$(dirname "$0")/pac-mission-control"
clear
echo "=========================================================="
echo "   ⚡️ PAC Mission - Atualizar Dados Agora (Manual)       "
echo "=========================================================="

if ! command -v npx &> /dev/null
then
    echo "❌ Erro: Não encontrei o comando 'npx' ou 'node'."
    read -p "Pressione Enter para sair..."
    exit 1
fi

npx tsx scripts/sync-snapshot.ts

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Dados atualizados com sucesso!"
else
  echo ""
  echo "❌ Erro ao atualizar os dados."
fi

echo ""
read -p "Pressione Enter para fechar esta janela..."
