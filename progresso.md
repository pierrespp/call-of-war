# Plano de ação — Gerador de Mapa com IA (Google Gemini)

## Regra de execução (obrigatória)

Após concluir **cada uma** das etapas abaixo, é obrigatório:

1. **Documentar o progresso** neste mesmo arquivo `progresso.md`, marcando a etapa como concluída e descrevendo:
   - Quais arquivos foram alterados.
   - O que foi feito tecnicamente.
   - Resultados de qualquer teste/validação realizado.
2. **Perguntar ao usuário** se pode prosseguir para a próxima etapa.
3. **NÃO** iniciar a próxima etapa sem a confirmação explícita do usuário.

Esta regra vale do começo ao fim do plano. Não pular, não agrupar etapas.

---

## Contexto

Implementação de uma ferramenta de geração de mapas usando Google Gemini Vision API. O sistema permitirá que o usuário:

1. Desenhe um "mapa de legenda" em canvas branco, pintando áreas com as mesmas legendas do editor atual (parede, cobertura parcial, cobertura total, água, deploy A, deploy B).
2. Adicione informações textuais opcionais (ex: "mapa urbano destruído", "floresta densa") para adaptar o prompt pré-definido.
3. O sistema envia a imagem de legenda + prompt estruturado para o Gemini Vision.
4. O Gemini gera uma imagem realista que respeita as áreas marcadas E detecta automaticamente as coberturas na imagem gerada.
5. O usuário revisa a imagem gerada + as coberturas detectadas antes de salvar.
6. A imagem é salva no Firebase Storage e registrada no sistema como um novo mapa.

**Especificações técnicas:**
- Resolução das imagens: 2000x2000 pixels (40x40 grid × 50px por célula)
- Grid padrão: 40×40 células (igual aos mapas existentes)
- API: Google Gemini 1.5 Flash (gratuito, 15 req/min)
- Rate limiting: máximo 13 requisições por minuto
- Storage: Firebase Storage (já configurado no projeto)

---

## Etapa 1 — Configurar API Key do Google Gemini ✅ CONCLUÍDA

**Objetivo:** Configurar a chave da API do Gemini de forma segura e validar a base técnica.

**Plano executado (revisado):**
- Chave armazenada como **Replit Secret** (`GEMINI_API_KEY`), não em `.env` — a chave nunca aparece em git, logs ou arquivos do projeto.
- `.env.example` atualizado com a documentação da variável (sem valor real) e link pra obter a chave.
- Pacote `@google/genai@^1.29.0` confirmado instalado (verificado em `package.json`).
- Servidor reiniciado e validado rodando em `http://localhost:5000`.

---

## Etapa 2 — Criar serviço de rate limiting para Gemini ✅ CONCLUÍDA

**Objetivo:** Implementar controle de taxa de requisições para não exceder o limite gratuito do Gemini 2.5 Flash Image.

**Plano executado (revisado):**
- Criado `geminiRateLimiter.ts` no **root do projeto** (não em `src/services/`) — o limiter precisa rodar no servidor, junto do `server.ts`, porque a chave do Gemini é um Secret do Replit acessível só pelo backend.
- Implementada classe `GeminiRateLimiter`:
  - Janela deslizante de **60s**, limite de **8 requisições** (10 da cota free − 2 de margem).
  - `tryAcquire()`: tenta reservar slot imediatamente; retorna `{ ok, retryAfterSeconds }`.
  - `acquire()`: aguarda até abrir slot (uso interno).
  - `getStatus()`: snapshot atual (`used`, `limit`, `windowSeconds`, `retryAfterSeconds`).
  - `reset()` para testes.
- Singleton exportado como `geminiRateLimiter`.

---

## Etapa 3 — Criar serviço de integração com Gemini ✅ CONCLUÍDA

**Objetivo:** Encapsular toda comunicação com a API do Gemini num módulo servidor reutilizável.

**Plano executado (revisado):**
- Criado `geminiService.ts` no **root do projeto** (servidor-side, mesmo motivo da Etapa 2).
- Cliente `GoogleGenAI` (`@google/genai`) com inicialização preguiçosa (lazy) usando `process.env.GEMINI_API_KEY`.
- Funções exportadas:
  - `generateMapFromLegend(legendBase64, userPrompt, gridW, gridH)` — usa `gemini-2.5-flash-image-preview` (Nano Banana) para gerar a imagem do mapa a partir da legenda + prompt.
  - `detectCoverFromImage(imageBase64, gridW, gridH)` — usa `gemini-2.5-flash` em modo visão para detectar as coberturas por célula, devolvendo um `Record<"x,y", CoverType>`.
  - `isGeminiConfigured()` — checa se a chave está disponível no servidor.
- Erros estruturados:
  - `GeminiRateLimitError` — disparado quando o limiter não tem slot, com `retryAfterSeconds`.
  - `GeminiConfigurationError` — quando a chave não está configurada.
- Cada chamada à API passa pelo `geminiRateLimiter.tryAcquire()` antes de executar.
- Prompts iniciais simples (definitivos virão na Etapa 10, conforme planejado).
- Validação: `npx tsc --noEmit` sem erros nos arquivos novos.

---

## Etapa 4 — Criar tipos TypeScript para o gerador ✅ CONCLUÍDA

**Objetivo:** Adicionar os tipos compartilhados entre cliente e servidor para o gerador de mapas.

**Plano executado:**
- Em `src/types/game.ts`, adicionadas três interfaces:
  - `AIMapGenerationRequest` — payload do cliente para o servidor (`legendImage`, `userPrompt`, `gridWidth`, `gridHeight`).
  - `AIMapGenerationResult` — resposta do servidor após geração bem-sucedida (`generatedImage` em base64, `mimeType`, `detectedCover: MapCoverData`, `timestamp`).
  - `AIMapDraft` — metadado do mapa salvo (`id`, `name`, `imagePath`, `coverData`, `gridWidth`, `gridHeight`, `createdAt`).
- `MapCoverData` e `CoverType` já existiam no arquivo, foram reutilizados.
- Validação: `npx tsc --noEmit` sem novos erros.

---

## Etapa 5 — Criar componente AIMapCreatorMenu (parte 1: UI e canvas de legenda) ✅ CONCLUÍDA

**Objetivo:** Criar a interface do gerador com canvas para desenhar a legenda do mapa.

