# Gerador de Mapas com IA — Documentação Técnica

## Visão Geral

O Gerador de Mapas com IA permite criar mapas táticos realistas usando Google Gemini Vision API. O usuário desenha uma "legenda" simples em um canvas branco, adiciona um tema opcional, e a IA gera uma imagem fotorrealista que respeita as áreas marcadas e detecta automaticamente as coberturas.

## Arquitetura

### Fluxo de Dados

```
1. Usuário desenha legenda no canvas (frontend)
   ↓
2. Canvas é rasterizado para PNG base64 (buildLegendImage)
   ↓
3. POST /api/ai-maps/generate (legendImage + userPrompt + gridSize)
   ↓
4. Servidor verifica rate limit (geminiRateLimiter)
   ↓
5. Gemini 2.5 Flash Image gera imagem realista (generateMapFromLegend)
   ↓
6. Gemini 2.5 Flash detecta coberturas (detectCoverFromImage)
   ↓
7. Servidor retorna { generatedImage, detectedCover }
   ↓
8. Frontend exibe preview com overlay de coberturas
   ↓
9. Usuário salva → POST /api/ai-maps/save
   ↓
10. Upload para Firebase Storage + registro em data/ai-maps.json
    ↓
11. Mapa disponível no seletor de mapas
```

### Componentes

#### Frontend

- **`AIMapCreatorMenu.tsx`** — Interface principal do gerador
  - Canvas de legenda com ferramentas de pintura
  - Seletor de tamanho do grid (30×30, 40×40, 50×50)
  - Campo de tema opcional
  - Botão "Gerar Mapa" com loading aprimorado
  - Modal de preview com toggle de coberturas
  - Diálogo de salvamento

- **`aiMapService.ts`** — Cliente HTTP para API de mapas IA
  - `getStatus()` — busca contador de rate limit
  - `generate()` — envia legenda e recebe mapa gerado
  - `save()` — salva mapa no servidor
  - `list()` — lista mapas gerados
  - `delete()` — remove mapa

- **`geminiPrompts.ts`** — Templates de prompt otimizados
  - `buildMapGenerationPrompt()` — prompt para geração de imagem
  - `buildCoverDetectionPrompt()` — prompt para detecção de coberturas

#### Backend

- **`geminiService.ts`** — Integração com Gemini API
  - `generateMapFromLegend()` — gera imagem usando Gemini 2.5 Flash Image
  - `detectCoverFromImage()` — detecta coberturas usando Gemini 2.5 Flash
  - `isGeminiConfigured()` — verifica se a chave está configurada

- **`geminiRateLimiter.ts`** — Rate limiting
  - Janela deslizante de 60 segundos
  - Limite de 8 requisições por minuto
  - `tryAcquire()` — tenta reservar slot
  - `getStatus()` — retorna estado atual

- **`server.ts`** — Endpoints HTTP
  - `GET /api/ai-maps/status` — status do rate limiter
  - `POST /api/ai-maps/generate` — gera mapa
  - `POST /api/ai-maps/save` — salva mapa
  - `GET /api/ai-maps/list` — lista mapas
  - `DELETE /api/ai-maps/:mapId` — remove mapa

## Especificações Técnicas

### Resolução e Grid

- **Resolução da imagem:** `gridWidth × 50px` por `gridHeight × 50px`
  - Grid 40×40 → 2000×2000 pixels
  - Grid 30×30 → 1500×1500 pixels
  - Grid 50×50 → 2500×2500 pixels
- **Tamanho da célula:** 50×50 pixels
- **Formato:** PNG para legenda, JPEG/PNG para mapa gerado

### Cores da Legenda

As cores usadas na legenda correspondem aos elementos descritos no prompt:

| Tipo | Cor Hex | Descrição |
|------|---------|-----------|
| Vazio | `#ffffff` | Piso navegável vazio |
| Meia Cobertura | `#f5c518` | Amarelo — carros, muros baixos, caixas |
| Cobertura Total | `#dc2626` | Vermelho — prédios, containers, paredes altas |
| Parede | `#3a3a3a` | Cinza escuro — muros sólidos intransponíveis |
| Deploy A | `#16a34a` | Verde — zona de deploy do time A |
| Deploy B | `#ea580c` | Laranja — zona de deploy do time B |
| Água | `#1d4ed8` | Azul — rios, lagos |

