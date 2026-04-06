#!/bin/zsh

# CARREGA O AMBIENTE NVM (Necessário para encontrar o npm/tsx no Mac)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# NAVEGA PARA O DIRETÓRIO DO PROJETO
cd "$(dirname "$0")"

echo "--------------------------------------------------------"
echo "INICIANDO SINCRONIZAÇÃO AUTOMÁTICA PAC MISSION CONTROL"
echo "Intervalo: 15 minutos (900 segundos)"
echo "--------------------------------------------------------"

while true; do
  echo "[$(date '+%H:%M:%S')] Executando sincronização do Snapshot..."
  
  # Executa o script de sync via npm/tsx
  npm run athena-sync
  
  if [ $? -eq 0 ]; then
    echo "[$(date '+%H:%M:%S')] SUCESSO! Snapshot atualizado."
  else
    echo "[$(date '+%H:%M:%S')] FALHA! Ocorreu um erro na sincronização."
    echo "Verificando conexão/credenciais em 60 segundos..."
    sleep 60
    continue
  fi

  echo "Aguardando 15 minutos para a próxima rodada... (Não feche esta janela)"
  sleep 900
done