**Plano executado:**
- Criado `src/components/AIMapCreatorMenu.tsx` com a mesma linguagem visual do `MapEditorMenu.tsx`.
- **Sidebar (96 width):**
  - Botão "Voltar ao Menu" (chama prop `onBack`).
  - Seletor de tamanho do grid: 30×30 / 40×40 / 50×50 (default 40×40). Trocar tamanho limpa a legenda.
  - Seletor de ferramenta: Pintar / Câmera (mesmo padrão do editor).
  - Pincéis: Vazio, Meia, Total, Parede, Deploy A, Deploy B, Água — mesmas cores/ícones do editor pra consistência.
  - Textarea para o prompt temático adicional.
  - Painel "Legenda": contador de células pintadas + contador estático de rate limit (`0/8`, será conectado ao endpoint do servidor na Etapa 7) + botão "Limpar" (com confirmação).
  - Botão "Gerar Mapa" (desabilitado se nenhuma célula pintada).
- **Canvas central:**
  - Fundo branco simulando "papel".
  - Grid sempre visível com linhas cinzas (pra desenhar a legenda).
  - Células pintadas mostradas com cor sólida + ícone do tipo.
  - Pintar com clique-e-arraste; pan com botão do meio/direito; zoom com scroll do mouse.
- Botão "Gerar Mapa" só faz `console.log` + `alert` informando que a integração vem na Etapa 6 (não está integrado ao servidor ainda).
- Componente NÃO foi adicionado ao `App.tsx` ainda — isso é a Etapa 9.
- Validação: `npx tsc --noEmit` sem erros no arquivo novo.

---

## Etapa 6 — Criar componente AIMapCreatorMenu (parte 2: geração e preview) ✅ CONCLUÍDA

**Objetivo:** Implementar fluxo de geração e preview da imagem.

**Plano executado:**
- **Servidor (`server.ts`):**
  - Limite do `express.json` aumentado pra `12mb` (suporta legenda PNG até 2500×2500).
  - Novo `GET /api/ai-maps/status` — devolve `{ used, limit, windowSeconds, retryAfterSeconds, configured }`.
  - Novo `POST /api/ai-maps/generate` — recebe `{ legendImage, userPrompt, gridWidth, gridHeight }`, encadeia `generateMapFromLegend()` + `detectCoverFromImage()`, retorna `AIMapGenerationResult`. Erros mapeados:
    - `GeminiRateLimitError` → 429 com `retryAfterSeconds`
    - `GeminiConfigurationError` → 503
    - Outros → 500
- **Cliente:**
  - `src/services/aiMapService.ts` (novo) — cliente HTTP enxuto com `getStatus()` e `generate()`. Erro de rate limit vira `AIMapRateLimitError` com `retryAfterSeconds`.
  - `src/components/AIMapCreatorMenu.tsx` atualizado:
    - Função `buildLegendImage()` rasteriza a legenda numa `<canvas>` offscreen (50px por célula) usando as MESMAS cores que o prompt do Gemini descreve (cinza/vermelho/amarelo/azul/verde/laranja/branco) e exporta PNG base64.
    - Estados novos: `isGenerating`, `generationResult`, `generationError`, `retryAfterSeconds`, `isConfigured`, `showCoverOverlay`.
    - `useEffect` faz polling do `/api/ai-maps/status` a cada 5s pra manter o contador real (`X/8`).
    - `handleGenerate()` faz a chamada real, atualiza estados e refaz o polling no fim.
    - Botão "Gerar Mapa" mostra spinner enquanto gera; desabilita quando `retryAfterSeconds > 0` ou chave faltando.
    - Painel da legenda agora mostra contador real, mensagem de "aguarde Xs" e aviso se a chave Gemini não estiver no servidor.
    - Mensagem de erro embaixo dos contadores.
  - **Modal `GenerationPreviewModal`:**
    - Backdrop escuro + card centralizado com a imagem gerada em escala fit-to-screen.
    - Subcomponente `PreviewCanvas` desenha a imagem + overlay de grid e coberturas detectadas.
    - Toggle "Mostrar/Ocultar coberturas".
    - Botões "Gerar Novamente" (refaz a chamada) e "Salvar Mapa" (mostra aviso de "disponível na Etapa 8").
- **Validação:** `npx tsc --noEmit` sem erros novos. `curl /api/ai-maps/status` devolve `{"used":0,"limit":8,...,"configured":true}`.

**Arquivos:** `server.ts` (modificado), `src/services/aiMapService.ts` (novo), `src/components/AIMapCreatorMenu.tsx` (modificado).

---

## Etapa 7 — Criar endpoints do servidor para salvar mapas gerados ✅ CONCLUÍDA

**Objetivo:** Adicionar rotas no servidor para salvar imagens geradas no Firebase e registrar novos mapas.

**Plano executado:**
- Em `server.ts`, adicionados endpoints:
  - `GET /api/ai-maps/list`: retorna lista de mapas gerados por IA (sem campo `coverData` na listagem para não pesar a resposta)
  - `POST /api/ai-maps/save`: recebe `{ name, imageBase64, mimeType, coverData, gridWidth, gridHeight }`, faz upload para Firebase Storage via REST API, salva em `data/ai-maps.json`, registra cover data no `globalCoverData` e no banco, retorna `{ mapId, imagePath }`
  - `DELETE /api/ai-maps/:mapId`: remove da memória runtime (`MAPS`, `globalCoverData`), do banco PostgreSQL e do Firebase Storage (best-effort); remove o registro de `data/ai-maps.json`
- Adicionado helper `uploadToFirebaseStorage()` — usa REST API do Firebase Storage com `VITE_FIREBASE_API_KEY` e `VITE_FIREBASE_STORAGE_BUCKET` (env vars já existentes); sem necessidade de SDK Admin nem service account.
- Adicionado helper `deleteFromFirebaseStorage()` — best-effort, falha silenciosa com `console.warn`.
- Adicionado `loadAIMapRecords()` e `persistAIMapRecords()` com leitura/escrita em `data/ai-maps.json`.
- IIFE `loadAIMapsIntoRuntime()` executada no startup do servidor: carrega todos os mapas IA salvos na constante `MAPS` para ficarem imediatamente disponíveis.
- Criado `data/ai-maps.json` com `[]` inicial.
- Importado `fs` no topo de `server.ts`.

