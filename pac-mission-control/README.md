# PAC Mission Control - Painel Sinótico

Painel de controle em tempo real para o Ciclo Rodoviário (PAC), focado em performance (<3s de leitura) e visualização "Mission Control".

## 🚀 Como Rodar

### Pré-requisitos
1. **Node.js**: v18+
2. **AWS CLI v2**: Instalado e configurado.
3. **Perfil SSO**: Configure o perfil `rumo-sso` (ou ajuste no `.env.local`).

### Instalação
```bash
cd pac-mission-control
npm install
npx playwright install # Para testes
```

### Configuração
Crie/Edite o arquivo `.env.local`:
```env
AWS_REGION=sa-east-1
AWS_PROFILE=rumo-sso
ATHENA_DATABASE=db_gmo_trusted
ATHENA_VIEW=vw_ciclo_v2
ATHENA_OUTPUT_S3=s3://seu-bucket-de-resultados/
```

### Execução
```bash
npm run dev
```
Acesse: [http://localhost:3000](http://localhost:3000)

**Modo TV (Sem scroll, fontes maiores):**
[http://localhost:3000?mode=tv](http://localhost:3000?mode=tv)

## 🏗 Arquitetura

- **Frontend**: Next.js 14+ (App Router), TailwindCSS.
- **Backend API**: Next.js API Routes (`src/app/api/...`).
- **Dados**: AWS Athena (via SDK v3).
- **Cache**: Em memória (60s TTL) para evitar custos excessivos do Athena.
- **Schema Discovery**: O sistema tenta identificar automaticamente as colunas da view `vw_ciclo_v2`.

## 🧪 Testes

Rodar testes automatizados (Playwright):
```bash
npx playwright test
```

## 📊 Métricas

- **Aguardando Agendamento**: `Emissão NF` -> `Agendamento Criado`
- **Tempo de Viagem**: `Agendamento Criado` -> `Chegada Terminal`
- **Tempo Interno**: `Chegada Terminal` -> `Peso Saída`
- **Antecipação**: `Chegada Terminal` < `Janela Início`

## 🚦 Configuração de Limites

Edite `thresholds.json` para ajustar as metas e fatores de alerta (Amarelo/Vermelho) para cada etapa.
