# AGENT — Match Setup & Draft
> Herda todas as regras do `AGENTS.md` raiz. As regras abaixo são **adicionais** a esse escopo.

## Contexto Obrigatório
Antes de qualquer alteração nesta pasta, **LEIA**:
- `expertise/BALANCEAMENTO.md` — TTK baseline, Stat Budgeting, trade-offs táticos.
- `expertise/COMBAT_AND_TURNS.md` — Fases do jogo, AP economy, tipos de ação.

---

## Escopo deste Agent
Arquivos sob `src/features/match-setup/` e o endpoint `/api/init` em `server.ts`.

---

## Regras Específicas

### Sistema de Pontos
- **MAX_POINTS = 100 por equipe** — não alterar sem aprovação explícita e atualização do `BALANCEAMENTO.md`.
- A validação de budget deve ser centralizada — validar no cliente E no servidor.
- Novos itens: definir custo via Stat Budgeting do `BALANCEAMENTO.md` antes de codificar.

### Custos de Referência
| Categoria    | Faixa de Custo |
|-------------|---------------|
| Classes     | 10–20 pontos  |
| Armas       | 3–10 pontos   |
| Coletes     | 0–3 pontos    |
| Acessórios  | 2 pontos cada |
| Habilidades | 1–3 pontos    |

### Validação de Slots
- Validar `attachments.length <= armor.slots` antes de confirmar o draft.
- Combinações inválidas (ex: Objetiva em arma curto alcance) devem ser bloqueadas com mensagem clara.

### Integridade de Tipagem
- Toda unidade criada deve satisfazer completamente a interface `Unit` de `types/game.ts`.
- Campos obrigatórios: `id`, `team`, `className`, `x`, `y`, `rotation`, `hp`, `armorName`, `weaponName`, `attachments[]`, `skills[]`, `movedThisTurn`.

### Posicionamento Inicial
- **Equipe A (USA):** Origem em `(225, 225)` com offset por unidade.
- **Equipe B (TR):** Origem em `(mapWidth - 275, mapHeight - 275)` com offset inverso.

---

## Checklist Antes de Alterar
- [ ] O budget de 100 pontos por equipe foi respeitado?
- [ ] O novo item passou pelo Stat Budgeting do `BALANCEAMENTO.md`?
- [ ] A validação ocorre tanto no cliente quanto no servidor?
- [ ] A unidade satisfaz completamente a interface `Unit`?
- [ ] Acessórios/habilidades incompatíveis são bloqueados?