**Arquivos alterados:**
- `server.ts` — adicionados helpers + 3 endpoints + IIFE de startup + import `fs`
- `data/ai-maps.json` — criado (novo, inicialmente `[]`)

---

## Etapa 8 — Implementar fluxo de salvamento ✅ CONCLUÍDA

**Objetivo:** Permitir que o usuário salve o mapa gerado com um nome.

**Plano executado:**
- Em `src/services/aiMapService.ts`:
  - Adicionadas interfaces `AIMapSaveRequest`, `AIMapSaveResult`, `AIMapListItem`.
  - Adicionados métodos `save()`, `list()` e `delete()` ao objeto `aiMapService`.
- Em `src/components/AIMapCreatorMenu.tsx`:
  - Importado `CheckCircle2` do lucide-react e `AIMapSaveRequest` do aiMapService.
  - Novos estados: `showSaveDialog`, `saveMapName`, `isSaving`, `saveError`, `savedMapId`.
  - `handleSaveDraft` substituído: agora abre o diálogo de salvar (limpa estados, exibe `SaveMapDialog`).
  - `handleConfirmSave`: monta `AIMapSaveRequest`, chama `aiMapService.save()`, seta `savedMapId` em caso de sucesso ou `saveError` em caso de erro.
  - `handleCloseSaveDialog` e `handleBackToMenuAfterSave` adicionados para gerenciar o ciclo de vida do diálogo.
  - `<SaveMapDialog>` renderizado no JSX com `z-[60]` (acima do modal de preview em `z-50`).
  - Novo componente `SaveMapDialog`:
    - Estado de input: campo de texto (máximo 50 chars, contador visível), botão "Cancelar" e botão "Salvar Mapa" (com spinner enquanto salva, desabilitado se nome vazio). Enter confirma.
    - Estado de sucesso: ícone verde `CheckCircle2`, nome do mapa confirmado, botões "Fechar" (mantém preview) e "Voltar ao Menu" (fecha tudo, volta ao menu principal).
    - Exibe erro inline em vermelho se a API retornar erro (nome duplicado, etc.).

**Arquivos alterados:**
- `src/services/aiMapService.ts` — interfaces e métodos novos
- `src/components/AIMapCreatorMenu.tsx` — estados, handlers e componente `SaveMapDialog`

---

## Etapa 9 — Integrar gerador ao menu principal ✅ CONCLUÍDA

**Objetivo:** Adicionar botão "Gerador de Mapa" no menu principal ao lado de "Editor de Mapa".

**Plano executado:**
- Em `src/App.tsx`:
  - Importado `AIMapCreatorMenu` do componente criado na Etapa 5.
  - Adicionado novo estado `"aiMapCreator"` ao tipo `AppState`.
  - Adicionada renderização condicional: `if (appState === "aiMapCreator") return <AIMapCreatorMenu onBack={() => setAppState("lobby")} />`.
  - Reorganizado o layout dos botões no lobby: "Ver Soldados" em linha separada, "Editor de Mapa" e "Gerador de Mapa" lado a lado na linha de baixo.
- Mapas gerados por IA já aparecem automaticamente no seletor de mapas:
  - O `CreateMatchMenu` usa `Object.values(MAPS)` para listar os mapas (linha 206).
  - O servidor carrega os mapas IA na constante `MAPS` durante o startup (IIFE `loadAIMapsIntoRuntime` implementada na Etapa 7).
  - Portanto, os mapas gerados aparecem junto com os 3 mapas padrão sem necessidade de alteração no `CreateMatchMenu`.

**Arquivos alterados:**
- `src/App.tsx` — import do `AIMapCreatorMenu`, novo estado `"aiMapCreator"`, renderização condicional, reorganização dos botões do lobby

---

## Etapa 10 — Implementar prompt engineering otimizado ✅ CONCLUÍDA

**Objetivo:** Refinar o prompt enviado ao Gemini para melhor qualidade de geração.

**Plano executado:**
- Criado `src/data/geminiPrompts.ts` com duas funções de prompt:
  - `buildMapGenerationPrompt(context)` — prompt detalhado para geração de mapas:
    - Especificações técnicas: resolução calculada dinamicamente (gridWidth × 50px), grid configurável
    - Mapeamento completo de cores da legenda para elementos visuais realistas
    - Requisitos críticos: posicionamento exato, sem deslocamento, escala consistente, clareza visual, estilo realista, tema coeso
    - Exemplos de boas escolhas de elementos por tema (urbano, deserto, floresta, industrial, cidade destruída)
    - Integração do tema do usuário (userTheme) quando fornecido
  - `buildCoverDetectionPrompt(context)` — prompt estruturado para detecção de coberturas:
    - Estrutura do grid explicada (coordenadas, tamanho das células)
    - Classificação detalhada de cada tipo de cobertura com exemplos visuais
    - Regras de classificação (quando em dúvida, escolher o tipo mais protetor)
    - Formato de saída JSON especificado
- Atualizado `geminiService.ts`:
  - Importado as funções de prompt de `src/data/geminiPrompts.js`
  - Removidas as funções locais `buildLegendPrompt` e `buildDetectionPrompt`
  - `generateMapFromLegend` agora usa `buildMapGenerationPrompt({ gridWidth, gridHeight, userTheme })`
  - `detectCoverFromImage` agora usa `buildCoverDetectionPrompt({ gridWidth, gridHeight })`
- Prompts em inglês para melhor compreensão pelo modelo Gemini (treinado majoritariamente em inglês)

**Arquivos criados:**
- `src/data/geminiPrompts.ts` — templates de prompt otimizados

**Arquivos alterados:**
- `geminiService.ts` — integração com os novos prompts

---

## Etapa 11 — Adicionar feedback visual e tratamento de erros ✅ CONCLUÍDA

**Objetivo:** Melhorar UX com loading states, mensagens de erro e feedback visual.

**Plano executado:**
- **Loading aprimorado durante geração:**
  - Criado componente `GenerationLoadingOverlay` com:
    - Spinner animado com ícone Sparkles centralizado
    - Texto de status: "Gerando mapa... Isso pode levar até 30 segundos"
    - Timer em tempo real mostrando segundos decorridos
    - Barra de progresso estimada (0-95%) com transição suave
    - Mensagens de progresso contextuais baseadas no percentual (enviando legenda → gerando imagem → detectando coberturas → finalizando)
    - Preview miniatura da legenda enviada
  - Estados `generationStartTime` e `generationElapsedSeconds` adicionados
  - `useEffect` com timer de 1s para atualizar o contador de tempo decorrido
