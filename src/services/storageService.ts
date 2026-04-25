import { db } from '../lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

export interface TokenData {
  id: string;
  name: string;
  imageUrl: string;
  type: 'role' | 'map' | 'custom';
  uploadedAt: number;
  metadata?: Record<string, any>;
}

export const storageService = {
  // Converte arquivo para Base64 (comprimido para não estourar o limite de 1MB do Firestore)
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 512; // Resolução segura para manter a imagem com < 200kb em base64
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          } else if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(img, 0, 0, width, height);
             // Usar WEBP ou JPEG para otimizar tamanho
             resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
             resolve(reader.result as string);
          }
        };
        img.onerror = reject;
      };
      reader.onerror = error => reject(error);
    });
  },

  // Upload de imagem simulado (converte para base64)
  async uploadImage(file: File, path?: string): Promise<string> {
    return await this.fileToBase64(file);
  },

  // Upload de imagem de role/classe
  async uploadRoleImage(file: File, roleName: string): Promise<string> {
    return await this.uploadImage(file);
  },

  // Upload de imagem de mapa
  async uploadMapImage(file: File, mapName: string): Promise<string> {
    return await this.uploadImage(file);
  },

  // Upload de token customizado
  async uploadCustomToken(file: File, tokenId: string): Promise<string> {
    return await this.uploadImage(file);
  },

  // Deletar imagem (No-op já que não estamos mais usando o Storage real)
  async deleteImage(path: string): Promise<void> {
    return Promise.resolve();
  },

  // Obter URL de download de uma imagem (Retorna a própria string se for base64 ou local)
  async getImageUrl(path: string): Promise<string> {
    return Promise.resolve(path);
  },

  // Listar todas as imagens de uma pasta (Não suportado por base64, retornamos vazio)
  async listImages(folderPath: string): Promise<string[]> {
    return Promise.resolve([]);
  },

  // Salvar informações de token no Firestore
  async saveTokenData(tokenData: TokenData): Promise<void> {
    await setDoc(doc(db, 'tokens', tokenData.id), tokenData);
  },

  // Buscar informações de token
  async getTokenData(tokenId: string): Promise<TokenData | null> {
    const docRef = doc(db, 'tokens', tokenId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as TokenData;
    }
    return null;
  },

  // Listar todos os tokens
  async getAllTokens(): Promise<TokenData[]> {
    const tokensRef = collection(db, 'tokens');
    const snapshot = await getDocs(tokensRef);
    return snapshot.docs.map(doc => doc.data() as TokenData);
  },

  // Atualizar informações de token
  async updateTokenData(tokenId: string, updates: Partial<TokenData>): Promise<void> {
    const docRef = doc(db, 'tokens', tokenId);
    await updateDoc(docRef, updates);
  },

  // Deletar token (imagem + dados)
  async deleteToken(tokenId: string, imagePath: string): Promise<void> {
    const docRef = doc(db, 'tokens', tokenId);
    await setDoc(docRef, { deleted: true }); // Delete soft ou delete hard: await deleteDoc(docRef);
  },

  // Salvar configurações gerais do aplicativo
  async saveAppSettings(settings: Record<string, any>): Promise<void> {
    await setDoc(doc(db, 'settings', 'app-config'), settings);
  },

  // Buscar configurações do aplicativo
  async getAppSettings(): Promise<Record<string, any> | null> {
    const docRef = doc(db, 'settings', 'app-config');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  }
};
