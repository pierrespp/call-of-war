# Walkthrough — Sistema de Efeitos Visuais de Combate e Partículas no Canvas

> **Personas:** `UIUXMaster` & `GameDevExpert`  
> **Sistema:** `CombatVfxCanvas.tsx` / `BattleCanvas2D.tsx` / `App.tsx`

---

## 🎨 O que foi implementado

### 1. `CombatVfxCanvas.tsx` (Motor Nativo de Partículas 2D)
- **Trajetórias Balísticas com Glow (Tracer Beams)**:
  - Disparos projetam feixes de luz velocíssimos com rastro luminescente (`shadowBlur` + feixe duplo com núcleo branco).
  - Cores dinâmicas por classe de soldado:
    - **Sniper**: Ciano elétrico penetrante (`#06b6d4` / `#a5f3fc`) com alta velocidade e rastro alongado.
    - **Fuzil / Assalto / Médico**: Dourado âmbar tático (`#f59e0b` / `#fbbf24`).
    - **Granadeiro / Suporte**: Laranja incandescente (`#ea580c` / `#f97316`).
- **Clarão na Boca da Arma (Muzzle Flash)**:
  - Expansão rápida de clarão circular cônico e dissipação de fumaça translúcida no momento do disparo.
- **Efeitos de Impacto Físico**:
  - **Acerto em Soldado**: Respingos de sangue direcionais (splatter) com física balística oposta ao vetor de disparo, gravidade e esmaecimento suave.
  - **Impacto Crítico**: Clarão estroboscópico de alta energia com partículas energizadas em leque ampliado.
  - **Tiro Bloqueado / Armadura**: Faíscas metálicas incandescentes de ricochete (sparks) com linhas de rastro.
  - **Tiro Errado / Terreno**: Puffs de poeira e detritos de concreto.
  - **Granadas e Explosões**: Onda de choque expansiva (`shockwave`), clarão estroboscópico central, faíscas incandescentes em 360° e nuvens volumétricas de fumaça cinza-escura.

### 2. Integração no `BattleCanvas2D.tsx`
- O `<CombatVfxCanvas>` opera no espaço de coordenadas do mapa do mundo, escalando e movendo de forma sincronizada com o pan e zoom da câmera.
- Zero re-render no ciclo de renderização do React: toda a física de partículas roda via `requestAnimationFrame` em canvas nativo isolado a 60 FPS.

### 3. Integração das Ações em `App.tsx`
- Conectado o disparo balístico em `handleUnitClick` para tiros normais e tiros de supressão.
- Conectado o lançamento balístico e explosão temporizada para granadas de fragmentação e granadas de fumaça em `handleCanvasClick2D`.
- Conectado o disparo de tiro de reação em sentinela (`resolveGuardShot`).

---

## 🧪 Validação
- Compilação realizada com sucesso (`compile_applet` verde).
- Nenhuma alteração nas regras de segurança do `firestore.rules`.
- Zero regressões em ações e cálculos do servidor.