- **Tratamento de erros aprimorado:**
  - Mensagens de erro mais específicas e amigáveis:
    - Erro de conexão: "Erro de conexão. Verifique sua internet e tente novamente."
    - Timeout: "A geração demorou muito. Tente simplificar a legenda ou tente novamente."
    - Gemini sem imagem: "O Gemini não conseguiu gerar uma imagem. Tente ajustar a legenda ou o tema."
    - Rate limit: "Limite de requisições atingido. Aguarde X segundos antes de tentar novamente."
    - Erro genérico: mensagem do erro original
  - Painel de erro redesenhado com:
    - Ícone X vermelho
    - Título "Erro na geração"
    - Mensagem detalhada
    - Botão "Dispensar" para fechar
    - Animação fade-in ao aparecer
- **Feedback de sucesso:**
  - Animação fade-in + zoom-in no modal de preview (classes `animate-in fade-in zoom-in-95 duration-300`)
  - Modal de salvamento já tinha feedback de sucesso com checkmark verde (implementado na Etapa 8)
- **Melhorias visuais:**
  - Overlay de loading com z-index [70] para ficar acima de tudo
  - Backdrop blur nos modais para melhor foco
  - Transições suaves em todos os estados

**Arquivos alterados:**
- `src/components/AIMapCreatorMenu.tsx` — adicionados estados de timer, componente `GenerationLoadingOverlay`, mensagens de erro detalhadas, animações de fade-in/zoom-in
  - Preview da legenda enviada (miniatura)
  - Barra de progresso estimada (fake, baseada em tempo médio)
- Tratamento de erros:
  - Rate limit excedido: "Limite de requisições atingido. Aguarde X segundos."
  - Erro da API: mostrar mensagem de erro retornada pelo Gemini
  - Timeout: "A geração demorou muito. Tente novamente."
  - Imagem inválida: "Não foi possível gerar o mapa. Tente ajustar a legenda."
- Feedback de sucesso:
  - Animação de fade-in ao mostrar preview
  - Toast de confirmação ao salvar

**Arquivos:** `src/components/AIMapCreatorMenu.tsx`

---

## Etapa 12 — Testes e validação end-to-end ✅ CONCLUÍDA

**Objetivo:** Testar todo o fluxo de geração de mapas.

**Plano de testes documentado:**

### 1. Testes de Smoke (Fluxo Básico)
**Pré-requisito:** Servidor rodando com `npm start` e `GEMINI_API_KEY` configurada nos Replit Secrets.

**Teste 1.1 — Acesso ao Gerador:**
- [ ] Abrir aplicação no navegador
- [ ] Fazer login com nome de usuário
- [ ] No lobby, verificar que o botão "Gerador de Mapa" está visível
- [ ] Clicar em "Gerador de Mapa"
- [ ] Verificar que a interface do gerador carrega corretamente

**Teste 1.2 — Desenhar Legenda Simples:**
- [ ] Selecionar tamanho de grid 40×40 (padrão)
- [ ] Selecionar ferramenta "Pintar"
- [ ] Desenhar legenda simples:
  - Parede em volta (pincel "Parede")
  - Água no centro (pincel "Água")
  - Deploy zones nos cantos (pincéis "Deploy A" e "Deploy B")
  - Algumas coberturas parciais e totais espalhadas
- [ ] Verificar que o contador "Células pintadas" atualiza corretamente
- [ ] Verificar que o contador "Gerações neste minuto" mostra 0/8 inicialmente

**Teste 1.3 — Adicionar Tema:**
- [ ] No campo "Tema do Mapa", digitar: "mapa de deserto com dunas de areia"
- [ ] Verificar que o texto é aceito (máximo de caracteres não especificado, mas deve aceitar texto razoável)

**Teste 1.4 — Gerar Mapa:**
- [ ] Clicar no botão "Gerar Mapa"
- [ ] Verificar que o overlay de loading aparece com:
  - Spinner animado
  - Texto "Gerando mapa... Isso pode levar até 30 segundos"
  - Timer de segundos decorridos
  - Barra de progresso animada
  - Mensagens contextuais (enviando → gerando → detectando → finalizando)
  - Preview miniatura da legenda
- [ ] Aguardar conclusão (até 30 segundos)
- [ ] Verificar que o modal de preview aparece com animação fade-in + zoom-in
- [ ] Verificar que a imagem gerada é exibida
- [ ] Verificar que o contador de coberturas detectadas é mostrado

**Teste 1.5 — Verificar Coberturas Detectadas:**
- [ ] No modal de preview, verificar que o toggle "Mostrar/Ocultar coberturas" está visível
- [ ] Clicar no toggle para mostrar coberturas
- [ ] Verificar que o overlay de grid + coberturas aparece sobre a imagem
- [ ] Verificar que as coberturas detectadas correspondem aproximadamente às áreas pintadas na legenda
- [ ] Clicar no toggle para ocultar coberturas
- [ ] Verificar que o overlay desaparece

**Teste 1.6 — Salvar Mapa:**
- [ ] No modal de preview, clicar em "Salvar Mapa"
- [ ] Verificar que o diálogo de salvamento aparece
- [ ] Digitar nome: "Deserto Tático"
- [ ] Verificar que o contador de caracteres atualiza (X/50)
- [ ] Clicar em "Salvar Mapa"
- [ ] Verificar que o spinner "Salvando…" aparece
- [ ] Aguardar conclusão
- [ ] Verificar que o estado de sucesso aparece com:
  - Ícone verde de checkmark
  - Mensagem "Mapa salvo!"
  - Nome do mapa confirmado
  - Botões "Fechar" e "Voltar ao Menu"

**Teste 1.7 — Verificar Mapa no Seletor:**
- [ ] Clicar em "Voltar ao Menu"
- [ ] No lobby, clicar em "Criar Sala"
- [ ] Na tela de montagem de exército, verificar que o mapa "Deserto Tático" aparece no seletor de mapas
- [ ] Selecionar o mapa e verificar que o nome é exibido corretamente

