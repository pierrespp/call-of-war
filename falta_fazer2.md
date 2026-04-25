# falta_fazer2.md — Plano de ação — Visão do Soldado (Abordagem 4: Cone SVG + checkLineCover por inimigo)

## ⚠️ Regra de execução (OBRIGATÓRIA — sempre seguir)

Após concluir **cada uma** das etapas abaixo, é obrigatório:

1. **Documentar o progresso** neste mesmo arquivo `falta_fazer2.md`, marcando a etapa como concluída e descrevendo:
   - Quais arquivos foram alterados.
   - O que foi feito tecnicamente.
   - Resultados de qualquer teste/validação realizado.
2. **Perguntar ao usuário** se pode prosseguir para a próxima etapa.
3. **NÃO** iniciar a próxima etapa sem a confirmação explícita do usuário.

Esta regra vale do começo ao fim do plano. **Não pular, não agrupar etapas.**

---

## Resumo da abordagem

**Abordagem 4 — Cone SVG + raycasting leve por inimigo (híbrida)**

- O servidor valida o FOV antes de autorizar qualquer disparo.
- O cliente renderiza o cone de visão como SVG sobre o mapa, centrado na `rotation` da unidade.
- Para cada inimigo dentro do cone, o cliente e o servidor verificam individualmente com `checkLineCover` / `computeShotCover` se a visão está obstruída (Visão Obstruída).
- Inimigos fora do FOV ou com visão obstruída: não podem ser atacados.
- Surpresa: se o atirador está fora do FOV do alvo → alvo perde bônus de cobertura + atirador ganha +10% hit.
- Rotação: segue o movimento automaticamente; gira manualmente gastando Ação Tática (já existe no servidor).
- Sniper + Objetiva: nova ação "Marcar Alvo" (gasta Ação Tática) → unidade marcada pode ser atacada fora do FOV no turno seguinte.

---

## Regras confirmadas pelo usuário

| Regra | Valor |
|---|---|
| Ângulo do cone | 90° |
| Alcance base (cone fechado) | 40m (distância Média) |
| Além dos 40m (direção frontal) | Visão ilimitada na frente (sem restrição lateral) |
| FOV bloqueia ataque | Sim — não pode atacar quem está fora do cone |
| Surpresa | Atirador fora do FOV do alvo → alvo sem cobertura + +10% hit |
| Visão Obstruída | Todas as linhas de tiro cruzam cobertura total → sem visão |
| Rotação | Automática no movimento; 1 giro manual por turno (gasta Ação Tática) |
| Sniper + Objetiva | Gasta Ação Tática para marcar alvo → pode atacar esse alvo fora do FOV no próximo turno |

---

## Mapeamento no sistema atual

| Elemento | Onde existe |
|---|---|
| `isInsideArc(guard, target, 90°, 40m)` | `server.ts:272` — já verifica cone de 90° com alcance |
| `rotation` na unidade | `src/types/game.ts:75` — ângulo de visão atual |
| `facingLockedThisTurn` + Ação Tática | `server.ts:854` — já implementado para rotação manual |
| `checkLineCover` / `computeShotCover` | `server.ts` — verifica cobertura na linha de tiro |
| `pathHitsWall` | `server.ts` — verifica paredes |
| `performShot` | `server.ts:864` — ponto central do cálculo de combate |
| Ação Tática (`actions.tactical`) | `src/types/game.ts:64` — disponível por turno |

---

## Status das etapas

- [ ] Etapa 1 — Adicionar campos de FOV e alvo marcado nos tipos e na unidade
- [ ] Etapa 2 — Criar função `isInFOV` no servidor (cone 90° + extensão frontal + Visão Obstruída)
- [ ] Etapa 3 — Validar FOV em `performShot` (bloquear ataque fora do cone)
- [ ] Etapa 4 — Implementar surpresa no `performShot` (alvo fora do FOV do atirador)
- [ ] Etapa 5 — Implementar ação "Marcar Alvo" do Sniper com Objetiva (servidor + cliente)
- [ ] Etapa 6 — Renderizar cone SVG no cliente (overlay visual sobre o mapa)
- [ ] Etapa 7 — Destaque visual de inimigos visíveis / obstruídos / fora de alcance no modo de mira
- [ ] Etapa 8 — Habilitar Sexto Sentido (detecta ataques fora do FOV — já desabilitado, agora com base para implementar)
- [ ] Etapa 9 — Testes e validação end-to-end

---

## Etapa 1 — Adicionar campos de FOV e alvo marcado nos tipos e na unidade

**Objetivo:** Preparar os tipos TypeScript e os dados da unidade para suportar o sistema de visão e a marcação de alvo do Sniper.

**Novos campos na interface `Unit` (`src/types/game.ts`):**
```ts
markedTargetId: string | null;        // alvo marcado pelo Sniper (Objetiva), válido por 1 turno
markedTargetExpiresAtTurn: number;    // número do turno em que a marcação expira
```

