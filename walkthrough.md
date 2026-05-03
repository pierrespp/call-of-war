# Walkthrough: Reestruturação do Combate e Armas

Este documento resume as implementações realizadas para trazer a jogabilidade tática do Call of War para o estilo XCOM (ações flexíveis) e permitir que todas as unidades tenham duas armas.

## 1. Fatiamento de Movimento
**Motivação:** No sistema antigo, mover a unidade bloqueava imediatamente o restante da capacidade de movimento daquele turno, engessando a jogabilidade (ex.: mover -> atirar encerrava o turno, não permitindo voltar para cobertura se sobrasse movimento).
**Implementação:**
- Em `server.ts` (`processMovementSteps`), o código que travava a variável `unit.actions.move = false` independentemente de quanto movimento sobrou foi removido.
- A ação de movimento continua sendo cobrada de acordo com os metros andados, mas a unidade agora só perde a Ação de Movimento (`M`) quando os "Meters" de movimento se esgotarem ou ao fazer uma transição irreversível no frontend (como iniciar o ataque, se configurado).

## 2. Sistema de Duas Armas (Primária e Secundária)
**Motivação:** Dar mais versatilidade tática sem desbalancear o Draft, permitindo armamentos como pistolas e facas/revólveres.
**Implementação:**
- **Tipos de Jogo (`src/types/game.ts`):** 
  - `weaponName` foi desdobrado em `primaryWeapon` e `secondaryWeapon`.
  - A munição agora é controlada individualmente via `primaryAmmoInMag` e `secondaryAmmoInMag`.
  - `activeWeaponSlot` controla qual arma a unidade está segurando.
- **Constantes de Balanceamento (`constants.ts`):** Adicionadas "Pistola Padrão" e "Revólver Padrão" valendo 0 pontos, sendo liberadas para todas as classes para servirem como secundárias por padrão.
- **Interface Gráfica:** 
  - `CreateMatchMenu.tsx` adaptado para exibir dois selects e calcular o custo de forma compatível.
  - O HUD principal (`App.tsx`) foi alterado para recuperar dano, pente, range e estatísticas apenas da arma "ativa" (`activeWeaponSlot`).
- **Backend (`server.ts`):** O cálculo das mecânicas de ataque, PVE e recarga foi adaptado para verificar as armas e a munição adequadas. Uma nova rota (`/switch-weapon`) foi criada para alterar o slot ativo.

## 3. Reclassificação das Ações (XCOM style)
**Motivação:** Maior agilidade e possibilidades (como trocar de arma ou fechar uma porta sem perder o tiro).
**Implementação:**
- A rota `/toggle-door` (abrir/fechar porta) foi alterada de `unit.actions.intervention` para usar `unit.actions.tactical`.
- A rota `/smoke-grenade` (arremessar Granada de Fumaça) foi alterada para `tactical` também, permitindo o famoso combo de "lançar fumaça" e depois "correr", sem perder a capacidade principal de atirar.
- O Frontend e os tooltips no Menu de Ações (M, I, T) em `App.tsx` foram atualizados para não permitir a execução dessas funções caso o jogador não tenha Ação Tática disponível.

## 4. Botão "Sair da Partida"
**Motivação:** Permitir que o jogador abandone uma partida ativa e retorne ao Lobby com segurança.
**Implementação:**
- **BattleSidebar.tsx**: Adição de um botão de ícone `LogOut` sutil no cabeçalho. O botão usa um hover em vermelho para indicar ação de saída.
- **App.tsx**: Implementação da função `handleLeaveMatch` que:
  - Solicita confirmação do usuário (`window.confirm`).
  - Limpa os dados da sessão no `apiService`.
  - Reseta os estados de `session` e `roomState`.
  - Navega o usuário de volta para o estado `'lobby'`.
