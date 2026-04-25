# Arquitetura do Call of War VTT

## Visão Geral
Sistema de Virtual Tabletop (VTT) tático baseado em turnos para simular combates militares entre duas facções: USA e Terroristas (TR). O projeto usa React + TypeScript no frontend e Express.js no backend, com comunicação via API REST.

---

## Stack Tecnológica

### Frontend
- **React 19** com TypeScript
- **Vite** como bundler
- **TailwindCSS 4** para estilização
- **Lucide React** para ícones
- **Motion** para animações
- **nanoid** para geração de IDs

### Backend
- **Express.js** com TypeScript
- **tsx** para execução de TypeScript no Node
- Servidor integrado com Vite em desenvolvimento

---

## Estrutura de Arquivos

```
codigo/
├── src/
│   ├── App.tsx                      # Componente principal e lógica de batalha
│   ├── main.tsx                     # Entry point do React
│   ├── index.css                    # Estilos globais
│   ├── types/
│   │   └── game.ts                  # Definições de tipos TypeScript
│   ├── data/
│   │   └── constants.ts             # Constantes do jogo (armas, classes, mapas)
│   ├── components/
│   │   ├── CreateMatchMenu.tsx      # Menu de criação de partida
│   │   ├── MapEditorMenu.tsx        # Editor de cobertura de mapas
│   │   └── SoldiersInfoMenu.tsx     # Enciclopédia de soldados/equipamentos
│   └── lib/
│       └── utils.ts                 # Utilitários (cn para classnames)
├── server.ts                        # Servidor Express + lógica de jogo
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CLAUDE.md                        # Regras do sistema de jogo
```

---

## Fluxo de Estados da Aplicação

### Estados Principais (App.tsx)
```typescript
type AppState = "login" | "menu" | "soldiers" | "createMatch" | "editor" | "battle"
```

1. **login**: Tela inicial onde o jogador insere seu nome
2. **menu**: Menu principal com 3 opções (Criar Partida, Editor de Mapa, Ver Soldados)
3. **soldiers**: Enciclopédia de classes, armas, coletes e habilidades
4. **createMatch**: Interface de montagem de exércitos (draft)
5. **editor**: Editor visual de cobertura de mapas
6. **battle**: Campo de batalha principal com grid tático

---

## Modelos de Dados (types/game.ts)

### Unit (Unidade de Combate)
```typescript
{
  id: string                    // UUID único
  team: string                  // 'A' ou 'B'
  className: string             // Ex: "USA_Assalto", "TR_Sniper"
  x: number                     // Posição X em pixels
  y: number                     // Posição Y em pixels
  rotation: number              // Rotação em graus
  hp: number                    // Pontos de vida atuais
  armorName: string | null      // Nome do colete equipado
  weaponName: string | null     // Nome da arma equipada
  attachments: string[]         // Acessórios (Red Dot, Grip, etc)
  skills: string[]              // Habilidades especiais
  movedThisTurn: number         // Distância movida no turno (em metros)
}
```

### GameState (Estado Global do Jogo)
```typescript
{
  units: Record<string, Unit>   // Dicionário de unidades por ID
  logs: LogEntry[]              // Histórico de combate
  mapId: string                 // ID do mapa atual
}
```

### MapCoverData (Cobertura do Mapa)
```typescript
{
  [cellKey: string]: CoverType  // Ex: "10,5": "half"
}

type CoverType = 'none' | 'half' | 'full'
```

---

## Constantes do Sistema (data/constants.ts)

### Escala Espacial
```typescript
CELL_SIZE = 50px              // Tamanho de cada célula do grid
METERS_PER_CELL = 1.5m        // Conversão pixel → metros

SCALE = {
  MOVIMENTO_BASE: 10m         // Movimento padrão por turno
  RAIO_VISAO_BASE: 40m        // Alcance de visão
  ALCANCE_CURTO: 20m          // Armas de curto alcance (Saiga 12)
  ALCANCE_MEDIO: 40m          // Armas de médio alcance (AK-47, M16, M60)
  ALCANCE_LONGO: 60m          // Armas de longo alcance (Barret M82, Morteiro)
}
```

### Classes de Soldados (CLASSES)
Cada facção (USA/TR) tem 5 classes:
- **Assalto**: 6 HP, 80% hit, 10.5m movimento
- **Suporte**: 5 HP, 70% hit, 10.5m movimento
- **Médico**: 5 HP, 60% hit, 10.5m movimento
- **Granadeiro**: 5 HP, 70% hit, 10.5m movimento
- **Sniper**: 4 HP, 90% hit, 10.5m movimento

