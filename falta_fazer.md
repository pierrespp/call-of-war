# Lista de Tarefas (Falta Fazer)

## 1. Interface e Persistência de Exércitos (Loadouts)
- [ ] Criar componente de lista lateral para Saved Armies.
- [ ] Implementar botão "Salvar Exército Atual" com input de nome.
- [ ] Integrar com Firestore para persistência individual.
- [ ] Permitir carregar um exército salvo substituindo a seleção atual.

## 2. Movimentação Tática
- [ ] Modificar `src/utils/pathfinding.ts` para ignorar colisão com aliados durante o cálculo do caminho.
- [ ] Garantir que a validação final impeça terminar o movimento em cima de um aliado.

## 3. Visibilidade e Fog of War (Desafio Técnico)
- [ ] Criar estado local no `App.tsx` para `lastSeenPositions` (vultos).
- [ ] Implementar filtro de visibilidade: `token.visible = isAlly || hasLOS`.
- [ ] Se um inimigo for visível, atualizar sua `lastSeenPosition`.
- [ ] Renderizar vultos (tokens semi-transparentes ou ícones de dúvida) nas `lastSeenPositions` quando o token real estiver oculto.

## 4. Controle de UI (Indicadores)
- [ ] Adicionar estado `showIndicators` no App.
- [ ] Criar botão de alternância no header/topo da partida.
- [ ] Vincular a visibilidade dos overlays de cobertura a esse estado.

## 5. Refinamento de Componentes
- [ ] Ajustar `SoldiersInfoMenu.tsx` ou similar para suportar a lista lateral organizacional.