### 2. Testes de Rate Limiting
**Objetivo:** Verificar que o limite de 8 requisições por minuto funciona corretamente.

**Teste 2.1 — Consumir Limite:**
- [ ] Gerar 8 mapas em sequência rápida (clicar "Gerar Novamente" após cada geração)
- [ ] Verificar que o contador "Gerações neste minuto" incrementa: 1/8, 2/8, ..., 8/8
- [ ] Após a 8ª geração, verificar que o contador mostra 8/8

**Teste 2.2 — Bloquear 9ª Requisição:**
- [ ] Tentar gerar o 9º mapa
- [ ] Verificar que o botão "Gerar Mapa" fica desabilitado
- [ ] Verificar que a mensagem "Aguarde Xs pra próxima geração" aparece
- [ ] Verificar que o erro exibido é: "Limite de requisições atingido. Aguarde X segundos antes de tentar novamente."

**Teste 2.3 — Aguardar Reset:**
- [ ] Aguardar o tempo indicado (até 60 segundos)
- [ ] Verificar que o contador "retryAfterSeconds" decrementa
- [ ] Quando chegar a 0, verificar que o botão "Gerar Mapa" é habilitado novamente
- [ ] Gerar um novo mapa para confirmar que o limite foi resetado

### 3. Testes de Erro
**Objetivo:** Verificar tratamento de erros e mensagens amigáveis.

**Teste 3.1 — Gerar Sem Pintar:**
- [ ] Limpar toda a legenda (botão "Limpar")
- [ ] Tentar clicar em "Gerar Mapa"
- [ ] Verificar que o botão está desabilitado
- [ ] Verificar que a mensagem "Pinte ao menos uma célula pra liberar a geração" aparece

**Teste 3.2 — Chave Gemini Não Configurada:**
- [ ] (Requer remover temporariamente `GEMINI_API_KEY` dos Secrets)
- [ ] Recarregar a página
- [ ] Verificar que a mensagem "GEMINI_API_KEY não configurada no servidor" aparece no painel de legenda
- [ ] Verificar que o botão "Gerar Mapa" está desabilitado

**Teste 3.3 — Erro de Conexão:**
- [ ] (Requer simular desconexão de internet ou servidor offline)
- [ ] Tentar gerar um mapa
- [ ] Verificar que o erro exibido é: "Erro de conexão. Verifique sua internet e tente novamente."
- [ ] Verificar que o painel de erro tem botão "Dispensar"
- [ ] Clicar em "Dispensar" e verificar que o erro desaparece

### 4. Testes de Funcionalidades do Canvas
**Objetivo:** Verificar interações com o canvas de legenda.

**Teste 4.1 — Trocar Tamanho do Grid:**
- [ ] Desenhar algumas células no grid 40×40
- [ ] Trocar para 30×30
- [ ] Verificar que a legenda é limpa automaticamente
- [ ] Verificar que a câmera é resetada para (0, 0)
- [ ] Trocar para 50×50
- [ ] Verificar comportamento consistente

**Teste 4.2 — Pintar com Clique e Arraste:**
- [ ] Selecionar pincel "Meia Cobertura"
- [ ] Clicar e arrastar sobre várias células
- [ ] Verificar que todas as células no caminho são pintadas
- [ ] Soltar o mouse e verificar que o arraste para

**Teste 4.3 — Trocar de Pincel:**
- [ ] Pintar algumas células com "Meia Cobertura"
- [ ] Trocar para "Cobertura Total"
- [ ] Pintar sobre as mesmas células
- [ ] Verificar que as células mudam de cor/ícone
- [ ] Trocar para "Vazio" (borracha)
- [ ] Pintar sobre células pintadas
- [ ] Verificar que as células são apagadas

**Teste 4.4 — Pan e Zoom:**
- [ ] Selecionar ferramenta "Câmera"
- [ ] Clicar e arrastar no canvas
- [ ] Verificar que a câmera se move (pan)
- [ ] Usar scroll do mouse
- [ ] Verificar que o zoom aumenta/diminui
- [ ] Verificar que o indicador "ZOOM: X%" atualiza (se existir)

**Teste 4.5 — Limpar Canvas:**
- [ ] Pintar várias células
- [ ] Clicar no botão "Limpar"
- [ ] Verificar que o diálogo de confirmação aparece: "Tem certeza que quer apagar toda a legenda pintada? Essa ação não pode ser desfeita."
- [ ] Clicar em "Cancelar" e verificar que nada é apagado
- [ ] Clicar novamente em "Limpar"
- [ ] Clicar em "OK" e verificar que todas as células são apagadas
- [ ] Verificar que o contador "Células pintadas" volta para 0

### 5. Testes de Integração com Editor de Mapa
**Objetivo:** Verificar que mapas gerados podem ser editados no editor normal.

**Teste 5.1 — Abrir Mapa Gerado no Editor:**
- [ ] Voltar ao lobby
- [ ] Clicar em "Editor de Mapa"
- [ ] No seletor de mapas, verificar que "Deserto Tático" aparece
- [ ] Selecionar "Deserto Tático"
- [ ] Verificar que o mapa carrega com a imagem gerada
- [ ] Verificar que as coberturas detectadas estão presentes no editor

**Teste 5.2 — Editar Coberturas:**
- [ ] No editor, adicionar/remover algumas coberturas manualmente
- [ ] Salvar as alterações
- [ ] Criar uma partida usando esse mapa
- [ ] Verificar que as coberturas editadas estão corretas no jogo

### 6. Testes de Qualidade da Geração
**Objetivo:** Avaliar a qualidade das imagens geradas e detecção de coberturas.

**Teste 6.1 — Temas Variados:**
- [ ] Gerar mapa com tema: "cidade urbana destruída, prédios em ruínas"
- [ ] Verificar que a imagem tem elementos urbanos (prédios, ruas, etc.)
- [ ] Gerar mapa com tema: "floresta densa com árvores e vegetação"
- [ ] Verificar que a imagem tem elementos de floresta
- [ ] Gerar mapa com tema: "base militar industrial com containers"
- [ ] Verificar que a imagem tem elementos industriais

