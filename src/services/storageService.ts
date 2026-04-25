import { storage, db } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

export interface TokenData {
  id: string;
  name: string;
  imageUrl: string;
  type: 'role' | 'map' | 'custom';
  uploadedAt: number;
  metadata?: Record<string, any>;
}

export const storageService = {
  // Upload de imagem para o Firebase Storage
  async uploadImage(file: File, path: string): Promise<string> {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  },

  // Upload de imagem de role/classe
  async uploadRoleImage(file: File, roleName: string): Promise<string> {
    const path = `roles/${roleName.toLowerCase()}.png`;
    return await this.uploadImage(file, path);
  },

  // Upload de imagem de mapa
  async uploadMapImage(file: File, mapName: string): Promise<string> {
    const path = `maps/${mapName.toLowerCase()}.png`;
    return await this.uploadImage(file, path);
  },

  // Upload de token customizado
  async uploadCustomToken(file: File, tokenId: string): Promise<string> {
    const path = `tokens/${tokenId}`;
    return await this.uploadImage(file, path);
  },

  // Deletar imagem do Storage
  async deleteImage(path: string): Promise<void> {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  },

  // Obter URL de download de uma imagem
  async getImageUrl(path: string): Promise<string> {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  },

  // Listar todas as imagens de uma pasta
  async listImages(folderPath: string): Promise<string[]> {
    const folderRef = ref(storage, folderPath);
    const result = await listAll(folderRef);
    const urls = await Promise.all(
      result.items.map(item => getDownloadURL(item))
    );
    return urls;
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
    await this.deleteImage(imagePath);
    const docRef = doc(db, 'tokens', tokenId);
    await setDoc(docRef, { deleted: true });
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
