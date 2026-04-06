# 🚚 Ciclo Total App — PAC Mission Control

> **Plataforma de inteligência operacional para o Ciclo Rodoviário da Rumo Logística.**
> Painel sinótico em tempo real, bot de análise via WhatsApp e automações de dados com AWS Athena.

---

## 📋 Visão Geral

O **Ciclo Total App** é um sistema interno composto por três módulos integrados:

| Módulo | Descrição |
|---|---|
| 🖥️ **PAC Mission Control** | Dashboard Next.js de monitoramento do Ciclo Rodoviário em tempo real |
| 🤖 **Analista Bot (WhatsApp)** | Bot offline (SQLite) que responde consultas operacionais via WhatsApp |
| ⚙️ **Automações de Dados** | Scripts de sincronização de snapshots Parquet com AWS Athena |

---

## 🏗️ Arquitetura

```
ciclo_total_app/
├── pac-mission-control/        # Next.js 14+ — Dashboard principal
│   ├── src/app/api/            # API Routes (backend)
│   ├── src/app/                # Pages & components (App Router)
│   └── scripts/                # sync-snapshot.ts e utilitários
├── Controle de Ciclo Rodoviario Rumo.app/  # macOS App Wrapper
├── ATUALIZAR_DADOS_AGORA.command           # Sync manual de dados
├── SINCRONIZACAO_AUTOMATICA.command        # Sync agendado
├── VERIFICAR_INTEGRIDADE.command           # Verificação de dados
├── Iniciar_PAC.command                     # Inicia o dashboard
├── Iniciar_ANALISTA.command                # Inicia o bot analista
└── Iniciar_WHATSAPP.command                # Inicia o bot WhatsApp
```

---

## 🛠️ Stack Tecnológica

- **Frontend:** Next.js 14+ (App Router), TailwindCSS
- **Backend:** Next.js API Routes, TypeScript
- **Dados:** AWS Athena (SDK v3), Snapshots Parquet (S3)
- **Bot:** SQLite (operação 100% offline), WhatsApp Web.js
- **Infra:** AWS (Athena + S3), macOS App Bundle, Shell Scripts
- **Testes:** Playwright

---

## 🚀 Início Rápido

### Pré-requisitos

- **Node.js** v18+
- **AWS CLI v2** instalado e configurado
- **Perfil SSO:** `rumo-sso` configurado (`aws configure sso`)

### Instalação

```bash
git clone https://github.com/Carlosps89/ciclo_total_app.git
cd ciclo_total_app/pac-mission-control
npm install
npx playwright install
```

### Configuração

Crie o arquivo `.env.local` dentro de `pac-mission-control/`:

```env
AWS_REGION=sa-east-1
AWS_PROFILE=rumo-sso
ATHENA_DATABASE=db_gmo_trusted
ATHENA_VIEW=vw_ciclo_v2
ATHENA_OUTPUT_S3=s3://seu-bucket-de-resultados/
```

### Execução

Via scripts macOS:
```bash
./Iniciar_PAC.command
./Iniciar_ANALISTA.command
./ATUALIZAR_DADOS_AGORA.command
```

Via npm:
```bash
cd pac-mission-control && npm run dev
```

Acesse: http://localhost:3000
Modo TV: http://localhost:3000?mode=tv

---

## 📊 Métricas Monitoradas

| Etapa | Medição |
|---|---|
| Aguardando Agendamento | Emissão NF -> Agendamento Criado |
| Tempo de Viagem | Agendamento Criado -> Chegada Terminal |
| Tempo Interno | Chegada Terminal -> Peso Saída |
| Antecipação | Chegada Terminal < Janela Início |

Ajuste os limites editando `thresholds.json`.

---

## 🧪 Testes

```bash
cd pac-mission-control
npx playwright test
```

---

## 🗂️ Branches

| Branch | Finalidade |
|---|---|
| main | Produção — código estável |
| develop | Integração de novas features |
| feature/* | Desenvolvimento de funcionalidades |
| hotfix/* | Correções urgentes em produção |

---

## 📝 Convenção de Commits

Padrão Conventional Commits:

- feat: Nova funcionalidade
- fix: Correção de bug
- docs: Atualização de documentação
- chore: Manutenção / dependências
- refactor: Refatoração de código
- perf: Melhoria de performance
- test: Adição/correção de testes

---

## 📄 Licença

Uso interno — Rumo Logística 2025-2026

Desenvolvido por Carlos Pereira (https://github.com/Carlosps89)
