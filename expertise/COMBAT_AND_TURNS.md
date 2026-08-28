# Sistema de Turnos & Combate (COMBAT_AND_TURNS)

## Princípios Core
1. **Máquina de Estados de Turno**: O fluxo é estrito: `START -> DEPLOY -> TEAM_A -> TEAM_B -> ... -> END`.
2. **Economy de AP (Action Points)**: Mover custa AP, Atirar custa AP, Recarregar custa AP. A dedução DEVE ser calculada centralizada para evitar exploits.
3. **Modificadores (Modifiers)**: O Hit Rate e Crítico dependem diretamente do `Cover` (None, Half, Full) calculado entre o Atirador e o Alvo. 

## Checklist Antes de Alterar
- [ ] O fim do turno verifica perfeitamente se todas as unidades já agiram ou exauriram seus APs?
- [ ] Ao atirar, foi feita a rolagem de RNG e informada nos Logs de Batalha de maneira sincrona?
- [ ] Alterações nas estatísticas das unidades (HP, Range, Aim) quebram a tipagem em `types/game.ts`?
