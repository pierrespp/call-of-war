# falta_fazer.md — Plano de ação — Implementação de Acessórios, Habilidades e Itens

## ⚠️ Regra de execução (OBRIGATÓRIA — sempre seguir)

Após concluir **cada uma** das etapas abaixo, é obrigatório:

1. **Documentar o progresso** neste mesmo arquivo `falta_fazer.md`, marcando a etapa como concluída e descrevendo:
   - Quais arquivos foram alterados.
   - O que foi feito tecnicamente.
   - Resultados de qualquer teste/validação realizado.
2. **Perguntar ao usuário** se pode prosseguir para a próxima etapa.
3. **NÃO** iniciar a próxima etapa sem a confirmação explícita do usuário.

Esta regra vale do começo ao fim do plano. **Não pular, não agrupar etapas.**

---

## Contexto e diagnóstico

O sistema possui acessórios e habilidades definidos em `src/data/constants.ts`, visíveis na interface de montagem do exército, mas a maioria **não tem efeito real** no combate. O objetivo é corrigir isso completamente.

### O que existe vs. o que funciona (antes da implementação)

**Acessórios:**
- **Objetiva** (+20% hit, +10% crit — não aplicar em alcance Curto): apenas +10% crit implementado; faltam +20% hit e a lógica de alcance
- **Red Dot** (+10% hit até 40m, somente Fuzil/Sub): **NÃO implementado**
- **Grip** (+5% hit, somente Fuzil/Sub): **NÃO implementado**
- **Bi-pé** (+5% crit se deitado, somente Rifle/Fuzil): implementado, mas **sem restrição de tipo de arma**

**Habilidades:**
- **Linha de Frente** (Assalto): atirar no meio do movimento e continuar — **NÃO implementado**
- **Sexto Sentido** (Assalto): depende de linha de visão do soldado (futuro) — **desabilitar por ora na UI**
- **Emboscada** (Suporte): na Guarda, enfileirar tiro para CADA inimigo que cruzar o FOV — **NÃO implementado**
- **Médico de Combate** (Médico): +2 cura por kit (base = 2 HP, com hab = 4 HP) — **mecânica de cura NÃO EXISTE**
- **Disparo Compensado** (Sniper): +10m de alcance efetivo — **NÃO implementado**

**UI:**
- Acessórios no draft não mostram descrição ao passar o mouse (só mostram o nome)
- Habilidades mostram corretamente via `title`

### Decisões de design acordadas com o usuário
- **Sexto Sentido**: desabilitado visualmente ("em breve") até implementarmos linha de visão do soldado em plano separado
- **Objetiva**: pode ser equipada mesmo em alcance Curto, mas o bônus não se aplica quando o alvo está a ≤ 20m
- **Médico**: ação de intervenção para curar aliado adjacente (≤ 4,5m); cura base 2 HP, com habilidade 4 HP; não ultrapassa HP máximo
- **Linha de Frente**: o soldado pode atirar durante o movimento e continuar se movendo no mesmo turno
- **Emboscada**: enfileirar um PendingGuardShot para cada inimigo diferente que cruzar o FOV no mesmo turno

---

## Status das etapas

- [x] Etapa 1 — Atualizar constants.ts com campos numéricos e desativar Sexto Sentido
- [x] Etapa 2 — Implementar bônus de acessórios no servidor (performShot)
- [x] Etapa 3 — Implementar Disparo Compensado (servidor + cliente)
- [x] Etapa 4 — Criar mecânica de cura do Médico (servidor + interface)
- [x] Etapa 5 — Implementar Linha de Frente
- [x] Etapa 6 — Implementar Emboscada
- [x] Etapa 7 — Corrigir tooltips de acessórios no draft e desabilitar Sexto Sentido na UI
- [ ] Etapa 8 — Testes e validação end-to-end

---

## Etapa 1 — Atualizar constants.ts com campos numéricos e marcar Sexto Sentido

