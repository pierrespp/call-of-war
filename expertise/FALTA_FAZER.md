# Controle de Tarefas e Progresso

## Ecossistema de Agentes Especializados (Concluídos)
- [x] **Criação da Estrutura**: Criada a pasta `/agents/` contendo as Personas focadas em alta performance e qualidade.
- [x] **GameDevExpert**: Implementado com foco em React 19, TypeScript estrito, ausência de `any` e otimização do Canvas.
- [x] **UIUXMaster**: Implementado para garantir beleza tática, animações fluidas e design premium Triple-A.
- [x] **BalanceAnalyst**: Implementado com foco em Chain of Thought, cálculo rigoroso de Time-To-Kill e controle de orçamento de pontos.
- [x] **QATester**: Implementado para buscar casos de borda, falhas de sincronização no Firebase e testes negativos.
- [x] **GameDesigner**: Implementado para garantir 'Game Feel', assimetria de facções e clareza de feedback visual.
- [x] **SecuritySpecialist**: Implementado para desconfiar do frontend, auditar as `firestore.rules` e focar em sanitização no Express.
- [x] **Orquestração**: O arquivo principal `AGENTS.md` e o `expertise/ARQUITETURA.md` foram atualizados para integrar este novo fluxo de inteligência na Fase 1 de Planejamento.

## Refinamento Visual Premium (Fase 1 Concluída)
- [x] **Fundação de Design**: Implementação de design tokens globais em \src/index.css\ focados em *Glassmorphism* e micro-interações.
- [x] **Draft Tático (Draft Match)**: Interface de criação de partidas totalmente modernizada com cards animados, barras de progresso táticas e hierarquia visual premium.
- [x] **HUD de Combate**: Sidebar e Log de combate refatorados com estética de \Command Center\, utilizando opacidades dinâmicas, animações \framer-motion\ e botões táticos.
- [x] **Refatoração Estética e Padronização UI**: Implementação de `ScreenWrapper` centralizado, eliminação de regressões de fundo preto sólido e conversão de todas as sub-telas para *glassmorphism* tático militar.
- [x] **Iluminação e Background Dinâmico (Menu de Criação)**: Implementação de fundo dinâmico baseado no mapa, refinamento de contrastes e aplicação de "rim lighting" nos painéis de draft para eliminar a sensação de interface escura (UIUXMaster).
- [x] **Restauração de Tooltips Táticos (Menu de Criação)**: Implementação de descrições técnicas detalhadas (HP, Dano, Range, etc.) via atributos `title` em todos os elementos de seleção de exército para melhorar a usabilidade e o entendimento das mecânicas.
- [x] **Botão "Sair da Partida"**: Implementado botão de saída sutil com confirmação de segurança integrado ao HUD de batalha (UIUXMaster).
- [x] **Efeitos de Partículas, Impacto e Trajetórias com Glow**: Implementado `CombatVfxCanvas.tsx` com motor nativo 2D de 60 FPS integrado ao `BattleCanvas2D`. Inclui feixes balísticos fluorescentes com cauda de rastro e glow emissivo por classe de arma (Sniper azul ciano, Fuzil dourado/âmbar, Granadeiro fogo/laranja), clarão de disparo (muzzle flash) com fumaça, faíscas de ricochete metálico para alvos em armadura/cobertura, respingos de sangue direcionais em acertos e estroboscópio estelar em críticos, além de explosões volumétricas com onda de choque e estilhaços para granadas (UIUXMaster / GameDevExpert).

