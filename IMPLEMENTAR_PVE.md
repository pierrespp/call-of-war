# Plano de Ação: Implementação do Modo PVE

Este documento detalha as fases de desenvolvimento para a implementação do modo PVE (Player vs Environment) no VTT, garantindo que o sistema seja funcional, determinístico (sem uso de IAs pagas reais) e que integre de forma fluída com o sistema de combate atual e o Firebase.

## Fase 1: Estrutura de Dados e Interface Admin (Setup)
**Objetivo:** Preparar o banco de dados e as interfaces para suportar a criação de partidas PVE e o gerenciamento dos NPCs.

1. **Atualização de Tipagens e Firebase (`src/types/game.ts` e BD):**
   - Adicionar os modos de jogo: `pve-zombies` e `pve-tactical`.
   - Adicionar propriedades nas unidades para identificar se são controladas pela IA (ex: `isBot: true`, `botType: 'zombie' | 'tactical'`).
   - Propriedades globais pro bot Tático: Armazenar `LKP` (Last Known Position) e `PatrolPoints` no estado do jogo.

2. **Criação do Admin PVE (`src/features/admin/components/AdminPveMenu.tsx`):**
   - Menu acessível apenas aos administradores (semelhante ao AdminPanel atual).
   - Tela para criar e editar *Status de Bots Táticos* (HP, Armas, Atributos).
   - Tela para agrupar bots em *Times Pré-salvos* que poderão ser carregados nas salas.

3. **Criação de Partida PVE (`src/features/match-setup/components/CreateMatchMenu.tsx`):**
   - Inclusão dos *Radio Buttons* para escolher entre PVP (padrão) e PVE.
   - Se PVE -> Escolher Modo (`Zumbis` ou `Tático`).
   - Se `Zumbis` -> Input de *Quantidade* e *Dificuldade* (Normal/Difícil).
   - Se `Tático` -> Dropdown para selecionar o *Time Pré-Salvo* e *Dificuldade* (Normal/Difícil).

## Fase 2: Tela de Deploy e Posicionamento Inicial
**Objetivo:** Adaptar a etapa de posicionamento antes do início do primeiro turno.

1. **Lógica de Spawn Zumbi:**
   - Durante a fase de Deploy, o sistema irá automaticamente instanciar os Zumbis no extremo oposto do mapa em relação à área de deploy liberada aos jogadores.
   - Garantir que não nasçam em posições bloqueadas (paredes/obstáculos).

2. **Lógica de Spawn Tático e Pontos de Patrulha:**
   - Instanciar o Time Pré-salvo na extremidade do mapa.
   - Geração automática (ou manual pelo criador do mapa) de Waypoints de Patrulha no decorrer do mapa, que ficarão guardados na partida para quando não houver contato visual.

## Fase 3: Motor PVE (O "Cérebro" do Bot)
**Objetivo:** Construir as regras da máquina de estado determinística. Todo esse processamento rodará no navegador do **Host** (criador da sala) para não gerar custos de servidor, propagando as jogadas validadas para o Firestore.

1. **Módulo de Comportamento - Zumbis:**
   - **Mecânica de Faro (Scent):** O Zumbi fará uma busca circular de raio de 40 metros para achar o jogador mais próximo (baseado na pathfinding API para evitar paredes obstrutivas, se necessário).
   - Movimentação direta seguida de ataque Corpo a Corpo.

2. **Módulo de Comportamento - Time Tático:**
   - Compartilhamento Global de Informações: Se um bot ver um jogador, o `LKP` do jogador é salvo para todo o time.
   - **Comportamento Padrão (Sem visão/Sem LKP):** Move-se interligando Waypoints de Patrulha.
   - **Comportamento LKP:** Se não tem linha de visão natural, move-se na direção do Last Known Position.
   - **Engajamento (Normal):** Viu, moveu (para cobertura se possível) e atirou.
   - **Engajamento (Difícil):** 
     - Calculador de Rota por flanco.
     - Avaliação de Ameaça/Oportunidade (focar em Snipers ou personagens com HP baixo).
     - Uso de itens/habilidades de suporte.

## Fase 4: O Turno do Bot em Jogo
**Objetivo:** Fluidez visual e sincronização de turnos.

1. **Gerenciamento de Iniciativa:**
   - Quando for o turno do time bot (após o time dos jogadores), bloquear a interface visual dos jogadores.
   - O Client do Host iniciará um Loop assíncrono para iterar as unidades Bot.

2. **Ação Cadenciada (Animação e "Calma"):**
   - O Host envia a jogada do Bot 1 para o Firestore.
   - Uma pausa artificial (`setTimeout` / `delay`) é ativada (ex: 1.5 a 2 segundos) para o Client ler a atualização e movimentar visualmente o pin do inimigo na tela.
   - Em seguida, processa-se o próximo bot.
   - Finalizando todas as unidades da IA, o estado é alterado para o Turno dos Jogadores.

## Fase 5: Validação, Revisão e Balanceamento
**Objetivo:** Garantir a estabilidade via `firestore.rules` e testes da engine.

1. **Revisão de Segurança PVE (`firestore.rules`):**
   - Permitir operações de movimentação/ataque em units da IA caso o remetente seja o Host da sala (evitando trapaças por clientes injetados).
2. **Revisões de UI:**
   - Overlay amigável indicando "Turno do Inimigo..."
   - Revisão/aprimoramento do "LineOfSight" e "Pathfinding" para performance com a quantidade de bots gerados sem travar a interface do Host.