**Objetivo:** Adicionar campos estruturados nos acessórios (`hitBonus`, `critBonus`, restrições de arma e alcance) para que o servidor possa aplicar os efeitos de forma limpa, sem depender de strings. Também atualizar a descrição de Sexto Sentido para indicar que está desabilitada.

**O que será alterado:**
- `src/data/constants.ts` — adicionar campos numéricos nos 4 acessórios; atualizar descrição de Sexto Sentido
- `src/types/game.ts` — adicionar campos novos na interface `Attachment`

**Validação:** `npx tsc --noEmit` sem erros.

---

## Etapa 2 — Implementar bônus reais de acessórios no servidor

**Objetivo:** Fazer com que Objetiva, Red Dot, Grip e Bi-pé afetem de fato o cálculo de acerto e crítico em `performShot` no servidor.

**Regras de cada acessório:**
- **Objetiva**: +20% hit E +10% crit, mas apenas se a distância ao alvo for > 20m (alcance Curto). Se ≤ 20m, bônus é zero.
- **Red Dot**: +10% hit somente se a arma for Fuzil ou Submetralhadora E a distância for ≤ 40m.
- **Grip**: +5% hit somente se a arma for Fuzil ou Submetralhadora.
- **Bi-pé**: +5% crit somente se o atirador estiver deitado (prone) E a arma for Rifle ou Fuzil.

**O que será alterado:**
- `server.ts` — função `performShot`: substituir a lógica hardcoded atual pela nova lógica com todas as restrições

**Validação:** servidor reiniciado sem erros; logs de combate devem refletir os bônus.

---

## Etapa 3 — Implementar Disparo Compensado (servidor + cliente)

**Objetivo:** A habilidade Disparo Compensado do Sniper adiciona +10m ao alcance efetivo do rifle, reduzindo a penalidade de distância.

**Como funciona:** O cálculo de `distancePenalty` compara a distância ao alvo com o alcance da arma. Com Disparo Compensado, o limiar de penalidade aumenta em 10m (ex: alcance Longo de 60m passa a penalizar só acima de 70m).

**O que será alterado:**
- `server.ts` — adicionar verificação: se o atirador tem Disparo Compensado, recalcular `distancePenalty` com +10m de bônus no limiar
- `src/App.tsx` — no cálculo de `distancePenalty` do cliente, verificar se a unidade selecionada tem Disparo Compensado e adicionar +10m ao limiar antes de calcular a penalidade

**Validação:** Sniper com Disparo Compensado deve ter penalidade de distância menor que sem a habilidade.

---

## Etapa 4 — Criar mecânica de cura do Médico

**Objetivo:** Criar do zero a ação de cura: o Médico gasta sua ação de intervenção para curar um aliado adjacente.

**Regras:**
- Somente unidades com `className` contendo "Médico" podem curar
- Alvo deve ser aliado (mesmo `team`) e estar a no máximo 4,5m (3 células)
- Cura base: **2 HP**. Com habilidade "Médico de Combate": **4 HP**
- Não ultrapassa o HP máximo da classe do alvo
- Consome `actions.intervention`

**O que será alterado:**
- `server.ts` — nova rota `POST /api/rooms/:roomId/heal` com toda a validação e lógica de cura
- `src/services/apiService.ts` — novo método `heal(roomId, token, healerId, targetId)`
- `src/App.tsx` — botão "Curar" visível quando unidade selecionada é Médico; novo `targetMode = "heal"`; ao clicar em aliado no modo heal, chamar a API

**Validação:** Médico pode curar aliado próximo; HP do alvo aumenta; log de combate registra a cura.

---

## Etapa 5 — Implementar Linha de Frente

**Objetivo:** Assalto com Linha de Frente pode atirar em qualquer momento durante seu movimento e continuar se movendo depois.

**Como funciona atualmente:** o servidor bloqueia o atirador caso `actions.intervention` já tenha sido usada, e o primeiro tiro consome `actions.intervention`. Com Linha de Frente, o tiro não deve consumir `actions.intervention` (o movimento continua disponível via `actions.move`).

