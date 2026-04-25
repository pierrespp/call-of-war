# Call of War VTT

A Virtual Tabletop (VTT) tactical system for simulating turn-based military combat between two factions (USA vs Terrorists).

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite
- **Backend**: Express.js (served via Vite middleware in dev mode)
- **AI**: Google Gemini API (`@google/genai`)
- **Storage**: Firebase (optional, for images); PostgreSQL (`map_covers` table) for persistent map editor cover data
- **Package Manager**: npm

## Project Structure

- `server.ts` — Express backend serving API and Vite frontend
- `src/` — React frontend source
  - `components/` — UI components (AdminPanel, CreateMatchMenu, MapEditorMenu, etc.)
  - `contexts/` — React contexts (ImageContext)
  - `data/constants.ts` — Game constants, weapon/armor/class stats
  - `hooks/` — Custom React hooks (Firebase, Storage)
  - `lib/` — Firebase config, utilities
  - `services/` — API communication and storage services
  - `types/game.ts` — TypeScript types for game entities
  - `utils/` — Game mechanics, line of sight, image migration
- `public/` — Static assets (map images, role icons)
- `index.html` — App entry point

## Key Features

- Grid-based tactical combat (50px cells = 1.5m)
- Army drafting system (100 point limit)
- Cover system (None, Half, Full) — server-authoritative calculation
- Map editor for defining cover zones
- Real-time game state via polling (`/api/state` every 1.5s)
- Firebase Storage integration for custom images

## Turn System (server-authoritative)

Each unit has 3 actions per turn that reset on `endTurn`:
- **Movimento (M)** — one move per turn (metres governed by class + armor penalty)
- **Intervenção (I)** — needed for first shot, reload, charge (Investida) or guard activation
- **Tática (T)** — needed for prone toggle, repositioning facing after move-lock, etc.

Per-turn fields tracked on each `Unit`:
`actions {move, intervention, tactical, chargeUsed}`, `shotsThisTurn`, `ammoInMag`,
`movedThisTurn`, `extraMoveMeters`, `stance` (`standing`/`guard`/`prone`), `guardWatchAngle`,
`facingLockedThisTurn`.

## Cover System Rules

### Solidez para movimento e posicionamento
Células marcadas como `half` (Meia Cobertura) ou `full` (Cobertura Total) são **sólidas** — bloqueiam o pathfinding exatamente como `wall`. Nenhum token pode:
- Passar por uma célula `half`/`full` durante o movimento.
- Pousar em uma célula `half`/`full` como destino final (batalha ou Deploy).

`water` (Água) continua atravessável e ocupável, com custo de movimento extra.

### Cálculo de cobertura (servidor autoritativo)
O servidor **recalcula** a cobertura em cada tiro via `computeShotCover` — o cliente não envia nem influencia `coverLevel`. O algoritmo:

1. Traça a linha de tiro (Bresenham) de atacante a alvo, ignorando as células das próprias unidades.
2. Se qualquer célula da linha for `wall` → tiro bloqueado.
3. Células `full` na linha → `cover = "full"` (qualquer distância).
4. Células `half` na linha, regra de **proximidade Chebyshev ≤ 2**:
   - Distância Chebyshev(célula, **alvo**) ≤ 2 → elegível a dar cobertura.
   - Distância Chebyshev(célula, **atacante**) ≤ 2 → bônus cancelado (flanqueado).
   - Se sobrar alguma `half` válida e `full` ausente → `cover = "half"`.
5. Em sobreposição, `full` sempre vence.

Penalidade de acerto: `half` −20%, `full` −40%.

### Visual na batalha vs. Deploy
- **Deploy**: overlays coloridos de cobertura visíveis (auxiliam posicionamento).
- **Batalha**: overlays ocultos — o mapa fica limpo. Ao passar o mouse sobre uma célula marcada, aparece um **tooltip flutuante** com o nome da área (`"Meia Cobertura"`, `"Cobertura Total"`, `"Parede"`, `"Água"`, `"Zona Deploy A/B"`).

### Combat
- Hit roll d100 vs `class.hit − distance penalty − cover − stance modifiers`.
- **Crit two-step**: on hit, second d100 vs `weapon.criticalChance` plus modifiers
  (Sniper +10, Objetiva +10, Bi-pé+prone +5; cover/prone reduce). Crit replaces
  damage with `weapon.critical`.
- Shots per turn capped by `weapon.shots`; each shot consumes one `ammoInMag`.
- **Recarregar** (Intervention) refills `ammoInMag` to `weapon.reload` (magazine).

### Reactive (Postura de Guarda)
- Activating Guard costs Intervention and stores a watch angle.
- When an enemy moves into the guard's FOV/arc, the server creates a
  `PendingGuardShot`. The guarding player gets a modal prompting them to
  confirm or skip the reactive shot. The shot pays only ammo (-10% hit
  while in guard); guard ends after firing.

### Other actions
- **Investida** (Intervention) gives an extra movement equal to base movement.
- **Jogar-se ao chão / Levantar** (Tactical) toggles prone; prone caps move at 3m
  but grants +10% defense.
- **Definir Ângulo** changes facing. Free before move; costs Tactical after move.

### Weapon restrictions
Weapons enforce `weaponFaction` (USA/TR/Todos) and `allowedClasses` (e.g.
Fuzis only for Assalto, Rifles only for Sniper). Pistols/Revolvers are
available to all classes.

## Development

Run with:
```
npm run dev
```

Server starts on port 5000 (configured via `PORT` env var or defaults to 5000).

## Environment Variables

- `VITE_FIREBASE_API_KEY` — Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` — Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` — Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` — Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` — Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` — Firebase app ID
- `GEMINI_API_KEY` — Google Gemini API key (optional)

## API Endpoints

- `GET /api/state` — Get current game state
- `POST /api/move` — Move a unit
- `POST /api/shoot` — Execute a shooting action
- `POST /api/init` — Initialize a new battle
- `GET /api/maps/:mapId/cover` — Get cover data for a map
- `POST /api/maps/:mapId/cover` — Save cover data for a map
