# Criação Temática dos Três Mapas: Cidade em Ruínas, Selva com Rio e Acampamento na Floresta

## Persona Ativa
- **GameDesigner** (`agents/GameDesigner.md`) — Liderando a concepção tática, imersão, "Game Feel" e balanceamento de linhas de tiro e travessias.
- **GameDevExpert** (`agents/GameDevExpert.md`) — Arquitetura de dados de tilesets, normalização de caminhos e renderização no Canvas API a 60 FPS.
- **UIUXMaster** (`agents/UIUXMaster.md`) — Estética tática militar dos novos sprites SVG modulares e feedback visual no Editor de Mapas.

---

## Contexto e Objetivos

O usuário solicitou a criação de três mapas utilizando o Editor de Mapas, seguindo estritamente a identidade e a temática do nome de cada um:
1. **Cidade em Ruínas** (`cidade_ruinas`): Cenário urbano pós-apocalíptico / zona de guerra devastada, com avenidas esburacadas, prédios com janelas e portas funcionais, carcaças de veículos, barricadas de concreto e entulho.
2. **Selva com Rio** (`selva_rio`): Selva tropical cortada por um rio caudaloso (com mecânica de penalidade de movimento em água), vaus rasos de travessia, pontes de madeira rústicas, vegetação densa, rochedos e troncos caídos para cobertura.
3. **Acampamento na Floresta** (`acampamento`): Posto militar avançado / acampamento fortificado em clareira, com paliçadas de madeira, tendas de campanha, depósitos de caixas de suprimento, fogueiras/tambores e bosques circundantes para flanqueamento.

Todos os mapas devem ter:
- Tamanho canônico de **40×40 células** (2000×2000 pixels).
- **Zonas de Deploy estritamente válidas** (9 células contíguas 3×3 para Equipe A e 9 células contíguas 3×3 para Equipe B), atendendo às regras do `validateDeployZones`.
- **Pontos de Spawn PvE** e **Zona de Extração PvE** para suporte completo aos modos Zumbis e Fuga Tática.
- Suporte a edição completa no **Editor de Mapas (`MapEditorMenu`)**, visualização nas telas de **Deploy** e combate no **BattleCanvas2D**.
- Compatibilidade total tanto em ambiente local/Firestore quanto estático no **GitHub Pages** (fallback integrado).

---

## User Review Required

> [!IMPORTANT]
> - **Nenhuma regra do Firebase Firestore (`firestore.rules`) será alterada.**
> - Os mapas são criados com base nas imagens de fundo já existentes em `public/maps/` (`cidade_ruinas.jpg`, `selva_rio.jpg`, `acampamento.jpg`) e sobrepostos com a malha tática de sprites e coberturas.
> - Serão criados dois novos conjuntos de sprites modulares em SVG: **Selva & Rios** (`public/tiles/nature/`) e **Acampamento Militar** (`public/tiles/camp/`).

---

## Proposta de Solução Detalhada

### 1. Criação dos Novos Sprites e Tilesets Modulares (SVGs)
Para dar vida à Selva e ao Acampamento com o mesmo padrão tático do tileset urbano:
- **Tileset `nature_jungle` (Selva & Ambientes Naturais)**:
  - `dirt_trail.svg` (Chão / trilha de terra batida — sem cobertura)
  - `dense_foliage.svg` (Arbustos tropicais / moitas — meia cobertura `-20%`)
  - `river_water.svg` (Água corrente do rio — custa 3m de movimento por célula)
  - `shallow_water.svg` (Vau com pedras de rio — travessia tática)
  - `wooden_bridge.svg` (Ponte de troncos/tábuas sobre o rio — chão regular)
  - `rock_boulder.svg` (Rochedo vulcânico maciço — cobertura total `-40%`)
  - `fallen_tree.svg` (Tronco caído na mata — meia cobertura `-20%`)
  - `jungle_thick.svg` (Mata fechada densa — bloqueio sólido de visão e tiro / parede)
- **Tileset `military_camp` (Acampamento & Base Militar)**:
  - `military_tent.svg` (Tenda de comando camuflada — bloqueio visual / parede)
  - `wooden_palisade.svg` (Cerca / paliçada defensiva — parede)
  - `sandbag_bunker.svg` (Bunker entrincheirado — cobertura total `-40%`)
  - `campfire_site.svg` (Fogueira / tambor de fogo — meia cobertura `-20%`)
  - `supply_cache.svg` (Caixas militares de munição/suprimentos — meia cobertura `-20%`)
  - `watchtower_base.svg` (Pilar de torre de vigia — cobertura total)

### 2. Registros dos Tilesets no Sistema
- Criar `src/core/data/natureManifest.ts` e `src/core/data/campManifest.ts`.
- Atualizar `src/core/data/tilesets.ts` para registrar `BUILTIN_TILESETS` contendo `urban_ruins`, `nature_jungle` e `military_camp`.