### Modelos de IA

- **Geração de Imagem:** `gemini-2.5-flash-image-preview` (Nano Banana)
  - Entrada: imagem da legenda + prompt textual
  - Saída: imagem PNG/JPEG em base64
  - Tempo médio: 15-30 segundos

- **Detecção de Coberturas:** `gemini-2.5-flash`
  - Entrada: imagem gerada + prompt de classificação
  - Saída: JSON `{ "x,y": "tipo" }`
  - Tempo médio: 5-10 segundos
  - `responseMimeType: "application/json"` para forçar JSON

### Rate Limiting

- **Limite:** 8 requisições por minuto (margem de segurança)
- **Cota gratuita do Gemini:** 10 requisições por minuto
- **Janela:** 60 segundos deslizantes
- **Comportamento:** bloqueia requisições excedentes, retorna `retryAfterSeconds`

### Storage

- **Firebase Storage:** pasta `/ai-generated-maps/`
- **Nomenclatura:** `{timestamp}_{sanitizedName}.jpg`
- **Metadados:** armazenados em `data/ai-maps.json`
- **Upload:** via REST API (sem Admin SDK)

## Prompt Engineering

### Prompt de Geração

O prompt de geração (`buildMapGenerationPrompt`) inclui:

1. **Contexto:** "You are a tactical map generator for a grid-based tactical combat game"
2. **Especificações técnicas:** resolução, grid, tamanho das células
3. **Mapeamento de cores:** cada cor da legenda → elementos visuais realistas
4. **Requisitos críticos:**
   - Posicionamento exato (não deslocar elementos)
   - Escala consistente (50px por célula)
   - Clareza visual (tipos de cobertura distinguíveis)
   - Estilo realista (fotorrealista, não cartoon)
   - Tema coeso (elementos combinam entre si)
5. **Exemplos:** boas escolhas de elementos por tema (urbano, deserto, floresta, etc.)
6. **Tema do usuário:** integrado ao final do prompt

### Prompt de Detecção

O prompt de detecção (`buildCoverDetectionPrompt`) inclui:

1. **Estrutura do grid:** coordenadas, tamanho das células
2. **Classificação:** definição de cada tipo de cobertura com exemplos visuais
3. **Regras:** quando em dúvida, escolher o tipo mais protetor
4. **Formato de saída:** JSON `{ "x,y": "tipo" }`, apenas células não-vazias

## Tratamento de Erros

### Tipos de Erro

1. **`GeminiRateLimitError`**
   - Lançado quando o rate limit é excedido
   - Contém `retryAfterSeconds`
   - HTTP 429 no servidor
   - Mensagem: "Limite de requisições atingido. Aguarde X segundos..."

2. **`GeminiConfigurationError`**
   - Lançado quando `GEMINI_API_KEY` não está configurada
   - HTTP 503 no servidor
   - Mensagem: "GEMINI_API_KEY não configurada no servidor..."

3. **Erro de Conexão**
   - Network error, fetch failed
   - Mensagem: "Erro de conexão. Verifique sua internet..."

4. **Timeout**
   - Geração demorou mais de 60 segundos (timeout do fetch)
   - Mensagem: "A geração demorou muito. Tente simplificar a legenda..."

5. **Gemini Sem Imagem**
   - Gemini não retornou uma imagem válida
   - Mensagem: "O Gemini não conseguiu gerar uma imagem. Tente ajustar a legenda..."

## Feedback Visual

### Loading State

Durante a geração, o componente `GenerationLoadingOverlay` exibe:

- **Spinner animado** com ícone Sparkles
- **Timer em tempo real** mostrando segundos decorridos
- **Barra de progresso estimada** (0-95%) com transição suave
- **Mensagens contextuais:**
  - 0-30%: "Enviando legenda para o Gemini..."
  - 30-60%: "Gerando imagem realista..."
  - 60-90%: "Detectando coberturas..."
  - 90-95%: "Finalizando..."