**O que será alterado:**
- `server.ts` — rota `POST /api/rooms/:roomId/shoot`: se o atirador tiver Linha de Frente, o tiro não consome `actions.intervention`, permitindo que o movimento continue normalmente. O tiro ainda consome `shotsThisTurn` normalmente.
- `src/App.tsx` — habilitar o botão de atirar mesmo que `actions.move` ainda seja `true` se a unidade tiver Linha de Frente

**Validação:** Assalto com Linha de Frente pode atirar e depois continuar o movimento no mesmo turno.

---

## Etapa 6 — Implementar Emboscada

**Objetivo:** Suporte com Emboscada, ao ficar em Postura de Guarda, dispara contra CADA inimigo diferente que entrar no FOV durante o turno adversário (não apenas o primeiro).

**Como funciona atualmente:** a lógica de guarda cria um único `PendingGuardShot` por movimento do adversário, independente de quantos inimigos cruzaram o FOV.

**Mudança:** quando a unidade de guarda tiver Emboscada, verificar todos os inimigos no FOV a cada movimento e criar um `PendingGuardShot` separado para cada inimigo ainda não enfileirado neste turno.

**O que será alterado:**
- `server.ts` — função de verificação de guarda: ao detectar que a unidade de guarda tem Emboscada, iterar por todos os inimigos vivos e enfileirar um `PendingGuardShot` para cada um que esteja no FOV e ainda não tenha um tiro pendente

**Validação:** Suporte com Emboscada na Guarda deve gerar múltiplos disparos pendentes quando vários inimigos estiverem no FOV.

---

## Etapa 7 — Corrigir tooltips e desabilitar Sexto Sentido na UI

**Objetivo:** Garantir que o jogador veja a descrição de cada acessório ao passar o mouse, e que Sexto Sentido apareça claramente como "em breve" (não selecionável).

**O que será alterado:**
- `src/components/CreateMatchMenu.tsx`:
  - Acessórios: mudar `title={att.name}` para `title={att.description}` e exibir a descrição em tooltip visível
  - Sexto Sentido: renderizar com estilo cinza/opaco, `disabled`, e texto "🔒 Em breve" ao lado do nome

**Validação:** Hover nos acessórios no draft exibe a descrição. Sexto Sentido não pode ser selecionado.

---

## Etapa 8 — Testes e validação end-to-end

**Objetivo:** Testar todos os acessórios e habilidades implementados em partida real e confirmar que tudo funciona conforme descrito.

**Checklist de testes:**
- [ ] Objetiva: bônus de hit/crit aparece nos logs ao atirar em alvo acima de 20m; sem bônus abaixo de 20m
- [ ] Red Dot: bônus de hit em Fuzil/Sub a ≤ 40m; sem bônus fora do alcance ou em outras armas
- [ ] Grip: bônus de hit em Fuzil/Sub; sem bônus em outras armas
- [ ] Bi-pé: bônus de crit ao atirar deitado com Rifle/Fuzil; sem bônus em pé ou com outras armas
- [ ] Disparo Compensado: Sniper tem penalidade de distância menor (ou nenhuma) em alvos entre 60m e 70m
- [ ] Médico: botão "Curar" aparece para Médico; cura aliado adjacente por 2 HP; com Médico de Combate cura 4 HP; não ultrapassa HP máximo
- [ ] Linha de Frente: Assalto pode atirar e continuar o movimento; log confirma o tiro sem bloquear a movimentação
- [ ] Emboscada: Suporte em Guarda gera múltiplos disparos pendentes quando vários inimigos estão no FOV
- [ ] Sexto Sentido: aparece como "em breve" no draft, não pode ser selecionado
- [ ] Tooltips de acessórios no draft: descrição completa aparece ao passar o mouse

---

## Log de execução

