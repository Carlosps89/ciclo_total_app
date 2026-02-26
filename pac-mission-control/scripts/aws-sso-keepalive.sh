#!/bin/bash

# Configurações
PROFILE="rumo-sso"
DIR="/Users/carlospereira/ciclo_total_app/pac-mission-control"
LOG_FILE="$DIR/scripts/aws-auth.log"

# Garante que o diretório de execução está correto
cd "$DIR" || exit

# Adiciona timestamp ao log
echo "--- Verificação em: $(date) ---" >> "$LOG_FILE"

# 1. Verifica se a sessão AWS SSO está ativa
# O comando get-caller-identity falha se o token estiver expirado
if ! aws sts get-caller-identity --profile "$PROFILE" >> "$LOG_FILE" 2>&1; then
    echo "[!] Sessão expirada. Iniciando login automático..." >> "$LOG_FILE"
    # Executa o login. 
    # NOTA: No Mac, isso abrirá o navegador. 
    # Se o usuário não precisa clicar em nada (automação local), o processo concluirá sozinho.
    aws sso login --profile "$PROFILE" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        echo "[✓] Login realizado com sucesso." >> "$LOG_FILE"
    else
        echo "[X] Erro ao tentar realizar o login." >> "$LOG_FILE"
    fi
else
    echo "[✓] Sessão ativa e válida." >> "$LOG_FILE"
fi
