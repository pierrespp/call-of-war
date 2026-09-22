# Correção de Carregamento de Sprites no Editor de Mapas (GitHub Pages)

## Persona Ativa
- **GameDevExpert** (`agents/GameDevExpert.md`) — Engenheiro de Software & TypeScript com foco em Canvas API, Vite e tipagem estrita.

---

## Contexto e Diagnóstico

Ao acessar a aplicação através da URL do GitHub Pages (`https://pierrespp.github.io/call-of-war/`), as imagens dos sprites na **Paleta de Sprites** do Editor de Mapas e na renderização do **Canvas de Tiles** aparecem vazias ou com ícone quebrado.

### Causa Raiz Identificada
1. No arquivo `public/tiles/urban/manifest.json`, os caminhos das imagens foram definidos com barra absoluta na raiz, por exemplo: `"/tiles/urban/asphalt_clean.svg"`.
2. No componente `src/features/map-editor/components/MapEditorMenu.tsx`, as miniaturas da paleta (`<img src={tile.imagePath} />`) e o pré-carregamento em memória para o Canvas (`img.src = t.imagePath`) consom esses caminhos sem considerar o subcaminho base do repositório no GitHub Pages (`/call-of-war/`).
3. Com isso, o navegador tenta carregar:
   - `https://pierrespp.github.io/tiles/urban/asphalt_clean.svg` ➔ **404 Not Found**.
   - Quando a URL correta no GitHub Pages é: `https://pierrespp.github.io/call-of-war/tiles/urban/asphalt_clean.svg` (que retorna **200 OK**).
4. O mesmo comportamento ocorre em `DeployScreen.tsx` e `BattleCanvas2D.tsx` ao carregar tiles no Canvas de combate.

---

## Proposta de Solução

Adotar uma abordagem em camadas: **centralizada** e **defensiva**, garantindo que todos os assets estáticos funcionem tanto em ambiente de desenvolvimento local (`localhost:3000/`) quanto no GitHub Pages (`https://pierrespp.github.io/call-of-war/`), além de prevenir regressões se a aplicação for migrada para qualquer outro domínio ou subdiretório.

### 1. Robustez da função utilitária `getImageUrl`
No arquivo `src/lib/utils.ts`:
- Tornar `getImageUrl(path: string)` **idempotente** (se a URL já começar com o base path, não duplicar).
- Tratar URLs externas e protocolos especiais (`http://`, `https://`, `blob:`, `data:`).

### 2. Normalização Centralizada em `BUILTIN_TILESETS`
No arquivo `src/core/data/tilesets.ts`:
- Mapear os tiles importados do manifesto garantindo que `tile.imagePath` seja normalizado com `getImageUrl(tile.imagePath)` logo na inicialização.

### 3. Normalização na Geração de Lookup de Tiles
No arquivo `src/utils/tilesetUtils.ts`:
- Na função `createTileLookup()`, garantir que o lookup de tiles armazene o `imagePath` resolvido via `getImageUrl(tile.imagePath)`.

### 4. Correção no Editor de Mapas
No arquivo `src/features/map-editor/components/MapEditorMenu.tsx`:
- Aplicar `getImageUrl(t.imagePath)` no pré-carregamento dos sprites de tiles no Canvas (`useEffect`).
- Aplicar `getImageUrl(tile.imagePath)` na renderização das miniaturas da paleta (`<img src={getImageUrl(tile.imagePath)} />`).
- Aplicar `getImageUrl(def.imagePath)` no gerador de layout tático urbano (`generateUrbanTacticalPreset`).

### 5. Consistência em Telas de Deploy e Combate
Nos arquivos `src/features/match-setup/components/DeployScreen.tsx` e `src/features/combat/components/BattleCanvas2D.tsx`:
- Garantir que o pré-carregamento das imagens de tiles utilize `getImageUrl(tileDef.imagePath)`.

### 6. Configuração do Base Path no Vite
No arquivo `vite.config.ts`:
- Adicionar detecção automática do base path para o ambiente do GitHub Actions (`process.env.GITHUB_ACTIONS`), usando o nome do repositório como fallback caso `VITE_BASE_PATH` não esteja explicitamente configurado no ambiente.

---

## Arquivos Afetados

| Arquivo | Ação | Descrição |
| :--- | :--- | :--- |
| `src/lib/utils.ts` | MODIFY | Tornar `getImageUrl` idempotente e robusta contra repetições de prefixo. |
| `src/core/data/tilesets.ts` | MODIFY | Normalizar URLs de imagem dos `BUILTIN_TILESETS`. |
| `src/utils/tilesetUtils.ts` | MODIFY | Garantir resolução com `getImageUrl` em `createTileLookup`. |
| `src/features/map-editor/components/MapEditorMenu.tsx` | MODIFY | Aplicar `getImageUrl` no pré-carregamento e miniaturas de sprites. |
| `src/features/match-setup/components/DeployScreen.tsx` | MODIFY | Aplicar `getImageUrl` no pré-carregamento de tiles do Canvas. |
| `src/features/combat/components/BattleCanvas2D.tsx` | MODIFY | Aplicar `getImageUrl` no pré-carregamento de tiles do Canvas. |
| `vite.config.ts` | MODIFY | Suporte resiliente a base path automático em builds do GitHub Pages. |

> **Nota de Segurança:** Nenhuma regra do Firebase Firestore (`firestore.rules`) será alterada nesta modificação.

---

## Plano de Verificação

1. **Validação Estática e TypeScript**:
   - Executar `npm run lint` (`tsc --noEmit`) para assegurar conformidade total sem erros de tipagem.
2. **Build de Produção**:
   - Rodar `npx vite build --base=/call-of-war/` e verificar que os assets e referências no `dist/` são gerados corretamente.
3. **Verificação de Resolução de URLs**:
   - Validar que caminhos de sprites resolvem para `/call-of-war/tiles/urban/...` no build de produção e para `/tiles/urban/...` no desenvolvimento local.
