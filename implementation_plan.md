# Plano de Implementação — Sistema Avançado de Efeitos de Partículas, Impacto e Trajetórias de Tiros com Glow

> **Persona Guia:** `UIUXMaster` (Especialista em Beleza Tática & Interface Premium) em conjunto com `GameDevExpert`  
> **Expertises Consultadas:** `expertise/CANVAS_RENDER.md`, `expertise/COMBAT_AND_TURNS.md`, `expertise/ARQUITETURA.md`  

---

## 🎯 Objetivo Visual & Técnico
Atualmente, os disparos e ataques acontecem com atualização imediata de logs, mas sem uma resposta visual tática no Canvas.
Esta tarefa implementa:
1. **Trajetórias Balísticas com Glow & Tracer Beams**: Feixes luminosos rápidos de projéteis cruzando o mapa do atirador até o alvo, com rastro de brilho neon (laranja para projéteis cinéticos, ciano/azul para snipers, amarelo/fogo para granadas).
2. **Efeitos de Impacto Físico (Sparks, Blood Spatter, Smoke & Shrapnel)**:
   - Acerto em Alvo Orgânico / Soldado: Partículas de impacto carmesim/sangue direcional e flash de acerto.
   - Dano em Armadura / Bloqueio: Faíscas brilhantes de ricochete metálico (sparks).
   - Acerto Crítico: Flash radial estroboscópico e onda de choque sutil.
   - Explosões de Granadas: Flash de alta intensidade, faíscas radiais e anéis de fumaça cinza-escura expandindo.
3. **Muzzle Flash & Smoke**: Clarão do disparo saindo da boca do cano da unidade atiradora.
4. **Performance Impecável (60 FPS no Canvas)**:
   - Integração direta no espaço do mundo do `BattleCanvas2D` (usando `<canvas>` com `requestAnimationFrame` que se move e dá zoom naturalmente com a câmera).
   - Sem re-render desnecessário do React no loop de física das partículas.

---

## 📋 Proposta de Alterações

### 🔹 1. Criação do Gerenciador de Efeitos Visuais de Combate (`CombatVfxCanvas.tsx`)
- Renderizar em um `<canvas>` posicionado dentro do container de mundo do `BattleCanvas2D` (mesmas coordenadas de mundo `mapW` x `mapH`).
- Implementar tipos de partículas e projéteis balísticos:
  - `BulletTracer`: projétil com velocidade, comprimento de cauda, cor emissiva e bloom/glow.
  - `ImpactSpark`: faíscas com física de dispersão em leque e desaceleração.
  - `BloodSplatter`: partículas de impacto com tamanhos variados e esmaecimento suave.
  - `ExplosionBlast`: onda de choque, fragmentos em alta velocidade e nuvem de fumaça volumétrica.
  - `MuzzleFlash`: clarão cônico ou circular na posição do atacante.
- Exportar uma API imperativa/ref (`triggerShotEffect(from, to, outcome, weaponType)` e `triggerExplosionEffect(x, y, radiusPx)`).

### 🔹 2. Integração no `BattleCanvas2D.tsx` & Disparo nos Eventos de Combate (`App.tsx`)
- Adicionar o `CombatVfxCanvas` dentro do container transformado de `BattleCanvas2D.tsx` (garantindo que partículas fiquem alinhadas perfeitamente ao mapa, zoom e pan da câmera).
- Expor métodos para acionar efeitos visuais quando `shootUnit`, `throwGrenade`, `hailOfBullets`, `resolveGuardShot`, etc., forem executados com sucesso.
- Gerar feedback visual imediato quando a resposta do tiro for recebida (ou nos logs de combate).

### 🔹 3. Refinamento de Cores e Estética Tática (`UIUXMaster`)
- Paleta emissiva:
  - Balas Comuns / Assalto / Suporte: Dourado Âmbar `#f59e0b` com halo `#fbbf24`.
  - Sniper: Ciano Elétrico `#06b6d4` com rastro penetrante `#22d3ee`.
  - Escopeta / Granadeiro: Vermelho Fogo `#ef4444` e Laranja Intenso `#f97316`.
  - Acerto em Armadura: Faíscas Brancas e Amarelas.
  - Sangue: Carmesim Escuro `#dc2626` e `#991b1b`.

---

## 🔒 Regras de Segurança
- Nenhuma alteração nas regras do `firestore.rules`.
- Zero interferência no cálculo matemático do backend (o visual acompanha os resultados reais de hit/crit/miss).