**Onde atualizar:**
- `src/types/game.ts` — adicionar os 2 campos em `Unit`
- `server.ts` — função `ensureUnitDefaults`: inicializar `markedTargetId: null` e `markedTargetExpiresAtTurn: 0`
- `server.ts` — função `resetTurnState` (ou equivalente de fim de turno): limpar `markedTargetId` se `markedTargetExpiresAtTurn <= turnAtual`

**Validação:** `npx tsc --noEmit` sem erros.

---

## Etapa 2 — Criar função `isInFOV` no servidor

**Objetivo:** Função central que determina se uma unidade (`observer`) consegue ver outra unidade (`target`), aplicando todas as regras:

1. **Cone de 90°, alcance ≤ 40m** — usa lógica de `isInsideArc` existente
2. **Extensão frontal além de 40m** — se o alvo está além de 40m mas está dentro de um ângulo estreito frontal (≤ 10° do centro da rotação), ainda é visível
3. **Visão Obstruída** — verifica via `computeShotCover` / `pathHitsWall` se todas as linhas de tiro cruzam cobertura total; se sim, sem visão
4. **Cobertura total do alvo** — se o alvo está em cobertura total E dentro do cone, sem visão (conforme regra)

```ts
function isInFOV(observer: Unit, target: Unit, coverData: MapCoverData): boolean
```

**O que será alterado:**
- `server.ts` — nova função `isInFOV` acima de `performShot`

**Validação:** Testar manualmente via log: posicionar inimigo no cone, fora do cone, em cobertura total.

---

## Etapa 3 — Validar FOV em `performShot` (bloquear ataque)

**Objetivo:** Antes de calcular qualquer acerto, verificar se o alvo está no FOV do atirador. Se não estiver, e não for um alvo marcado (Sniper/Objetiva), rejeitar o disparo.

**Lógica:**
```
se alvo NÃO está em isInFOV(attacker, target):
    se attacker tem Objetiva E target é markedTargetId E marcação ainda válida:
        permitir (Sniper marcou esse alvo)
    senão:
        retornar erro: "Alvo fora do campo de visão"
```

**O que será alterado:**
- `server.ts` — início de `performShot`: adicionar verificação de FOV antes de qualquer cálculo de hit
- A mesma verificação deve ser aplicada ao disparo de Guarda (`fromGuard = true`) — guardas só disparam contra inimigos no FOV deles

**Validação:** Tentar atirar em inimigo fora do cone → receber erro. Atirar em inimigo no cone → funcionar normalmente.

---

## Etapa 4 — Implementar surpresa no `performShot`

**Objetivo:** Se o atirador está fora do campo de visão do ALVO no momento do disparo, aplicar o efeito de surpresa.

**Regras de surpresa:**
- Alvo perde qualquer bônus de cobertura (coverLevel tratado como "none" para cálculo de hit e crit)
- Atirador ganha +10% de chance de acerto

**Lógica:**
```
surprised = NOT isInFOV(target, attacker)  // o ALVO não vê o atirador?
se surprised:
    coverLevel = "none"  // anula cobertura
    hitRate += 10        // bônus do atirador
    log: "⚡ [target.name] foi surpreendido! Sem bônus de cobertura."
```

**O que será alterado:**
- `server.ts` — dentro de `performShot`, após validar o FOV do atirador, calcular surpresa com `isInFOV(target, attacker)`

**Validação:** Flanquear inimigo (fora do FOV dele) → log deve mostrar "surpreendido" e hit rate maior.

---

## Etapa 5 — Ação "Marcar Alvo" do Sniper com Objetiva

**Objetivo:** Sniper equipado com Objetiva pode gastar sua Ação Tática para marcar um inimigo. No turno seguinte, pode atacar esse inimigo independente do FOV.

**Regras:**
- Só funciona se: `className` inclui "Sniper" E `attachments` inclui "Objetiva"
- Gasta `actions.tactical`
- O alvo marcado deve estar dentro do alcance do rifle (distância Longa)
- A marcação expira no início do turno seguinte do Sniper (dura apenas 1 turno do oponente)
- Não exige linha de visão para marcar (é a "Ação Tática para localizar")

**Nova rota no servidor:**
```
POST /api/rooms/:roomId/mark-target
Body: { playerToken, sniperId, targetId }
```

**O que será alterado:**
- `server.ts` — nova rota `POST /api/rooms/:roomId/mark-target`
- `server.ts` — no início de cada turno (`endTurn`): limpar `markedTargetId` de todas as unidades do time que está começando o turno, se a marcação expirou
- `src/services/apiService.ts` — novo método `markTarget(roomId, token, sniperId, targetId)`
- `src/App.tsx` — novo botão "Marcar Alvo" visível quando: unidade selecionada é Sniper com Objetiva + `actions.tactical` disponível + `targetMode` null → ao clicar entra em `targetMode = "mark"` → ao clicar em inimigo, chama a API