## Editor de Mapas Modular e Sistema de Tilesets (Concluído)
- [x] **Fundação de Tilesets & Presets Táticos**: Criado o modelo de dados `TileDefinition`, `TileSet` e `MapTileData` com o tileset urbano (`urban_ruins`) contendo asfalto, calçadas, paredes de concreto, sacos de areia, carros sedan, caçambas de lixo, poças de água e portas/janelas funcionais.
- [x] **Conversor Automático de Cobertura**: Desenvolvido `deriveCoverDataFromTiles` para traduzir diretamente os sprites carimbados em coberturas mecânicas (`half`, `full`, `wall`, `water`, etc.), mantendo zonas de deploy e spawns especiais preservados.
- [x] **Backend & Persistência de Tiles**: Adicionadas rotas `/api/maps/:mapId/tiles` (GET/POST) com hidratação e sincronização no Firestore + cache em memória e sincronização em tempo real com `saveMapCover`.
- [x] **Paleta de Sprites no Editor (`MapEditorMenu`)**: Adicionada UI com miniaturas categorizadas por abas (Terrenos, Paredes, Coberturas/Props, Líquidos, Portas/Janelas), ferramenta de rotação 0°/90°/180°/270°, borracha, carimbo contínuo e renderização no Canvas 60 FPS com cache de imagens.
- [x] **Renderização de Tiles na Batalha (`BattleCanvas2D`)**: Integrada a camada de tiles modulares carimbados na tela de combate para que qualquer mapa editado com sprites apareça instantaneamente na gameplay de combate tático.
- [x] **Otimização de Performance e Canvas Buffer (`BattleCanvas2D`)**: Camada de tiles migrada para Canvas de alta performance com pré-renderização e cache de texturas em memória, eliminando a criação de centenas de nós DOM e garantindo 60 FPS estáveis em mapas grandes de até 40×80.
- [x] **Procedural Urban Preset Generator & Mission Integration**: Implementada geração procedural de avenidas, calçadas, prédios com janelas/portas, barreiras e zonas de deploy (`generateUrbanTacticalPreset`), validador de manifests externos (`validateTileSetManifest`) e atalho de geração rápida no `MapEditorMenu`.

## Correções e Estabilização
- [x] **Renderização Fiel do Mapa na Tela de Deploy**: Integrado o suporte a `imagePath` e renderização em Canvas de sprites de tilesets modulares em `DeployScreen.tsx`, eliminando a imagem quebrada e garantindo fidelidade visual idêntica à batalha.
- [x] **Otimização de Início de Partida**: Otimizado `server.ts` com cache em memória e persistência assíncrona no Firestore, sincronização imediata pós-"Pronto" no frontend e transição não-bloqueante para carregamento instantâneo da partida.
- [x] **Correção de Ações de Combate (Frontend)**: Resolvido bug onde os botões "Mover" e "Atirar" estavam desabilitados devido a divergência nos nomes das propriedades `actions` (`movement` -> `move` e `shooting` -> `intervention`).
- [x] **Clarificação de Slots de Armas**: Documentada e explicada a mecânica de `slots` (capacidade de acessórios) para o usuário.
- [x] **Correção Estrutural de Scroll**: Implementação de altura fixa (`h-screen`) no `ScreenWrapper` e remoção de `justify-center` para permitir rolagem fluida em telas longas sem depender do scroll global do navegador.
- [x] **Restauração de Modos de Jogo**: Re-implementado o seletor de modo (PvP vs PvE Zumbis) na tela de criação de partida, permitindo ao Jogador A alternar operações táticas.
- [x] **Estabilização de Texturas 3D**: Resolvido crash `Could not load : undefined` no Canvas ao iniciar partidas. Implementada normalização via `getRoleImage` e guardas de validade no componente `Unit3D`.
- [x] **Automação de Testes E2E (Playwright) & Chrome Remote Debugging**: Configurado Playwright com Chromium e script de depuração remota do Chrome na porta 9222. Bateria de testes `tests/e2e-game-modes.spec.ts` executada com sucesso completando 10 rodadas em todos os 3 modos de jogo (PvP, PvE Zumbis e PvE Tático) (QATester).

## Correções Realizadas a Partir dos Testes E2E (Concluídas)
- [x] **Correção do Retorno à Batalha Ativa no Lobby**: Removida a trava `&& appState !== 'lobby'` em `App.tsx`, permitindo reconexão instantânea para qualquer jogador com partida ativa ao atualizar a página.
- [x] **Correção de Ação para Disparo da IA Tática**: Atualizado `usePveEngine.ts`, `server.ts` e `apiService.ts` para validar e consumir `actions.intervention` em vez de `tactical`, suportando `/pass-action` com `intervention`.
- [x] **Detecção de Modos PvE no HUD de Batalha**: Atualizado `isPveMode` em `App.tsx` para cobrir `'pve-zombies'` e `'pve-tactical'`, reativando os botões de radar (revelar mapa) e painel PvE.
- [x] **Adição do Modo "Tático (PVE)" no Menu de Draft**: Adicionado botão "TÁTICO (PVE)" com suporte à Operação Fuga Silenciosa em `CreateMatchMenu.tsx` com paleta âmbar temática e textos operacionais.
- [x] **Tipagem Estrita de withError**: Corrigida a função genérica `withError<T>` em `App.tsx` para retornar o resultado de chamadas da API sem erros de compilador TypeScript (`npm run lint` 100% limpo).
- [x] **Correção de Resolução de Sprites no GitHub Pages**: Resolvido problema em que sprites modulares do Editor de Mapas e telas de Deploy/Combate apareciam sem imagem (404 Not Found) ao hospedar no subcaminho `/call-of-war/`. A função `getImageUrl` foi tornada idempotente, resiliente a ambientes Node e Vite, `BUILTIN_TILESETS` e `createTileLookup` normalizam caminhos na fonte, e `MapEditorMenu.tsx`, `DeployScreen.tsx` e `BattleCanvas2D.tsx` foram atualizados para aplicar `getImageUrl`. Também foi extraído `urbanManifest.ts` para eliminar avisos de importação estática do diretório `public/` (GameDevExpert).

