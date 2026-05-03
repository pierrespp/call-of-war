# AGENT — Combat & Turns
> Herda todas as regras do `AGENTS.md` raiz. As regras abaixo são **adicionais** a esse escopo.

## Contexto Obrigatório
Antes de qualquer alteração nesta pasta, **LEIA**:
- `expertise/COMBAT_AND_TURNS.md` — Máquina de estados de turno, AP economy, modificadores.
- `expertise/BALANCEAMENTO.md` — TTK baseline, Stat Budgeting, trade-offs de equipamento.

---

## Escopo deste Agent
Arquivos sob `src/features/combat/` e as seções de combate em `server.ts`
(endpoints `/api/shoot`, `/api/move`, `/api/init` e lógica de turno).

---

## Regras Específicas

### AP Economy
- Toda ação que consome Action Points (mover, atirar, recarregar) deve ter seu custo **calculado de forma centralizada**.
- Nunca deduzir AP diretamente em um componente React — a dedução deve passar pelo servidor ou pelo reducer de estado de jogo.
- Ao adicionar nova ação: definir custo de AP explicitamente no `implementation_plan.md` antes de codificar.

### RNG e Logs de Combate
- Toda rolagem de dado (acerto, crítico, desvio de morteiro) **deve ser registrada** nos Logs de Batalha (`logs[]`) de forma síncrona.
- Formato obrigatório de log: `[RESULTADO] Atacante → Alvo | Arma | Rolagem: X / Chance: Y%`.
- **Nunca** silenciar falhas de RNG — todo erro/miss deve gerar entrada no log.

### Balanceamento — Regra do TTK
- O TTK (Time-To-Kill) baseline é: **Fuzil de Assalto, 4 dano × 3 tiros = 12 dano vs HP 10**.
- Qualquer novo equipamento ou mudança de dano/HP deve ser validada contra esta baseline antes de aprovação.
- Novas armas precisam de trade-off explícito conforme a tabela de Stat Budgeting do `BALANCEAMENTO.md`.

### Máquina de Estados de Turno
- O fluxo de fase é estrito: `START → DEPLOY → TEAM_A → TEAM_B → ... → END`.
- **Proibido** transicionar de fase sem verificar se todas as unidades do time ativo esgotaram seus APs.
- Mudanças na máquina de estados exigem atualização do diagrama em `expertise/COMBAT_AND_TURNS.md`.

### Modificadores de Combate
- Cover (None / Half / Full) e penalidades de distância devem ser calculados **antes** da rolagem de RNG.
- Modificadores de acessórios (Red Dot, Grip, etc.) são aplicados sobre o hit base, nunca sobre o resultado final.

---

## Checklist Antes de Alterar
- [ ] O fim de turno verifica se todas as unidades já agiram ou esgotaram seus APs?
- [ ] A rolagem de RNG é registrada nos Logs de Batalha de forma síncrona?
- [ ] A mudança de stats (HP, Range, Aim) quebra a tipagem em `types/game.ts`?
- [ ] O novo equipamento passa pelo Stat Budgeting do `BALANCEAMENTO.md`?
- [ ] O TTK baseline (4 dano × 3 tiros vs 10 HP) foi preservado ou a mudança foi justificada?