### 3. Geradores Táticos Procedurais dos 3 Temas (`src/utils/tilesetUtils.ts`)
- Implementar as funções:
  - `generateUrbanTacticalPreset`: Refinada para a Cidade em Ruínas (edifícios arruinados, entulho, barricadas, 2 zonas de deploy 3×3, spawns PvE e extração).
  - `generateJungleRiverPreset`: Cria um rio sinuoso cortando o mapa com 2 vaus/pontes, mata densa nas bordas, trilhas de aproximação, zonas de deploy nas margens opostas e extração ribeirinha.
  - `generateForestCampPreset`: Cria um perímetro de paliçadas com guarita, tendas militares, fogueira, estoques de suprimentos, zona de deploy invasora na floresta ao sul e defensora dentro do acampamento.

### 4. Módulo de Dados Padrão dos Mapas (`src/core/data/defaultMapsData.ts`)
- Pré-calcular e exportar os dados canônicos (`tiles`, `cover`, `gridSettings`) para os 3 mapas.
- Isso garante que:
  - No **GitHub Pages**, os 3 mapas abrem imediatamente completos e jogáveis, mesmo sem backend Express/Firestore.
  - No **servidor Express (`server.ts`)**, os mapas são carregados como fallback automático caso o Firestore ainda não possua registros salvos.

### 5. Atualização da Interface do Editor de Mapas (`MapEditorMenu.tsx`)
- Adicionar botões de ação rápida para carregar ou restaurar o layout temático de cada mapa:
  - "Gerar Layout Cidade em Ruínas"
  - "Gerar Layout Selva com Rio"
  - "Gerar Layout Acampamento na Floresta"
- Ao selecionar um mapa no dropdown, se não houver dados salvos no servidor/Firestore, carregar o layout temático correspondente.
- Atualizar a lista de tilesets ativos para permitir alternar entre "Zona Urbana", "Selva & Rio" e "Acampamento Militar".

### 6. Sincronização e Inicialização no Backend (`server.ts`)
- Em `loadGlobalTileData()` e `loadGlobalCoverData()`, injetar os dados de `defaultMapsData` como baseline padrão para `cidade_ruinas`, `selva_rio` e `acampamento`.

---

## Arquivos Afetados

| Arquivo | Ação | Descrição |
| :--- | :--- | :--- |
| `public/tiles/nature/*.svg` | [NEW] | 8 novos sprites temáticos de selva, rio, rochas, folhagem e pontes. |
| `public/tiles/camp/*.svg` | [NEW] | 6 novos sprites temáticos de acampamento militar, tendas, fogueira e paliçadas. |
| `src/core/data/natureManifest.ts` | [NEW] | Manifesto de dados do tileset de Selva & Ambientes Naturais. |
| `src/core/data/campManifest.ts` | [NEW] | Manifesto de dados do tileset de Acampamento Militar. |
| `src/core/data/defaultMapsData.ts` | [NEW] | Dados canônicos pré-definidos dos 3 mapas (tiles, covers e zonas). |
| `src/core/data/tilesets.ts` | [MODIFY] | Registro dos 3 tilesets integrados em `BUILTIN_TILESETS`. |
| `src/utils/tilesetUtils.ts` | [MODIFY] | Implementação dos geradores táticos para Selva com Rio e Acampamento na Floresta. |
| `src/features/map-editor/components/MapEditorMenu.tsx` | [MODIFY] | Seletor de tilesets temáticos e botões de geração rápida para cada mapa. |
| `server.ts` | [MODIFY] | Hidratação dos mapas padrão no backend caso não existam no Firestore. |

---

## Plano de Verificação

### 1. Validação Estática e TypeScript
- Executar `npm run lint` (`tsc --noEmit`) para garantir ausência total de erros de compilação.

### 2. Validação das Regras Táticas de Deploy
- Testar via script ou asserção que `validateDeployZones` retorna `ok: true` com exatamente 9 células contíguas para a Equipe A e 9 para a Equipe B nos 3 mapas.

### 3. Validação Visual e Navegação com Browser Subagent
- Iniciar o servidor local.
- Utilizar o `browser_subagent` para abrir o Editor de Mapas (`/` -> "Editor de Mapas").
- Carregar alternadamente:
  - "Cidade em Ruínas"
  - "Selva com Rio"
  - "Acampamento na Floresta"
- Capturar telas/screenshots comprovando a renderização dos sprites, zonas de deploy A e B, pontos de spawn PvE e extração.
- Testar pintura com novos sprites no Canvas.

### 4. Bateria de Testes E2E (Playwright)
- Executar `npx playwright test` para certificar que nenhum modo existente (PvP, PvE Zumbis, PvE Tático) sofreu regressão.
