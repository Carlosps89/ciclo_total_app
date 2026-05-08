# Skill: PAC Operational Intelligence

Esta skill documenta o modelo de inteligência operada pelo **PAC Mission Control**, definindo como a IA deve interpretar os buffers logísticos e emitir recomendações.

## 📊 Modelo de Buffers (Ocupação Segmentada)

A inteligência não olha mais para a "Inércia" como um bloco único. O fluxo foi quebrado em 5 buffers críticos para identificar onde o tempo é perdido:

1.  **Buffer 0: AGUARDANDO AGENDAMENTO (Pre-Scheduling)**
    -   **Definição**: Período entre a `dt_inicio` (ou dt_emissao) até a *Criação do Agendamento*.
    -   **Significado**: Indica o tempo em que a carga existe no sistema, mas ainda nem ganhou uma janela de chegada.

2.  **Buffer 1: PROGRAMADO (Pre-Arrival)**
    -   **Definição**: Período da *Criação do Agendamento* até a *Janela de Chegada* ou o *Cheguei* (o que vier primeiro).
    -   **Significado**: Indica o volume de veículos agendados que ainda não iniciaram a aproximação terminal. Se o veículo ultrapassar a janela sem "chegar", ele sai dessa estatística.

3.  **Buffer 2: FILA EXTERNA (Triagem)**
    -   **Definição**: Período entre o *Cheguei* e a *Chamada* para o pátio.
    -   **Regra de Ouro**: Se a média diária projetada for **> 300 caminhões**, o sistema deve emitir o **PRIMEIRO AVISO** de risco de saturação.

3.  **Buffer 3: EM TRÂNSITO EXTERNO (Deslocamento)**
    -   **Definição**: Período entre a *Chamada* e a entrada efetiva no pátio de classificação (*Chegada*).
    -   **Significado**: Mede a fluidez entre a zona de espera e a zona de operação.

4.  **Buffer 4: FILA INTERNA (Operação)**
    -   **Definição**: Período entre a *Chegada* na classificação e o *Peso de Saída* final.
    -   **Significado**: Mede a eficiência do terminal (moagem/carregamento) de forma isolada.

## 🤖 Regras de Decisão da IA (Gemini 1.5 Pro)

A IA deve seguir esta hierarquia de decisão:

-   **Alerta de Fila**: Se `Buffer 2 > 300` -> Prioridade máxima. Ação: Bloquear antecipações e alertar transbordo.
-   **Estouro de Meta**: Se `Ciclo Total Projetado > Meta (${meta_h}h)` -> Ação: Reduzir Janela de Antecipação para 0h.
-   **Análise de Correlação**: A IA deve explicar qual buffer está "inflado". Ex: *"O aumento no ciclo de 48h é causado por excesso no Buffer 4 (Interno), indicando lentidão na classificação, e não falta de pátio externo."*

## 🛠 Memória de Cálculo

-   **Load (Ocupação)**: Calculado como a `Soma de Horas de Permanência / 24`. Representa quantos veículos "equivalentes" estão parados naquele buffer 100% do tempo.
-   **Sazonalidade**: O motor Python (Prophet) usa os últimos 90 dias para projetar o comportamento de cada buffer de forma independente.