**Validação:** Sniper usa Marcar Alvo → Ação Tática consumida → no turno seguinte pode atacar alvo marcado mesmo fora do FOV.

---

## Etapa 6 — Renderizar cone SVG no cliente

**Objetivo:** Ao selecionar uma unidade, desenhar o cone de visão dela sobre o mapa como overlay SVG semi-transparente.

**Especificações visuais:**
- Cor: azul/verde translúcido para unidades aliadas
- Forma: setor circular de 90° centrado na `rotation` da unidade, raio = 40m em pixels (CELL_SIZE × 40 / METERS_PER_CELL)
- Extensão frontal: uma faixa estreita (±10°) se estendendo além dos 40m até a borda do mapa
- O SVG fica em uma camada acima do mapa mas abaixo dos tokens

**Implementação:**
- Calcular os pontos do setor via trigonometria (centro, arco esquerdo, arco direito)
- Para a extensão frontal além de 40m: dois pontos nas bordas do mapa na direção frontal
- Componente React `<FOVOverlay unit={selectedUnit} />` dentro do `<svg>` já existente no mapa

**O que será alterado:**
- `src/App.tsx` ou novo arquivo `src/components/FOVOverlay.tsx` — componente SVG do cone

**Validação:** Selecionar unidade → cone aparece. Girar unidade → cone gira. Desselecionar → cone some.

---

## Etapa 7 — Destaque visual de inimigos no modo de mira

**Objetivo:** Quando `targetMode === "shoot"`, classificar cada inimigo visualmente:

| Estado | Visual |
|---|---|
| Visível no FOV (pode atacar) | Borda verde, cursor pointer |
| Fora do FOV (bloqueado) | Borda vermelha semitransparente, cursor proibido |
| Visão Obstruída (dentro do cone mas tapado por cobertura total) | Ícone 🚫 sobre o token, não clicável |
| Alvo marcado (Sniper/Objetiva) | Borda amarela pulsante, pode atacar |

**O que será alterado:**
- `src/App.tsx` — função de renderização dos tokens: verificar FOV client-side (usando a mesma lógica de ângulo + `checkLineCover`) e aplicar classes CSS conforme o estado
- Bloquear `handleUnitClick` para inimigos fora do FOV (sem precisar ir ao servidor)

**Validação:** No modo de mira, inimigos fora do cone aparecem vermelhos e não respondem ao clique.

---

## Etapa 8 — Habilitar Sexto Sentido

**Objetivo:** Com o sistema de FOV pronto, implementar a habilidade Sexto Sentido do Assalto: o soldado é alertado quando um inimigo está fora do seu FOV e tenta atacá-lo (o que normalmente causaria surpresa).

**Regra:** Se o alvo possui Sexto Sentido e seria surpreendido (atirador fora do seu FOV), anular o efeito de surpresa — o alvo mantém bônus de cobertura normalmente e o atirador não recebe o +10%.

**O que será alterado:**
- `server.ts` — dentro de `performShot`, após calcular `surprised`: verificar se `target.skills.includes("Sexto Sentido")` → se sim, `surprised = false`
- `src/components/CreateMatchMenu.tsx` — remover o estado "em breve" do Sexto Sentido (habilitar seleção)
- `src/data/constants.ts` — atualizar descrição do Sexto Sentido se necessário

**Validação:** Assalto com Sexto Sentido não perde bônus de cobertura mesmo sendo atacado de fora do FOV.

---

## Etapa 9 — Testes e validação end-to-end

**Objetivo:** Testar todos os cenários da Visão do Soldado em partida real.

**Checklist de testes:**
- [ ] Cone de 90° é exibido corretamente ao selecionar unidade
- [ ] Cone gira quando a unidade move (rotação automática)
- [ ] Giro manual com Ação Tática funciona (girar sem mover)
- [ ] Não é possível atacar inimigo fora do cone (servidor rejeita)
- [ ] Inimigos fora do cone aparecem em vermelho no modo de mira
- [ ] Visão Obstruída: inimigo atrás de cobertura total dentro do cone → não pode atacar
- [ ] Surpresa: atacar inimigo de fora do FOV dele → log "surpreendido", sem cobertura, +10% hit
- [ ] Sniper com Objetiva: "Marcar Alvo" gasta Ação Tática e permite atacar no turno seguinte fora do FOV
- [ ] Sexto Sentido: Assalto com a habilidade não fica surpreso
- [ ] Guarda de Emboscada: disparo de guarda só ocorre para inimigos dentro do FOV da unidade de guarda

---

## Log de execução

*(Será preenchido conforme as etapas forem concluídas)*
