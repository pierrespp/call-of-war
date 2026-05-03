# AGENT — Core & Arquitetura
> Herda todas as regras do `AGENTS.md` raiz. As regras abaixo são **adicionais** a esse escopo.

## Contexto Obrigatório
Antes de qualquer alteração nesta pasta, **LEIA**:
- `expertise/ARQUITETURA.md` — Estrutura de dados, fluxo de estados, API do backend.

---

## Escopo deste Agent
Arquivos sob `src/core/` (contexts, data, hooks, services, utils) e os tipos em `src/types/`.

---

## Regras Específicas

### Tipos e Schema (`src/types/game.ts`)
- Qualquer mudança em `Unit`, `GameState` ou `MapCoverData` é uma **mudança de schema**.
- Mudanças de schema exigem análise de impacto em: `server.ts`, todos os components que consomem os tipos, e as regras do Firestore.
- **Sempre** verificar se a mudança quebra a tipagem em `server.ts` antes de propor alteração.

### Hooks e Contexts (`src/core/hooks/`, `src/core/contexts/`)
- Novos hooks que usam `useState` ou `useEffect` com Firebase/Firestore **devem** limpar listeners no cleanup do `useEffect` (retornar unsubscribe).
- **Proibido** criar estados React que causem re-renders síncronos dentro de loops de animação Canvas.
- Preferir `useRef` para valores lidos dentro de `requestAnimationFrame`.

### Services (`src/core/services/`)
- Cada service deve ter responsabilidade única e bem definida.
- Services que chamam Firebase devem usar `try/catch` com logging de erro estruturado.
- Novos services **não** devem replicar lógica já existente em `server.ts`.

### Utils (`src/core/utils/`)
- Funções utilitárias devem ser puras (sem side effects).
- Conversões de unidade (pixels ↔ metros) devem usar as constantes centralizadas de `src/core/data/constants.ts`.

### Data / Constants (`src/core/data/`)
- Constantes de gameplay (dano, alcance, HP) pertencem ao `BALANCEAMENTO.md` — não as altere sem ler esse arquivo primeiro.
- Alterações em `CELL_SIZE` ou `METERS_PER_CELL` impactam **todo** o sistema de movimento e FOV.

---

## Checklist Antes de Alterar
- [ ] A mudança em tipos quebra `server.ts` ou outros consumers?
- [ ] Novos hooks limpam corretamente seus listeners?
- [ ] Novos valores de constante foram validados contra `expertise/BALANCEAMENTO.md`?
- [ ] A mudança cria novos re-renders que podem conflitar com o loop Canvas?