### Armas (WEAPONS)
```typescript
{
  name: string
  category: string              // Fuzil, Escopeta, Rifle, etc
  points: number                // Custo em pontos
  damage: number                // Dano base
  critical: number              // Dano crítico
  shots: number                 // Disparos por recarga
  reload: number                // Número de recargas
  range: 'Curto' | 'Médio' | 'Longo'
}
```

Exemplos: AK-47, M16, Saiga 12, Barret M82, M60, Morteiro

### Coletes (ARMORS)
```typescript
{
  name: string
  points: number                // Custo em pontos
  slots: number                 // Slots para acessórios
  movePenal: number             // Penalidade de movimento (metros)
  reduction: number             // Redução de dano
}
```

Exemplos: Tático Leve, Moderado, Pesado, Cinto Tático

### Acessórios (ATTACHMENTS)
- **Objetiva**: +20% hit, +10% crit (proibido em curta)
- **Red Dot**: +10% hit até 40m
- **Grip**: +5% hit
- **Bi-pé**: +5% crit se deitado

### Habilidades (SKILLS)
- **Linha de Frente** (Assalto): Atirar em qualquer ponto do movimento
- **Sexto Sentido** (Assalto): Movimento livre se inimigo errar pelas costas
- **Emboscada** (Suporte): Atirar em CADA inimigo que entrar no FOV na Guarda
- **Médico de Combate** (Médico): +2 cura por kit
- **Disparo Compensado** (Sniper): +10m alcance do rifle

---

## Componentes React

### App.tsx (Componente Principal)
**Responsabilidades:**
- Gerenciamento de estados da aplicação
- Renderização do campo de batalha
- Sistema de câmera (pan/zoom)
- Seleção de unidades
- Modos de ação (mover/atirar)
- Cálculo de cobertura em linha de visão
- Confirmação de ataques com preview

**Estados Locais:**
```typescript
appState: AppState                    // Estado da aplicação
gameState: GameState | null           // Estado do jogo
mapCoverConfig: MapCoverData          // Configuração de cobertura
selectedUnitId: string | null         // Unidade selecionada
targetMode: "move" | "shoot" | null   // Modo de ação
zoom: number                          // Nível de zoom (0.4 padrão)
camera: {x, y}                        // Posição da câmera
isPanning: boolean                    // Estado de pan
pendingShootAction: {...}             // Ação de tiro pendente
```

**Funções Principais:**
- `fetchState()`: Busca estado do servidor a cada 1s
- `handleCanvasClick()`: Processa cliques no mapa (movimento)
- `handleUnitClick()`: Processa cliques em unidades (seleção/ataque)
- `checkLineCover()`: Calcula cobertura entre duas unidades
- `executeShoot()`: Executa ataque confirmado

### CreateMatchMenu.tsx
**Responsabilidades:**
- Montagem de exércitos (draft)
- Sistema de pontos (MAX_POINTS = 100 por equipe)
- Seleção de mapa
- Configuração de unidades (classe, arma, colete, acessórios, habilidades)
- Validação de slots de acessórios
- Posicionamento inicial das unidades

**Lógica de Draft:**
1. Adicionar unidades base
2. Customizar equipamento
3. Validar limite de pontos
4. Validar slots de acessórios (baseado no colete)
5. Inicializar batalha via `/api/init`

### MapEditorMenu.tsx
**Responsabilidades:**
- Editor visual de cobertura de mapas
- Sistema de grid interativo
- Alternância de tipos de cobertura (none → half → full → none)
- Persistência de configuração via API
- Ferramentas: Desenhar / Mover Câmera

**Fluxo:**
1. Carregar mapa e cobertura existente
2. Clicar em células para alternar cobertura
3. Salvar configuração no servidor

### SoldiersInfoMenu.tsx
**Responsabilidades:**
- Enciclopédia visual de todos os elementos do jogo
- Exibição de classes (USA e TR separados)
- Exibição de armas, coletes, habilidades e acessórios
- Interface read-only para consulta

---

## API Backend (server.ts)

### Endpoints

#### `GET /api/state`
Retorna o estado atual do jogo.
```json
{
  "units": {...},
  "logs": [...],
  "mapId": "cidade_ruinas"
}
```

