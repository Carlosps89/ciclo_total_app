---
name: pac-operational-manual
description: Skill para suporte operacional e treinamento do Centro de Controle Rodoviário (CCO). Contém o manual visual, explicação de fluxos operacionais, simuladores e diagnósticos.
---

# 📚 Skill: Suporte Operacional PAC Mission Control

**Objetivo:** Esta skill capacita a IA a atuar como um mentor operacional para o time do **Centro de Controle Rodoviário (CCO)**. Ela contém o mapeamento visual de todas as telas, botões e procedimentos de suporte para o sistema PAC Mission Control.

---

## 📖 Como Usar esta Skill
Sempre que o usuário (ou outro agente) tiver dúvidas sobre **COMO usar** o sistema, siga estas diretrizes:

1.  **Consulte o Manual Visual:** Utilize o arquivo [application_manual.md](./resources/application_manual.md) para descrições detalhadas.
2.  **Referência ao PDF:** Lembre o usuário de que existe uma versão diagramada e pronta para impressão em [application_manual.pdf](./resources/application_manual.pdf).
3.  **Explicação Visual:** Ao explicar uma função, cite os elementos visuais (cores dos cards, ícones, nomes dos botões) conforme documentado no manual.

---

## 🚀 Fluxos Operacionais Principais

### 1. Gestão de Meta (Simulador)
- **Quando usar:** Quando o ciclo médio do mês estiver acima de 40h.
- **Ação:** Instruir o usuário a usar o `Simulador de Meta` para calcular o "Ciclo Necessário" nas próximas cargas para recuperar o indicador.

### 2. Diagnóstico de Atrasos (Outliers)
- **Quando usar:** Quando houver picos inexplicáveis no ciclo.
- **Ação:** Abrir o `Motor de Diagnóstico`, identificar a etapa ofensora (Viagem, Interno, etc.) e realizar o `Drilldown` para listar as placas dos veículos responsáveis.

### 3. Identificação de Gargalos (Real-Time)
- **Quando usar:** Para verificar represamentos no fluxo atual.
- **Ação:** Utilizar a tela de `Ciclo por Etapas em Tempo Real` para ver caminhões parados em etapas críticas.

---

## 🛠️ Procedimentos de Suporte Técnico
Se o sistema apresentar problemas de dados:
1.  **Credenciais:** Se houver erro de acesso, instrua a rodar `aws sso login`.
2.  **Sazonalidade:** Se os dados parecerem estranhos, verifique o `Histórico` para ver se não é um padrão recorrente daquele dia/turno.

---

## 📂 Recursos da Skill
- [Manual em Markdown](./resources/application_manual.md)
- [Manual em PDF (Para Impressão)](./resources/application_manual.pdf)
- **Screenshots:** Localizados na pasta `./resources/`.

---

**Nota:** Esta skill deve ser usada em conjunto com a `pac-mission-control-knowledge` para garantir que o suporte operacional esteja alinhado com as regras técnicas do motor de dados.