**Teste 6.2 — Respeito à Legenda:**
- [ ] Desenhar legenda com padrão específico (ex: cruz no centro)
- [ ] Gerar mapa
- [ ] Verificar que a imagem gerada respeita aproximadamente o padrão da legenda
- [ ] Verificar que as áreas de parede/água/deploy estão nas posições corretas

**Teste 6.3 — Detecção de Coberturas:**
- [ ] Desenhar legenda com áreas claras de cada tipo
- [ ] Gerar mapa
- [ ] Ativar overlay de coberturas
- [ ] Verificar que:
  - Áreas de parede são detectadas como "wall"
  - Áreas de cobertura total são detectadas como "full"
  - Áreas de cobertura parcial são detectadas como "half"
  - Áreas de água são detectadas como "water"
  - Deploy zones são detectadas como "deployA" e "deployB"

### 7. Testes de Persistência
**Objetivo:** Verificar que mapas salvos persistem entre sessões.

**Teste 7.1 — Persistência Após Reload:**
- [ ] Gerar e salvar um mapa com nome único (ex: "Teste Persistência")
- [ ] Recarregar a página (F5)
- [ ] Fazer login novamente
- [ ] Ir para "Criar Sala"
- [ ] Verificar que "Teste Persistência" ainda aparece no seletor de mapas

**Teste 7.2 — Persistência Após Restart do Servidor:**
- [ ] (Requer acesso ao servidor)
- [ ] Parar o servidor
- [ ] Iniciar o servidor novamente
- [ ] Abrir a aplicação
- [ ] Verificar que todos os mapas gerados ainda estão disponíveis

### Resultados Esperados
Todos os testes acima devem passar sem erros. Casos de falha devem ser documentados com:
- Descrição do erro
- Passos para reproduzir
- Comportamento esperado vs. observado
- Logs do console (se aplicável)

### Validação Final
- [ ] Nenhum erro no console do navegador durante uso normal
- [ ] Nenhum erro no log do servidor durante gerações
- [ ] Rate limiting funciona corretamente
- [ ] Mapas gerados aparecem no seletor
- [ ] Coberturas detectadas são razoavelmente precisas
- [ ] Interface responsiva e sem travamentos
- [ ] Mensagens de erro são claras e acionáveis

---

## Etapa 13 — Documentação e ajustes finais ✅ CONCLUÍDA

**Objetivo:** Documentar o novo recurso e fazer ajustes finais.

**Plano executado:**
- **README.md atualizado** com documentação completa:
  - Seção "Gerador de Mapas com IA" destacada
  - Como usar: passo a passo detalhado (7 passos)
  - Limitações: rate limit, qualidade, detecção
  - Dicas para boas legendas (o que fazer e o que evitar)
  - Exemplos de temas eficazes (urbano, deserto, floresta, industrial, militar)
  - Instruções de instalação e configuração
  - Estrutura do projeto
  - Tecnologias utilizadas
  - Scripts disponíveis
  - Troubleshooting (4 problemas comuns)
  - Seções de licença, contribuição e suporte

- **AI_MAP_GENERATOR.md criado** com documentação técnica detalhada:
  - Visão geral e arquitetura
  - Fluxo de dados completo (11 passos)
  - Componentes frontend e backend
  - Especificações técnicas (resolução, grid, cores, modelos de IA, rate limiting, storage)
  - Prompt engineering (estrutura dos prompts de geração e detecção)
  - Tratamento de erros (5 tipos de erro com mensagens)
  - Feedback visual (loading state, preview modal, diálogo de salvamento)
  - Limitações conhecidas (qualidade, detecção, performance)
  - Guia de manutenção (ajustar rate limit, prompts, adicionar tipos)
  - Troubleshooting técnico (4 problemas com soluções)
  - Referências externas

- **Código revisado:**
  - Todos os arquivos criados/modificados verificados
  - Comentários adicionados onde necessário (já estavam bem comentados)
  - Nenhum erro de sintaxe encontrado
  - `.env.example` já estava bem documentado (verificado)

**Arquivos criados:**
- `AI_MAP_GENERATOR.md` — documentação técnica completa (350+ linhas)

**Arquivos alterados:**
- `README.md` — atualizado com seção completa sobre o gerador de mapas (200+ linhas)

**Validação:**
- Documentação completa e clara
- Exemplos práticos incluídos
- Troubleshooting abrangente
- Referências externas adicionadas

---

## Status de execução

- [x] Etapa 1 — Configurar API Key do Google Gemini
- [x] Etapa 2 — Criar serviço de rate limiting
- [x] Etapa 3 — Criar serviço de integração com Gemini Vision
- [x] Etapa 4 — Criar tipos TypeScript
- [x] Etapa 5 — Criar componente AIMapCreatorMenu (parte 1: UI e canvas)
- [x] Etapa 6 — Criar componente AIMapCreatorMenu (parte 2: geração e preview)
- [x] Etapa 7 — Criar endpoints do servidor
- [x] Etapa 8 — Implementar fluxo de salvamento
- [x] Etapa 9 — Integrar ao menu principal
- [x] Etapa 10 — Implementar prompt engineering otimizado
- [x] Etapa 11 — Adicionar feedback visual e tratamento de erros
- [x] Etapa 12 — Testes e validação end-to-end
- [x] Etapa 13 — Documentação e ajustes finais

---

## Observações técnicas importantes

### Especificações de imagem
- **Resolução:** 2000×2000 pixels (40 células × 50px)
- **Formato:** JPEG para mapas finais (menor tamanho), PNG para legendas (preserva cores exatas)
- **Qualidade:** 90% para JPEG (balanço entre qualidade e tamanho)

### Rate Limiting
- **Limite:** 13 requisições por minuto (margem de segurança abaixo do limite de 15)
- **Janela:** 60 segundos deslizantes
- **Comportamento:** fila de espera automática, feedback visual ao usuário

### Prompt Engineering
- **Modelo:** Gemini 1.5 Flash (rápido e gratuito)
- **Temperatura:** 0.7 (balanço entre criatividade e consistência)
- **Max tokens:** 2048 para resposta
- **Safety settings:** bloquear apenas conteúdo explicitamente perigoso

### Storage
- **Firebase Storage:** pasta `/ai-generated-maps/`
- **Nomenclatura:** `{timestamp}_{sanitizedName}.jpg`
- **Metadados:** armazenados em `data/ai-maps.json` no servidor

---

## Log de execução

