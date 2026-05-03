import { db } from '@/src/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { cloudinaryService } from './cloudinaryService';

export interface TokenData {
  id: string;
  name: string;
  imageUrl: string;
  type: 'role' | 'map' | 'custom';
  uploadedAt: number;
  metadata?: Record<string, any>;
  deleted?: boolean;
}

export const storageService = {
  // Compress image before upload
  async compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 2048; // Max size for maps
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
           canvas.toBlob((blob) => {
             if (blob) resolve(blob);
             else reject(new Error("Falha na compressão"));
           }, 'image/jpeg', 0.8);
        } else {
           resolve(file);
        }
      };
      img.onerror = reject;
    });
  },

  // Upload to Cloudinary
  async uploadFile(blob: Blob, fileName: string): Promise<string> {
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    try {
      const response = await cloudinaryService.uploadImage(file);
      return response.secure_url;
    } catch(err) {
      console.warn("Cloudinary upload failed, checking if missing variables:", err);
      // Fallback or just throw
      throw err;
    }
  },

  // Upload roles
  async uploadRoleImage(file: File, roleName: string): Promise<string> {
    const blob = await this.compressImage(file);
    const fileName = `${Date.now()}-${roleName.toLowerCase().replace(/\s+/g, '_')}.jpg`;
    return await this.uploadFile(blob, fileName);
  },

  // Upload maps
  async uploadMapImage(file: File, mapName: string): Promise<string> {
    const blob = await this.compressImage(file);
    const fileName = `${Date.now()}-${mapName.toLowerCase().replace(/\s+/g, '_')}.jpg`;
    return await this.uploadFile(blob, fileName);
  },

  // Upload custom tokens
  async uploadCustomToken(file: File, tokenId: string): Promise<string> {
    const blob = await this.compressImage(file);
    const fileName = `${tokenId}.jpg`;
    return await this.uploadFile(blob, fileName);
  },

  // Delete image
  async deleteImage(path: string): Promise<void> {
    // Cannot delete from Cloudinary using frontend unsigned api, usually you only delete tokens in firestore.
    console.warn("Delete image from Cloudinary without backend signature is not supported.");
  },

  // Get image URL (since cloudinary urls are public and absolute, just return standard path if local, else url)
  async getImageUrl(path: string): Promise<string> {
     return path;
  },

  // List images (we don't strictly support dynamic list from vercel blob without server-side yet, but here returning empty array since listImages isn't actively implemented in frontend for specific functions without Firestore right now)
  async listImages(folderPath: string): Promise<string[]> {
    return []; // Usually we list from Firestore `getAllTokens()`
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
