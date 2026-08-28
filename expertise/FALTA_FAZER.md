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
- [x] **Sincronização e Polling Tático**: Implementação de guardas no pooling para evitar transições automáticas de fase (efeito 'ímã') enquanto o usuário está no Lobby, garantindo controle manual da navegação.
- [x] **Restauração de Modos de Jogo**: Re-implementado o seletor de modo (PvP vs PvE Zumbis) na tela de criação de partida, permitindo ao Jogador A alternar operações táticas.
- [x] **Estabilização de Texturas 3D**: Resolvido crash `Could not load : undefined` no Canvas ao iniciar partidas. Implementada normalização via `getRoleImage` e guardas de validade no componente `Unit3D`.