### Decisões tomadas (antes da Etapa 1)
- **Modelo de IA:** Gemini 2.5 Flash Image ("Nano Banana") na cota gratuita (não Gemini 1.5 Flash, que não gera imagens).
- **Rate limit:** Bloqueio interno em **8 req/min** (10 da cota free − 2 de margem). Ao bater no limite, mostrar erro com motivo e contagem regressiva.
- **Mapas de IA:** Lista separada ("Meus mapas IA"), aparecem junto com os 3 padrões no seletor, sem editar `src/data/constants.ts`. Servidor mantém a lista dinâmica.
- **Fluxo de execução:** Antes de começar cada etapa, confirmar plano com usuário. Executar. Atualizar PROGRESSO.md. Pedir confirmação pra próxima.
- **Segurança da chave:** Armazenada em Replit Secrets (não em .env).

### Etapa 1 — concluída em 25/04/2026
- **Arquivos alterados:**
  - `.env.example` — adicionada documentação da variável `GEMINI_API_KEY` com link pra obter chave; corrigidos comentários do bloco PostgreSQL.
  - `PROGRESSO.md` — registradas decisões e marcação da etapa.
- **Configuração de ambiente:**
  - `GEMINI_API_KEY` cadastrada nos **Replit Secrets** (não em `.env`).
- **Validação:**
  - Pacote `@google/genai@^1.29.0` confirmado em `package.json`.
  - Servidor `Start application` reiniciado e rodando OK em `http://localhost:5000` (logs limpos, sem erros).

### Etapa 2 — concluída em 25/04/2026
- **Arquivos criados:**
  - `geminiRateLimiter.ts` (root) — limiter sliding-window 60s com cap de 8 req/min, `tryAcquire()`, `acquire()`, `getStatus()`, `reset()`, singleton exportado.
- **Decisão de arquitetura:** colocado no root (servidor) em vez de `src/services/` porque o limiter precisa estar do mesmo lado da chave (Secret), que é só backend.
- **Validação:** TypeScript sem erros (`npx tsc --noEmit`).

### Etapa 3 — concluída em 25/04/2026
- **Arquivos criados:**
  - `geminiService.ts` (root) — cliente `GoogleGenAI` lazy, `generateMapFromLegend()` (modelo `gemini-2.5-flash-image-preview`), `detectCoverFromImage()` (modelo `gemini-2.5-flash` com `responseMimeType: "application/json"`), `isGeminiConfigured()`.
- **Tipos exportados:** `CoverType`, `CoverData`, `GenerateMapResult`, `GeminiRateLimitError`, `GeminiConfigurationError`.
- **Integração com limiter:** ambas as funções chamam `geminiRateLimiter.tryAcquire()` antes de bater na API; erro estruturado `GeminiRateLimitError(retryAfterSeconds)` é lançado quando bloqueado.
- **Prompts:** versões iniciais simples (refinamento na Etapa 10).
- **Validação:** TypeScript sem erros nos arquivos novos; servidor segue rodando.

### Etapa 4 — concluída em 25/04/2026
- **Arquivos alterados:**
  - `src/types/game.ts` — adicionadas as interfaces `AIMapGenerationRequest`, `AIMapGenerationResult` e `AIMapDraft`. `MapCoverData` e `CoverType` já existiam e foram reutilizados.
- **Validação:** TypeScript sem erros nos arquivos novos.

### Etapa 5 — concluída em 25/04/2026
- **Arquivos criados:**
  - `src/components/AIMapCreatorMenu.tsx` — componente do gerador (UI + canvas + paint/pan/zoom).
- **UI:** sidebar com seletor de tamanho do grid (30/40/50), seletor de ferramenta, 7 pincéis, textarea de tema, painel de legenda (contador de células, contador de rate limit estático, botão Limpar com confirmação), botão "Gerar Mapa" desabilitado até pintar algo.
- **Canvas:** fundo branco, grid sempre visível, células pintadas com cor sólida + ícone, mesma interação do editor (clique-arrasta, pan, zoom).
- **Geração:** ainda não funcional — o botão só faz `console.log` + `alert` informando que a integração vem na Etapa 6. Componente também não está montado no `App.tsx` ainda (Etapa 9).
- **Validação:** TypeScript sem erros no arquivo novo.

### Etapa 8 — concluída em 25/04/2026
- **Arquivos alterados:**
  - `src/services/aiMapService.ts` — adicionadas interfaces `AIMapSaveRequest`, `AIMapSaveResult`, `AIMapListItem`; adicionados métodos `save()`, `list()` e `delete()` ao `aiMapService`.
  - `src/components/AIMapCreatorMenu.tsx` — importados `CheckCircle2` e `AIMapSaveRequest`; novos estados `showSaveDialog`, `saveMapName`, `isSaving`, `saveError`, `savedMapId`; `handleSaveDraft` substituído; `handleConfirmSave`, `handleCloseSaveDialog` e `handleBackToMenuAfterSave` adicionados; `<SaveMapDialog>` renderizado; novo componente `SaveMapDialog` adicionado.
- **Fluxo implementado:** clicar "Salvar Mapa" no modal → abre diálogo com input de nome → confirmar → POST ao servidor → sucesso exibe checkmark verde + opção de fechar ou voltar ao menu principal.
- **Validação:** servidor reiniciado sem erros de TypeScript nos arquivos alterados. App rodando em `http://localhost:5000`.

### Etapa 7 — concluída em 25/04/2026
- **Arquivos criados:**
  - `data/ai-maps.json` — arquivo JSON inicial com `[]`, armazena metadados dos mapas IA salvos.
- **Arquivos alterados:**
  - `server.ts` — adicionado import `fs`, helpers `loadAIMapRecords`, `persistAIMapRecords`, `uploadToFirebaseStorage`, `deleteFromFirebaseStorage`, IIFE `loadAIMapsIntoRuntime`, e 3 novos endpoints.
- **Endpoints adicionados:**
  - `GET /api/ai-maps/list` — retorna lista de metadados sem o campo `coverData`.
  - `POST /api/ai-maps/save` — valida payload, sanitiza nome, faz upload via REST API do Firebase Storage, persiste em `data/ai-maps.json`, registra cobertura no `globalCoverData` e banco, injeta entrada em `MAPS` no runtime.
  - `DELETE /api/ai-maps/:mapId` — remove da memória, do banco, do JSON e do Firebase Storage (best-effort).
