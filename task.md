# Tarefas de Execução — Correção de Sprites no Editor de Mapas (GitHub Pages)

- [x] Etapa 1: Atualizar `src/lib/utils.ts` para tornar `getImageUrl` idempotente e suportar base path do Vite <!-- id: 0 -->
- [x] Etapa 2: Atualizar `src/core/data/tilesets.ts` e `src/utils/tilesetUtils.ts` para resolver os caminhos de sprites com `getImageUrl` <!-- id: 1 -->
- [x] Etapa 3: Atualizar `src/features/map-editor/components/MapEditorMenu.tsx` para usar `getImageUrl` no pré-carregamento e nas miniaturas <!-- id: 2 -->
- [x] Etapa 4: Atualizar `src/features/match-setup/components/DeployScreen.tsx` e `src/features/combat/components/BattleCanvas2D.tsx` <!-- id: 3 -->
- [x] Etapa 5: Atualizar `vite.config.ts` para detecção automática resiliente do base path em builds do GitHub Actions <!-- id: 4 -->
- [x] Etapa 6: Validação estática (`npm run lint`), build de produção com base `/call-of-war/` e atualização da documentação <!-- id: 5 -->