#### `GET /api/maps/:mapId/cover`
Retorna a configuração de cobertura de um mapa.
```json
{
  "10,5": "half",
  "12,8": "full"
}
```

#### `POST /api/maps/:mapId/cover`
Salva a configuração de cobertura de um mapa.
```json
{
  "10,5": "half",
  "12,8": "full"
}
```

#### `POST /api/move`
Move uma unidade no mapa.
```json
{
  "unitId": "u1",
  "x": 300,
  "y": 400
}
```

**Validações:**
- Verifica se a distância não excede o movimento máximo
- Calcula penalidade de colete
- Atualiza `movedThisTurn`

#### `POST /api/shoot`
Executa um ataque.
```json
{
  "attackerId": "u1",
  "targetId": "u2",
  "coverLevel": "half",
  "distancePenalty": 10
}
```

**Lógica de Combate:**
1. Calcula taxa de acerto base (60%)
2. Aplica penalidades (distância, cobertura)
3. Rola d100 para determinar acerto
4. **Lógica especial do Morteiro**: Se errar, rola 1d10 para desvio (5-10 = acerto)
5. Aplica dano e atualiza HP
6. Remove unidade se HP ≤ 0
7. Registra no log de combate

#### `POST /api/init`
Inicializa uma nova partida.
```json
{
  "units": {...},
  "mapId": "cidade_ruinas"
}
```

---

## Sistema de Combate

### Cálculo de Acerto
```
ChanceFinal = BaseHit - DistancePenalty - CoverPenalty

BaseHit = 60%
DistancePenalty = calculado por arma e distância
CoverPenalty:
  - Meia Cobertura: -20%
  - Cobertura Total: -40%

Mínimo: 5%
```

### Penalidades de Distância (por tipo de arma)
```
Curto (20m):
  - Até 20m: sem penalidade
  - Acima: -2% por metro extra

Médio (40m):
  - Até 40m: sem penalidade
  - Acima: -1% por metro extra

Longo (60m):
  - Até 60m: sem penalidade
  - Acima: -0.5% por metro extra
```

### Sistema de Cobertura
**Detecção de Cobertura:**
- Traça linha entre atirador e alvo
- Amostra múltiplos pontos ao longo da linha (a cada CELL_SIZE/4)
- Se qualquer ponto interceptar cobertura total → cobertura total
- Se qualquer ponto interceptar meia cobertura → meia cobertura
- Caso contrário → sem cobertura

---

## Sistema de Câmera e Visualização

### Controles de Câmera
- **Zoom**: Scroll do mouse (0.05x a 8x)
- **Pan**: Arrastar com botão esquerdo (sem targetMode) ou botão do meio/direito
- **Grid**: Visível apenas com zoom > 0.15

### Indicadores Visuais
- **Círculo de Visão**: 40m ao redor da unidade selecionada
- **Círculo de Movimento**: Mostra alcance máximo de movimento (modo mover)
- **Círculo de Alcance**: Mostra alcance da arma (modo atirar)
- **Linha de Tiro**: Linha tracejada colorida por cobertura (verde/amarelo/vermelho)
- **Barra de HP**: Acima de cada unidade (verde/amarelo/vermelho)

### Renderização de Unidades
- Círculo colorido por equipe (azul = A, vermelho = B)
- Imagem de fundo da classe (`/roles/{classe}.png`)
- Borda destacada quando selecionada
- Animação de pulso quando é alvo válido

---

## Sistema de Pontos

### Limite de Pontos
- **MAX_POINTS = 100** por equipe

### Custos
- **Classes**: 10-20 pontos
- **Armas**: 3-10 pontos
- **Coletes**: 0-3 pontos
- **Acessórios**: 2 pontos cada
- **Habilidades**: 1-3 pontos

### Validação
- Verifica antes de adicionar unidade
- Verifica antes de alterar equipamento
- Bloqueia ações que excedam o limite

---

## Mapas Disponíveis

```typescript
MAPS = {
  'cidade_ruinas': {
    name: 'Cidade em Ruínas',
    imagePath: '/maps/cidade_ruinas.jpg',
    gridWidth: 40,
    gridHeight: 40
  },
  'selva_rio': {
    name: 'Selva com Rio',
    imagePath: '/maps/selva_rio.jpg',
    gridWidth: 40,
    gridHeight: 40
  },
  'acampamento': {
    name: 'Acampamento na Floresta',
    imagePath: '/maps/acampamento.jpg',
    gridWidth: 40,
    gridHeight: 40
  }
}
```

