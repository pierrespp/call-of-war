# AGENT — Auth & Segurança
> Herda todas as regras do `AGENTS.md` raiz. As regras abaixo são **adicionais** a esse escopo.

## Contexto Obrigatório
Antes de qualquer alteração nesta pasta, **LEIA**:
- `expertise/FIREBASE_SYNC.md` — Single source of truth, race conditions, otimização de listeners.
- `expertise/SECURITY_SPEC.md` — Data invariants, dirty dozen payloads, regras de acesso.

---

## Escopo deste Agent
Arquivos sob `src/features/auth/`, `src/core/contexts/AuthContext` e o arquivo `firestore.rules`.

---

## Regras de Máxima Prioridade

### ⚠️ firestore.rules
- **QUALQUER** alteração em `firestore.rules` deve ser precedida de notificação explícita ao usuário.
- Nunca relaxar uma regra de segurança sem justificativa documentada no `implementation_plan.md`.
- Ao adicionar nova coleção Firestore: adicionar regra correspondente em `firestore.rules` **antes** de usar a coleção no código.

---

## Regras Específicas

### AuthContext e Estado de Autenticação
- O estado `user` e `auth` devem fluir exclusivamente pelo `AuthContext` — nunca armazenar token/uid em localStorage ou em estado local de componente.
- Componentes que dependem de autenticação devem usar o hook do contexto, nunca acessar Firebase Auth diretamente.
- O contexto deve expor: `user`, `loading`, `signIn`, `signOut`.

### Proteção de Rotas
- Toda rota protegida deve verificar `loading === false && user !== null` antes de renderizar conteúdo.
- Durante `loading === true`, exibir estado de carregamento — nunca flash de conteúdo não autenticado.

### Listeners Firestore (onSnapshot)
- Todo `onSnapshot` criado no mount do componente **deve** ter seu `unsubscribe` chamado no cleanup do `useEffect`.
- Padrão obrigatório:
  ```typescript
  useEffect(() => {
    const unsub = onSnapshot(ref, handler);
    return () => unsub();
  }, [deps]);
  ```
- Nunca criar listeners em escopo global fora de hooks/effects — causa vazamento de memória.

### Race Conditions e Escritas Concorrentes
- Operações que modificam HP, AP ou posição de unidade: **preferir `runTransaction`** para evitar overwrites em partidas multiplayer.
- Operações de delete (sala, unidade): usar `transaction` com verificação de existência antes de deletar.

### Invariants de Segurança (Data Invariants do SECURITY_SPEC)
- Uma Room deve ter `id` válido e `gameState` presente — validar antes de qualquer escrita.
- Um usuário não pode sobrescrever o mapa de draft de outro usuário.
- Rejeitar `gridSize` extremamente grande (potencial poisoning) — validar no lado do cliente antes de enviar.
- Sanitizar `mapName` contra injeção de scripts.

---

## Checklist Antes de Alterar
- [ ] Esta operação precisa de verificação de permissão no `firestore.rules`?
- [ ] O componente React está limpando corretamente os listeners ao ser desmontado?
- [ ] Houve quebra no esquema de dados? (Avisar o usuário para atualizar `firestore.rules`)
- [ ] A operação de escrita precisa de `runTransaction` para evitar race condition?
- [ ] O `user` está sendo obtido do `AuthContext`, não diretamente do Firebase Auth?
