#!/bin/bash
# Carrega o ambiente do usuário para encontrar node/npx/npm
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile"
[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc"

cd "$(dirname "$0")/pac-mission-control"
clear
echo "=========================================================="
echo "   🤖 PAC Insight - Bot Analista (v3.0)                 "
echo "=========================================================="
echo "Este terminal deve ficar aberto para o robô funcionar."
echo "Ele está conectado aos dados otimizados do Dashboard."
echo ""

# Verifica se o npx está disponível agora
if ! command -v npx &> /dev/null
then
    echo "❌ Erro: Não encontrei o comando 'npx' ou 'node'."
    echo "Certifique-se de que o Node.js está instalado corretamente."
    read -p "Pressione Enter para sair..."
    exit 1
fi

while true
do
  echo "[$(date +%T)] 🚀 Iniciando PAC Insight..."
  
  # Inicia o bot worker diretamente para ver os logs em tempo real
  npx tsx src/workers/tg-agent-worker.ts
  
  echo ""
  echo "⚠️ O processo foi interrompido. Reiniciando em 5 segundos..."
  echo "----------------------------------------------------------"
  sleep 5
done