## Criação dos Mapas Temáticos no Editor de Mapas (Concluído)
- [x] **Novos Tilesets Modulares (SVG)**: Criados os tilesets `nature_jungle` (Selva Tropical & Rios) com 8 sprites e `military_camp` (Acampamento & Base Militar) com 6 sprites, incluindo água com correnteza (custo 3m), vaus rasos, pontes de madeira, rochas vulcânicas, folhagem densa, troncos caídos, tendas de comando, paliçadas defensivas, bunkers de sacos de areia, depósitos de munição e torres de vigia.
- [x] **Geradores Procedurais e Dados Canônicos**: Implementados `generateJungleRiverPreset`, `generateForestCampPreset` e o módulo centralizado `defaultMapsData.ts`. Os três mapas (Cidade em Ruínas, Selva com Rio e Acampamento na Floresta) possuem grids 40×40 canônicos com regras táticas estritas: exatamente 9 células contíguas 3×3 de deploy para Equipe A e 9 para Equipe B (`validateDeployZones`), além de pontos de spawn PvE e zonas de extração.
- [x] **Atualização do Editor de Mapas (`MapEditorMenu.tsx`)**: Integrado seletor dinâmico de tileset na paleta de sprites, botões de ação rápida para carregar ou restaurar o layout temático de qualquer um dos 3 mapas e fallback automático para os dados canônicos em ambientes offline/GitHub Pages.
- [x] **Hidratação e Fallback no Servidor (`server.ts`)**: Adicionado fallback para `CANONICAL_MAP_DATA` nas rotas `/api/maps/:mapId/tiles`, `/api/maps/:mapId/cover`, `/api/maps/:mapId/grid-settings` e na função `getRoomCover`, assegurando consistência total para combate e editor.
- [x] **Validação Integral**: Testes unitários de regras táticas executados com 100% de sucesso, verificação visual via subagente de browser cobrindo os 3 mapas e paletas no editor, e bateria de testes E2E do Playwright passando com 4/4 testes aprovados.

## Estabilização de Assets e Editor de Mapas (Concluído)
- [x] **Autocentralização da Câmera no Editor de Mapas (`MapEditorMenu.tsx`)**: Eliminado o comportamento de "tela preta" onde a câmera iniciava e resetava em `(0, 0)` ao trocar de mapa. Implementada a função `centerCameraOnMap` com enquadramento proporcional ao container e botões flutuantes de Centralização e Zoom (GameDevExpert / UIUXMaster).
- [x] **Restauração de Imagens Binárias Corrompidas**: Identificada corrupção de encoding UTF-8 (`efbfbd`) nos arquivos de `public/maps/` (`acampamento.jpg`, `cidade_ruinas.jpg`, `selva_rio.jpg`) e `public/roles/` (`assalto.png`, etc.). Os binários originais válidos (`89504e47`) foram restaurados em modo binário puro a partir da pasta limpa do projeto.
- [x] **Compatibilidade Universal de Assets (GitHub Pages + Render)**: Atualizado `MapContext.tsx`, `BattleCanvas2D.tsx`, `DeployScreen.tsx`, `CreateMatchMenu.tsx` e `MapEditorMenu.tsx` para garantir o uso de `getImageUrl` e `VITE_API_URL`, assegurando carregamento correto tanto no subdiretório `/call-of-war/` do GitHub Pages quanto no servidor Express no Render.
- [x] **Desbloqueio de Início de Partida & Fallback Resiliente de API**: Corrigida a condição impeditiva `&& appState !== 'createMatch'` em `App.tsx` que impedia o criador da partida de avançar para a fase de deploy ao clicar em "Iniciar Missão". Implementado fallback automático para a URL do Render em builds de produção de `apiService.ts` e adicionado favicon SVG em `index.html` para eliminar erros 404 no console (GameDevExpert / QATester).

