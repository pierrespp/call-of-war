# Call of War VTT - Setup e Deploy

## 🚀 Quick Start (Desenvolvimento Local)

### 1. Instalar Dependências
```bash
npm install
```

### 2. Rodar o Servidor
```bash
npm run dev
```

O jogo estará disponível em `http://localhost:3000`

---

## 🔥 Configurar Firebase (Opcional - Para Deploy)

### Passo 1: Criar Projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Crie um novo projeto: `call-of-war-vtt`
3. Ative o **Firestore Database**

### Passo 2: Obter Credenciais

1. Vá em **Configurações do Projeto** ⚙️
2. Role até **Seus aplicativos**
3. Clique em **</>** (Web)
4. Copie o `firebaseConfig`

### Passo 3: Configurar Variáveis de Ambiente

1. Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

2. Edite `.env` e preencha com suas credenciais:
```env
VITE_FIREBASE_API_KEY=sua_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_project_id_aqui
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_messaging_sender_id_aqui
VITE_FIREBASE_APP_ID=seu_app_id_aqui
```

### Passo 4: Configurar Regras do Firestore

No Firebase Console, vá em **Firestore Database** → **Regras** e use:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **ATENÇÃO**: Estas regras são para desenvolvimento. Em produção, implemente autenticação.

---

## 📦 Deploy

### Opção 1: Vercel (Recomendado)

1. Instale a CLI da Vercel:
```bash
npm install -g vercel
```

2. Faça login:
```bash
vercel login
```

3. Deploy:
```bash
npm run deploy:vercel
```

4. Configure as variáveis de ambiente no dashboard da Vercel

### Opção 2: Firebase Hosting

1. Instale a CLI do Firebase:
```bash
npm install -g firebase-tools
```

2. Faça login:
```bash
firebase login
```

3. Inicialize:
```bash
firebase init hosting
```

4. Deploy:
```bash
npm run deploy:firebase
```

---

## 🎮 Como Usar Firebase no Frontend

O projeto já está preparado com:
- `src/lib/firebase.ts` - Configuração do Firebase
- `src/services/gameService.ts` - Serviços para salvar/carregar dados

### Exemplo de Uso:

```typescript
import { gameService } from './services/gameService';

// Salvar estado do jogo
await gameService.saveGameState(gameState);

// Buscar estado do jogo
const state = await gameService.getGameState();

// Escutar mudanças em tempo real
const unsubscribe = gameService.subscribeToGameState((newState) => {
  console.log('Estado atualizado:', newState);
});
```

---

## 📁 Estrutura do Projeto

```
codigo/
├── src/
│   ├── components/          # Componentes React
│   ├── data/               # Constantes e dados do jogo
│   ├── lib/                # Configuração Firebase
│   ├── services/           # Serviços (gameService)
│   ├── types/              # TypeScript types
│   └── App.tsx             # Componente principal
├── public/                 # Assets estáticos
├── server.ts              # Servidor Express
├── .env.example           # Exemplo de variáveis de ambiente
└── package.json
```

---

## 🛠️ Scripts Disponíveis

```bash
npm run dev              # Desenvolvimento local
npm run build            # Build para produção
npm run preview          # Preview do build
npm run lint             # Type checking
npm run deploy:vercel    # Deploy na Vercel
npm run deploy:firebase  # Deploy no Firebase Hosting
```

---

## 🔒 Segurança

### Variáveis de Ambiente
- **NUNCA** commite o arquivo `.env`
- Use `.env.example` como template
- Configure as variáveis no dashboard do serviço de deploy