- **Preview miniatura** da legenda enviada

### Preview Modal

Após a geração, o modal de preview exibe:

- **Animação fade-in + zoom-in** ao aparecer
- **Imagem gerada** em tamanho fit-to-screen
- **Toggle "Mostrar/Ocultar coberturas"** para verificar detecção
- **Botões:**
  - "Gerar Novamente" — refaz a geração com a mesma legenda
  - "Salvar Mapa" — abre diálogo de salvamento

### Diálogo de Salvamento

- **Estado de input:**
  - Campo de texto (máximo 50 caracteres)
  - Contador de caracteres
  - Botões "Cancelar" e "Salvar Mapa"
  - Enter confirma
- **Estado de sucesso:**
  - Ícone verde de checkmark
  - Mensagem "Mapa salvo!"
  - Nome do mapa confirmado
  - Botões "Fechar" e "Voltar ao Menu"

## Limitações Conhecidas

### Qualidade da Geração

- A IA pode não respeitar 100% a legenda (variação natural)
- Áreas muito pequenas (1-2 células) podem ser ignoradas
- Elementos podem ser simplificados ou generalizados
- Temas vagos produzem resultados genéricos

### Detecção de Coberturas

- A detecção é uma estimativa baseada em visão computacional
- Pode haver falsos positivos/negativos
- Áreas de transição podem ser classificadas incorretamente
- Deploy zones podem não ser detectadas se não forem visualmente distintas

### Performance

- Geração pode levar até 30 segundos
- Rate limit de 8 req/min compartilhado por todos os usuários
- Imagens grandes (50×50) podem demorar mais

## Manutenção

### Ajustar Rate Limit

Edite `geminiRateLimiter.ts`:

```typescript
const WINDOW_MS = 60_000;  // Janela de 60 segundos
const MAX_REQUESTS = 8;    // Máximo de requisições
```

### Ajustar Prompts

Edite `src/data/geminiPrompts.ts`:

- Modifique `buildMapGenerationPrompt()` para ajustar geração
- Modifique `buildCoverDetectionPrompt()` para ajustar detecção

### Adicionar Novos Tipos de Cobertura

1. Adicione o tipo em `src/types/game.ts`:
   ```typescript
   export type CoverType = "none" | "half" | "full" | "wall" | "water" | "deployA" | "deployB" | "novo_tipo";
   ```

2. Adicione o pincel em `AIMapCreatorMenu.tsx`:
   ```typescript
   const BRUSHES: BrushOption[] = [
     // ...
     { id: "novo_tipo", label: "Novo Tipo", /* ... */ },
   ];
   ```

3. Atualize os prompts em `geminiPrompts.ts` para incluir o novo tipo

4. Atualize `COVER_TYPES` em `geminiService.ts`

## Troubleshooting

### Geração Falha Sempre

1. Verifique que `GEMINI_API_KEY` está configurada
2. Verifique logs do servidor para erros da API
3. Teste a chave diretamente: `curl -H "x-goog-api-key: SUA_CHAVE" https://generativelanguage.googleapis.com/v1beta/models`

### Coberturas Não Detectadas

1. Verifique que a imagem gerada tem elementos visuais claros
2. Simplifique a legenda (menos tipos, áreas maiores)
3. Use temas mais específicos
4. Edite manualmente no Editor de Mapas

### Rate Limit Não Reseta

1. Verifique que o servidor não foi reiniciado (o limiter é in-memory)
2. Aguarde 60 segundos completos
3. Verifique logs do servidor para erros no limiter

### Imagens Não Salvam

1. Verifique que Firebase Storage está configurado
2. Verifique que `VITE_FIREBASE_API_KEY` e `VITE_FIREBASE_STORAGE_BUCKET` estão corretos
3. Verifique permissões do Storage no Firebase Console
4. Verifique logs do servidor para erros de upload

## Referências

- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini 2.5 Flash Image Preview](https://ai.google.dev/gemini-api/docs/models/gemini-v2)
- [Firebase Storage REST API](https://firebase.google.com/docs/storage/web/upload-files)
- [Prompt Engineering Guide](https://ai.google.dev/docs/prompt_best_practices)
