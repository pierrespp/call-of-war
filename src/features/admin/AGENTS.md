# AGENT — Admin Panel
> Herda todas as regras do `AGENTS.md` raiz. As regras abaixo são **adicionais** a esse escopo.

## Contexto Obrigatório
Antes de qualquer alteração nesta pasta, **LEIA**:
- `expertise/FIREBASE_SYNC.md` — Single source of truth, race conditions, listeners.
- `expertise/SECURITY_SPEC.md` — Data invariants, dirty dozen payloads, regras de acesso.

---

## Escopo deste Agent
Arquivos sob `src/features/admin/` e operações administrativas no Firestore.

---

## Regras Específicas

### ⚠️ firestore.rules
- **QUALQUER** alteração em `firestore.rules` requer notificação explícita ao usuário.
- Nunca relaxar regra de segurança sem justificativa documentada no `implementation_plan.md`.

### Operações Destrutivas
- Delete de Room, unidade ou mapa: exigir confirmação dupla na UI E usar `runTransaction` com verificação de existência antes de deletar.
- Nunca realizar delete em batch sem paginação — risco de timeout em coleções grandes.

### Data Invariants (do SECURITY_SPEC)
- Room deve ter `id` válido e `gameState` presente — validar antes de qualquer escrita.
- Usuário não pode sobrescrever draft de mapa de outro usuário.
- Rejeitar `gridSize` extremamente grande (poisoning) — validar no cliente antes de enviar.
- Sanitizar `mapName` contra injeção de scripts.

### Listeners e Limpeza
- Todo `onSnapshot` deve ter seu `unsubscribe` no cleanup do `useEffect`.
- Painel admin não deve criar listeners globais fora de hooks.

---

## Checklist Antes de Alterar
- [ ] A operação de delete usa `runTransaction` com verificação de existência?
- [ ] Os Data Invariants do `SECURITY_SPEC` foram respeitados?
- [ ] O componente limpa corretamente seus listeners ao desmontar?
- [ ] Alterações em `firestore.rules` foram sinalizadas ao usuário?
- [ ] Inputs de usuário (nomes, IDs) estão sanitizados?
