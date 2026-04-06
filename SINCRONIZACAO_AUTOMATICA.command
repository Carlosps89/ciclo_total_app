#!/bin/bash
# Carrega o ambiente do usuário para encontrar node/npx/npm
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bash_profile" ] && source "$HOME/.bash_profile"
[ -s "$HOME/.zshrc" ] && source "$HOME/.zshrc"

cd "$(dirname "$0")/pac-mission-control"
clear
echo "=========================================================="
echo "   🔄 PAC Mission - Sincronização Automática (v3)        "
echo "=========================================================="
echo "Este terminal deve ficar aberto para atualizar os dados."
echo ""

# Verifica se o npx está disponível agora
if ! command -v npx &> /dev/null
then
    echo "❌ Erro: Não encontrei o comando 'npx' ou 'node'."
    echo "Tente rodar o projeto no terminal comum primeiro."
    read -p "Pressione Enter para sair..."
    exit 1
fi

while true
do
  echo "[$(date +%T)] 🚀 Iniciando atualização da tabela pac_clean_data..."
  
  # Usamos o 'tsx' que já está no seu package.json para melhor compatibilidade
  npx tsx scripts/sync-snapshot.ts
  
  if [ $? -eq 0 ]; then
    echo "[$(date +%T)] ✅ Sucesso! Próxima atualização em 15 minutos."
  else
    echo "[$(date +%T)] ❌ Houve um erro na sincronização."
    echo "Verifique sua conexão VPN/AWS ou se o banco está acessível."
  fi
  
  echo "----------------------------------------------------------"
  sleep 900
done
