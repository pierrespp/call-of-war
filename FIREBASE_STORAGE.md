# Sistema de Storage Firebase

Este projeto agora possui integração completa com Firebase Storage e Firestore para salvar imagens, tokens e outras informações.

## Estrutura de Serviços

### 1. `storageService.ts`
Gerencia upload e download de imagens no Firebase Storage:
- Upload de imagens de roles/classes
- Upload de imagens de mapas
- Upload de tokens customizados
- Gerenciamento de metadados no Firestore
- Listagem e exclusão de imagens

### 2. `gameService.ts` (atualizado)
Gerencia estado do jogo e sessões:
- Salvar/carregar estado do jogo
- Histórico de partidas
- Sessões de jogo
- Configurações de cobertura de mapa
- Timestamps automáticos

### 3. `useStorage.ts` (hook)
Hook React para facilitar uploads:
```typescript
const { uploading, error, uploadRoleImage, uploadMapImage, uploadCustomToken } = useStorage();
```

## Como Usar

### Upload de Imagem de Role
```typescript
import { useStorage } from './hooks/useStorage';

const { uploadRoleImage } = useStorage();
await uploadRoleImage(file, 'Assalto');
```

### Upload de Imagem de Mapa
```typescript
const { uploadMapImage } = useStorage();
await uploadMapImage(file, 'Dust2');
```

### Upload de Token Customizado
```typescript
const { uploadCustomToken } = useStorage();
const { url, tokenId } = await uploadCustomToken(file, 'Meu Token', { 
  category: 'enemy',
  size: 'large' 
});
```

## Componente de Upload

O componente `ImageUploadManager` fornece uma interface visual para fazer uploads:

```typescript
import { ImageUploadManager } from './components/ImageUploadManager';

// No seu componente
<ImageUploadManager />
```

## Estrutura no Firebase

### Storage
```
/roles/
  - assalto.png
  - suporte.png
  - médico.png
  - granadeiro.png
  - sniper.png

/maps/
  - dust2.png
  - mirage.png

/tokens/
  - custom-1234567890
  - custom-9876543210
```

### Firestore Collections

#### `tokens`
```json
{
  "id": "role-assalto",
  "name": "Assalto",
  "imageUrl": "https://firebasestorage.googleapis.com/...",
  "type": "role",
  "uploadedAt": 1234567890,
  "metadata": {}
}
```

#### `games`
```json
{
  "current-game": {
    "units": [...],
    "currentTurn": 1,
    "lastSaved": 1234567890
  }
}
```

#### `game-history`
Histórico de partidas anteriores

#### `sessions`
Sessões de jogo ativas

#### `settings`
Configurações gerais do aplicativo

## Migração de Imagens Locais

Para migrar as imagens existentes em `/public/roles/` para o Firebase:

1. Use o componente `ImageUploadManager`
2. Selecione "Imagem de Role/Classe"
3. Faça upload de cada imagem com o nome correto
4. As URLs serão salvas automaticamente no Firestore

## Próximos Passos

Para usar as imagens do Firebase no lugar das locais:

1. Carregar URLs do Firestore ao iniciar o app
2. Atualizar os componentes para usar as URLs do Firebase
3. Manter fallback para imagens locais durante desenvolvimento
