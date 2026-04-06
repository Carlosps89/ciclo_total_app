#!/bin/bash
# Carrega o ambiente do usuário para encontrar node/npx/npm
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile"
[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc"

cd "$(dirname "$0")/pac-mission-control"
clear
echo "=========================================================="
echo "   🟢 PAC Insight - Robô do WhatsApp (Cron)             "
echo "=========================================================="
echo "Importante: Não feche essa janela preta!"
echo "Caso seja o primeiro acesso, escaneie o QR Code gigante."
echo "Envio automático programado para as 06:00 BRT."
echo ""

if ! command -v npm &> /dev/null
then
    echo "❌ Erro: Não encontrei o comando 'npm'."
    read -p "Pressione Enter para sair..."
    exit 1
fi

while true
do
  echo "[$(date +%T)] 🚀 Iniciando..."
  
  npm run worker:whatsapp
  
  echo ""
  echo "⚠️ O robô caiu ou a sessão expirou. Reiniciando em 5 segundos..."
  echo "----------------------------------------------------------"
  sleep 5
done