Cada mapa tem 40x40 células = 2000x2000 pixels = 60x60 metros

---

## Fluxo de Jogo Completo

### 1. Login
- Jogador insere nome de comandante
- Transição para menu principal

### 2. Criação de Partida
- Seleciona mapa
- Monta Equipe A (USA)
- Monta Equipe B (TR)
- Valida pontos e configurações
- Inicializa batalha

### 3. Batalha
- Polling do estado a cada 1s
- Seleciona unidade
- Escolhe ação (mover/atirar)
- Executa ação
- Servidor valida e atualiza estado
- Log de combate registra eventos

### 4. Fim de Jogo
- Quando todas as unidades de um time são eliminadas
- (Atualmente não implementado, jogo continua)

---

## Melhorias Futuras Sugeridas

### Sistema de Turnos
- Implementar iniciativa
- Limitar ações por turno
- Botão "Finalizar Turno"

### Sistema de Críticos
- Implementar rolagem de crítico
- Aplicar dano crítico da arma

### Redução de Dano
- Aplicar redução do colete no dano recebido

### Persistência
- Salvar estado do jogo em arquivo/banco
- Carregar partidas salvas

### Multiplayer
- WebSockets para sincronização em tempo real
- Sistema de salas/lobbies

### IA
- Oponente controlado por IA
- Modo single-player

### Efeitos Visuais
- Animações de tiro
- Partículas de impacto
- Feedback visual de dano

---

## Observações Técnicas

### Conversão de Unidades
```
Pixels → Metros: (pixels / CELL_SIZE) * METERS_PER_CELL
Metros → Pixels: (metros / METERS_PER_CELL) * CELL_SIZE
```

### Snap to Grid
```typescript
const gridX = Math.floor(rawX / CELL_SIZE);
const gridY = Math.floor(rawY / CELL_SIZE);
const x = gridX * CELL_SIZE + CELL_SIZE / 2;
const y = gridY * CELL_SIZE + CELL_SIZE / 2;
```

### Cell Key Format
```typescript
const cellKey = `${gridX},${gridY}`;  // Ex: "10,5"
```

### Posicionamento Inicial
- **Equipe A**: Canto superior esquerdo (225, 225) + offset
- **Equipe B**: Canto inferior direito (mapWidth - 275, mapHeight - 275) - offset

---

## Dependências Críticas

### Frontend
- React 19 (hooks modernos)
- TailwindCSS 4 (nova sintaxe)
- TypeScript 5.8

### Backend
- Express.js (servidor HTTP)
- tsx (execução de TypeScript)
- Vite (dev server integrado)

### Comunicação
- Fetch API (polling a cada 1s)
- JSON para serialização
- REST endpoints

---

## Comandos Úteis

```bash
npm run dev      # Inicia servidor de desenvolvimento
npm run build    # Build de produção
npm run preview  # Preview do build
npm run lint     # Type checking
npm start        # Inicia servidor (produção)
```

---

## Estrutura de Logs

```typescript
{
  id: string           // UUID
  timestamp: number    // Date.now()
  message: string      // Mensagem descritiva
}
```

Exemplos:
- "Partida iniciada."
- "[ACERTO] USA_Assalto atirou em TR_Sniper com AK-47 e acertou para 5 de dano! (Rolagem: 45 / Chance: 60%)"
- "[ERRO] TR_Sniper atirou em USA_Assalto e errou. (Rolagem: 78 / Chance: 40%)"
- "Morteiro errou e desviou 3m (Rolagem Desvio: 3)."

---

## Conclusão

Este é um sistema VTT completo com:
- ✅ Sistema de draft de exércitos
- ✅ Editor de mapas
- ✅ Combate tático baseado em grid
- ✅ Sistema de cobertura
- ✅ Cálculo de acerto realista
- ✅ Log de combate detalhado
- ✅ Interface visual polida
- ⚠️ Sistema de turnos (parcial)
- ⚠️ Críticos (não implementado)
- ⚠️ Redução de dano (não implementado)

O código está bem estruturado, com separação clara entre frontend/backend e tipos bem definidos. A arquitetura permite expansão futura para multiplayer, IA e features adicionais.
