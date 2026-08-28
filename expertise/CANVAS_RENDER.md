# Renderização de Canvas (CANVAS_RENDER)

## Princípios Core
1. **Separação de Estado**: O estado do React NUNCA deve bloquear a renderização do Canvas. Use refs (`useRef`) para valores mutáveis que são lidos em 60 FPS dentro do loop de renderização (requestAnimationFrame).
2. **Batching & Caching**: Redesenhe apenas o que mudou (quando possível) ou use offscreen canvases para elementos estáticos como o grid e coberturas básicas.
3. **Imagens Base64 / Cloudinary**: Sempre aguarde a imagem (`img.onload`) e lide corretamente com dimensões globais para evitar artefatos de escala.

## Checklist Antes de Alterar
- [ ] Eu quebrei o loop de `requestAnimationFrame`?
- [ ] Inseri estados do React (`useState`) num hook que disparam re-renders enquanto o canvas é desenhado?
- [ ] A escala (`scale`) e o offset (`cameraX`, `cameraY`) foram aplicados na ordem correta (`ctx.translate` -> `ctx.scale`)?