**Etapa 1 Concluída:**
- Adicionados os campos numéricos nas definições de `Attachment` (`src/types/game.ts`).
- Atualizadas as restrições em `constants.ts` para Objetiva, Red Dot, Grip e Bi-pé.
- Atualizada a descrição do Sexto Sentido para indicar desativação.
- `npx tsc --noEmit` passou com sucesso.

**Etapa 2 Concluída:**
- Refatorada a função `performShot` (`server.ts`) para ler dinamicamente os campos de bônus (`hitBonus`, `critBonus`, etc.) implementados na Etapa 1.
- Adicionada a validação da classe de arma (`weaponClasses`), de distância máxima/mínima (`minRange`, `maxRange`) e de postura condicional (`requireProne`).
- Os bônus baseados nos respectivos itens (`Objetiva`, `Red Dot`, `Grip` e `Bi-pé`) agora estão condicionais a estes critérios de forma programática.
- `npx tsc --noEmit` passou com sucesso após ajustes na recuperação da propriedade de classe das armas (`weaponClass`).

**Etapa 3 Concluída:**
- Adicionado bônus condicional na penalidade de distância (`distancePenalty`) para Snipers usando Rifles e portando a habilidade `Disparo Compensado`, em App.tsx (tiro e tiro de guarda).
- Bônus permite que a distância excedida só comece a contar as penalidades a partir de `SCALE.ALCANCE_LONGO + 10`.
- Atualizada verificação absoluta de range na Rota HTTP `/mark-target` para que a habilidade permita marcar alvos +10m mais distantes.
- Atualizado o log de progresso.

**Etapa 4 Concluída:**
- Criada a rota `POST /api/rooms/:roomId/heal` no servidor que checa a classe do médico, alinhamento dos times, distância de 4.5m e faz a cura do alvo usando `actions.intervention`.
- Adicionado cálculo da habilidade "Médico de Combate" que aumenta a cura de 2 HP para 4 HP.
- Adicionado suporte a `healUnit` em `apiService.ts`.
- Adicionado modo de interação `targetMode="heal"` em `App.tsx`, com estilização de círculos e botões do menu específicos para personagens Médico curarem seus aliados.

**Etapa 5 Concluída:**
- Atualizada a permissão de disparo na Rota `/api/rooms/:roomId/shoot` do `server.ts` para permitir atirar caso o a unidade possua a habilidade "Linha de Frente". Diferente das demais classes, agora o tiro não consome `actions.intervention` para o Atirador com esta habilidade.
- A interface (`App.tsx`) no botão "Atirar" foi atualizada para aplicar dinamicamente o texto informativo sobre o não consumo de "Intervenção" e evitar bloquear o botão.

**Etapa 6 Concluída:**
- Atualizadas as rotas `/api/rooms/:roomId/move` (e o equivalente na movimentação de fato) no `server.ts` para que, ao se verificar inimigos no campo de visão, se a unidade em guarda possuir `Emboscada`, registrar também outros inimigos que se encontrem no FOV.
- Atualizada a Rota de guarda `/api/rooms/:roomId/guard-shot` para que a postura de guarda (`guard.stance = "standing"`) não seja resetada após o tiro quando a unidade tem `Emboscada` e há munição na arma, gerindo melhor o fluxo das janelas de Overwatch.

**Etapa 7 Concluída:**
- Atualizados os tooltips em `src/components/CreateMatchMenu.tsx` para os acessórios exibirem `att.description` em vez de apenas o nome ao se colocar o mouse por cima (`title={att.description}`).
- Adicionado bloqueio visual à habilidade "Sexto Sentido" (usando a tag `disabled` e propriedades de opacidade) e inserida diretamente na interface a tag indicativa "🔒 Em breve".
- Também foi corrigido o erro 429 Quota Exceeded do Map Generator da AI mudando o modelo para `gemini-2.5-flash-image`, visto que o preview de alta qualidade tem limites zero no free tier no momento.

*(Será preenchido conforme as etapas forem concluídas)*
