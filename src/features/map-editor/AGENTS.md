# AGENT — Map Editor (Canvas & Pathfinding)
> Herda todas as regras do `AGENTS.md` raiz. As regras abaixo são **adicionais** a esse escopo.

## Contexto Obrigatório
Antes de qualquer alteração nesta pasta, **LEIA**:
- `expertise/CANVAS_RENDER.md` — Loop de renderização, separação de estado, batching.
- `expertise/PATHFINDING_AND_FOV.md` — Grid, A*, raycasting, custo de movimento.

---

## Escopo deste Agent
Arquivos sob `src/features/map-editor/` e os endpoints de mapa em `server.ts`
(`/api/maps/:mapId/cover`).

---

## Regras Específicas

### Loop de Renderização (Canvas)
- **Proibido** chamar `setState` (React) dentro de um callback de `requestAnimationFrame`.
- Use `useRef` para todo dado lido no loop de render (câmera, zoom, hover, seleção).
- Elementos estáticos (grid, coberturas) devem usar offscreen canvas ou cache — nunca redesenhar a cada frame sem necessidade.
- A ordem de transformação de câmera é sempre: `ctx.save()` → `ctx.translate(cameraX, cameraY)` → `ctx.scale(zoom, zoom)` → desenhar → `ctx.restore()`.

### Grid e Coordenadas
- O grid base é **40×40 células** de `50px` cada = `2000×2000px` = `60×60 metros`.
- Toda posição de entidade deve estar **quantizada ao grid** (snap). Nunca armazenar posições em pixels fracionados.
- `cellKey` format: `"${gridX},${gridY}"` — não mudar este formato sem atualizar todos os consumers.
- Conversão obrigatória: `Pixels → Metros: (pixels / CELL_SIZE) * METERS_PER_CELL`.

### Tipos de Cobertura
- Os únicos valores válidos são: `'none' | 'half' | 'full'`.
- Ao adicionar novo tipo de cobertura: atualizar `MapCoverData` em `types/game.ts` E a lógica de raycasting FOV E o `PATHFINDING_AND_FOV.md`.
- A detecção de cobertura amostra a cada `CELL_SIZE / 4` pixels ao longo da linha de visão — manter esta granularidade.

### FOV e Linha de Visão
- Raycasting é `O(n²)` — sempre aplicar early return se a distância exceder `maxRange` da arma ou visão.
- Mudanças em `MapCoverData` devem ser refletidas imediatamente no render do FOV (sem cache stale).
- Meias-coberturas nos grids adjacentes devem permitir que unidades atirem "por cima" — não bloquear LOF completamente.

### Persistência
- O editor salva via `POST /api/maps/:mapId/cover` — validar o payload antes do envio.
- Nunca salvar objetos `MapCoverData` com cells que tenham valor `'none'` — omitir para economizar espaço.

---

## Checklist Antes de Alterar
- [ ] A mudança quebra o loop `requestAnimationFrame`?
- [ ] Inseri `useState` num hook que dispara re-renders enquanto o canvas é desenhado?
- [ ] A ordem de transformação (`translate` → `scale`) foi mantida correta?
- [ ] A mudança em `MapCoverData` reflete corretamente no render do FOV?
- [ ] O grid permanece 40×40 como baseline?
- [ ] O algoritmo A* gera zig-zags desnecessários com os novos pesos?