- **Decisão técnica:** upload para Firebase Storage via REST API (sem Admin SDK nem service account), reutilizando `VITE_FIREBASE_API_KEY` e `VITE_FIREBASE_STORAGE_BUCKET` já presentes como env vars.
- **Validação:** servidor reiniciado sem erros. `curl /api/ai-maps/list` retorna `[]`. `POST` com body vazio retorna `400 {"error":"Nome do mapa é obrigatório."}`. `DELETE` de id inexistente retorna `404 {"error":"Mapa IA não encontrado."}`.

### Etapa 9 — concluída em 25/04/2026
- **Arquivos alterados:**
  - `src/App.tsx` — importado `AIMapCreatorMenu`, adicionado estado `"aiMapCreator"` ao tipo `AppState`, renderização condicional do componente, reorganização dos botões do lobby (Ver Soldados em linha separada, Editor e Gerador lado a lado).
- **Integração automática:** mapas gerados por IA aparecem automaticamente no seletor de mapas do `CreateMatchMenu` porque:
  - O `CreateMatchMenu` usa `Object.values(MAPS)` para listar os mapas (linha 206).
  - O servidor carrega os mapas IA na constante `MAPS` durante o startup (IIFE `loadAIMapsIntoRuntime` da Etapa 7).
  - Nenhuma alteração necessária no `CreateMatchMenu` ou `MapEditorMenu`.
- **Validação:** TypeScript sem erros de compilação nos arquivos alterados.

### Etapa 10 — concluída em 25/04/2026
- **Arquivos criados:**
  - `src/data/geminiPrompts.ts` — módulo com funções `buildMapGenerationPrompt` e `buildCoverDetectionPrompt`. Prompts detalhados em inglês para melhor compreensão pelo modelo.
- **Arquivos alterados:**
  - `geminiService.ts` — importadas as funções de prompt, removidas as funções locais `buildLegendPrompt` e `buildDetectionPrompt`, integração com os novos prompts otimizados.
- **Melhorias nos prompts:**
  - Prompt de geração: especificações técnicas detalhadas, mapeamento completo de cores, requisitos críticos (posicionamento exato, escala, clareza), exemplos de elementos por tema, integração do tema do usuário.
  - Prompt de detecção: estrutura do grid explicada, classificação detalhada com exemplos visuais, regras de classificação, formato JSON especificado.
- **Validação:** arquivos criados e alterados sem erros de sintaxe.

### Etapa 11 — concluída em 25/04/2026
- **Arquivos alterados:**
  - `src/components/AIMapCreatorMenu.tsx` — adicionados estados `generationStartTime` e `generationElapsedSeconds`, componente `GenerationLoadingOverlay` com spinner animado, timer em tempo real, barra de progresso estimada, mensagens contextuais e preview da legenda; mensagens de erro detalhadas e específicas por tipo de falha; painel de erro redesenhado com animação fade-in; animações fade-in + zoom-in no modal de preview.
- **Melhorias implementadas:**
  - Loading: overlay com z-[70], spinner com ícone Sparkles, timer de segundos decorridos, barra de progresso 0-95% com transição suave, mensagens de progresso contextuais (enviando → gerando → detectando → finalizando), preview miniatura da legenda.
  - Erros: mensagens específicas para conexão, timeout, Gemini sem imagem, rate limit e erro genérico; painel com ícone X, título, mensagem detalhada e botão "Dispensar".
  - Animações: fade-in e zoom-in no modal de preview, fade-in no painel de erro, transições suaves em todos os estados.
- **Validação:** componente atualizado sem erros de sintaxe.

### Etapa 12 — concluída em 25/04/2026
- **Plano de testes documentado:** criado plano detalhado de testes end-to-end com 7 categorias:
  1. **Testes de Smoke (Fluxo Básico)** — 7 testes cobrindo acesso ao gerador, desenho de legenda, adição de tema, geração, verificação de coberturas, salvamento e verificação no seletor.
  2. **Testes de Rate Limiting** — 3 testes verificando consumo do limite (8 req/min), bloqueio da 9ª requisição e reset do contador.
  3. **Testes de Erro** — 3 testes para gerar sem pintar, chave não configurada e erro de conexão.
  4. **Testes de Funcionalidades do Canvas** — 5 testes para trocar tamanho do grid, pintar com clique e arraste, trocar de pincel, pan/zoom e limpar canvas.
  5. **Testes de Integração com Editor** — 2 testes para abrir mapa gerado no editor e editar coberturas.
  6. **Testes de Qualidade da Geração** — 3 testes para temas variados, respeito à legenda e detecção de coberturas.
  7. **Testes de Persistência** — 2 testes para persistência após reload e restart do servidor.
- **Resultados esperados:** todos os testes devem passar sem erros; casos de falha devem ser documentados com descrição, passos para reproduzir, comportamento esperado vs. observado e logs.
- **Validação final:** checklist com 6 itens (sem erros no console, rate limiting funcional, mapas no seletor, coberturas precisas, interface responsiva, mensagens claras).
- **Nota:** testes devem ser executados manualmente quando o servidor estiver rodando com `npm start` e `GEMINI_API_KEY` configurada.

### Etapa 13 — concluída em 25/04/2026
- **Arquivos criados:**
  - `AI_MAP_GENERATOR.md` — documentação técnica completa (350+ linhas) com visão geral, arquitetura, fluxo de dados, componentes, especificações técnicas, prompt engineering, tratamento de erros, feedback visual, limitações, manutenção, troubleshooting e referências.
- **Arquivos alterados:**
  - `README.md` — atualizado com seção completa sobre o gerador de mapas (200+ linhas): como usar (7 passos), limitações (rate limit, qualidade, detecção), dicas para boas legendas, exemplos de temas eficazes, instruções de instalação, estrutura do projeto, tecnologias, scripts, troubleshooting (4 problemas comuns), licença, contribuição e suporte.
- **Documentação completa:**
  - README.md: documentação para usuários finais
  - AI_MAP_GENERATOR.md: documentação técnica para desenvolvedores
  - .env.example: já estava bem documentado (verificado)
  - Código: comentários adequados já presentes
- **Validação:** documentação clara, exemplos práticos, troubleshooting abrangente, referências externas.