### Regras do Firestore
As regras atuais permitem acesso total. Para produção:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Apenas usuários autenticados
    match /games/{gameId} {
      allow read, write: if request.auth != null;
    }
    
    match /map-covers/{mapId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## 🌐 Deploy em Produção (Arquitetura Dual: GitHub Pages + Render)

O Call of War VTT funciona com uma divisão estrita entre Frontend e Backend em produção:

```
┌─────────────────────────────────────────────────────────────┐
│                       PRODUÇÃO                              │
│                                                             │
│   ┌───────────────────────────┐   REST API    ┌──────────┐  │
│   │       GitHub Pages        │ ────────────> │  Render  │  │
│   │ (SPA React / Estáticos)   │ <──────────── │ (Server) │  │
│   └───────────────────────────┘    CORS OK    └──────────┘  │
│                 │                                   │       │
│                 └─────────────┐       ┌─────────────┘       │
│                               ▼       ▼                     │
│                        ┌────────────────────┐               │
│                        │ Firestore / Storage│               │
│                        └────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 1. Frontend: GitHub Pages
- **Repositório:** Deploy automatizado pelo GitHub Actions via `.github/workflows/deploy.yml`.
- **Trigger:** Push na branch `main`.
- **Base Path:** `/call-of-war/` (configurado via `VITE_BASE_PATH`).
- **Comunicação com API:** O frontend obtém a URL do backend através da variável de ambiente `VITE_API_URL` (definida nos Secrets do GitHub Actions e em `.env`).
- **Assets e Imagens:** Todos os caminhos de imagens locais DEVEM passar pela função `getImageUrl(path)` em `src/lib/utils.ts` para que o prefixo `/call-of-war/` seja aplicado no GitHub Pages sem quebrar em localhost ou no Render.

### 2. Backend: Render (Web Service)
- **Tipo de Serviço:** Web Service (Node.js).
- **Branch:** `main`.
- **Runtime:** Node.js 20 LTS (especificado via `.node-version`).
- **Build Command:**
  ```bash
  npm run build
  ```
  *(Nota: O script `build` no `package.json` já executa `npm install --include=dev` internamente para garantir que dependências como `vite` e `esbuild` existam no container de build do Render).*
- **Start Command:**
  ```bash
  npm start
  ```
  *(Executa `node dist/server.cjs`).*
- **Porta Dinâmica (`PORT`):** O `server.ts` obrigatoriamente escuta em `Number(process.env.PORT) || 3000`. O Render injeta dinamicamente a porta (ex: `10000`).
- **CORS:** O servidor permite dinamicamente requisições vindas de `*.github.io`, `*.onrender.com` e `localhost`.
- **Arquivos Estáticos no Servidor:** O servidor também é capaz de servir os estáticos do `dist/` e as imagens dinâmicas geradas em `data/maps/`.

### ⚠️ Cuidados Obrigatórios para Qualquer Desenvolvedor / Agente:
1. **Nunca quebre o build do Vite:** O GitHub Pages depende de `npm run build` gerando arquivos na pasta `dist/`.
2. **Nunca use `__dirname` direto com `import.meta.url` no `server.ts`:** O backend é compilado com esbuild para CommonJS (`dist/server.cjs`), onde `import.meta.url` é `undefined`. Sempre utilize a constante `rootDir` compatível.
3. **Nunca fixe a porta como 3000 sem fallback para `process.env.PORT`:** Isso derrubará o serviço no Render por timeout.
4. **Sempre teste os dois modos se alterar o build:**
   - Modo Dev: `npm run dev` (Vite middleware + tsx).
   - Modo Produção: `npm run build && node dist/server.cjs` (CommonJS estático).

---

## 📚 Documentação Adicional

- [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) - Guia completo de deploy
- [ARQUITETURA.md](./ARQUITETURA.md) - Documentação da arquitetura

---

## 🐛 Troubleshooting

### Firebase não conecta
- Verifique se as variáveis de ambiente estão corretas
- Confirme que o Firestore está ativado no Firebase Console

### Build falha
- Rode `npm run lint` para verificar erros de TypeScript
- Limpe o cache: `rm -rf node_modules dist && npm install`

### Deploy não funciona
- Verifique os logs no dashboard do serviço
- Confirme que as variáveis de ambiente estão configuradas

---

## 📝 Licença

MIT
