import { useState } from 'react';
import { storageService, TokenData } from '../services/storageService';

export const useStorage = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadRoleImage = async (file: File, roleName: string) => {
    setUploading(true);
    setError(null);
    try {
      const url = await storageService.uploadRoleImage(file, roleName);
      const tokenData: TokenData = {
        id: `role-${roleName.toLowerCase()}`,
        name: roleName,
        imageUrl: url,
        type: 'role',
        uploadedAt: Date.now()
      };
      await storageService.saveTokenData(tokenData);
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer upload');
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const uploadMapImage = async (file: File, mapName: string) => {
    setUploading(true);
    setError(null);
    try {
      const url = await storageService.uploadMapImage(file, mapName);
      const tokenData: TokenData = {
        id: `map-${mapName.toLowerCase()}`,
        name: mapName,
        imageUrl: url,
        type: 'map',
        uploadedAt: Date.now()
      };
      await storageService.saveTokenData(tokenData);
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer upload');
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const uploadCustomToken = async (file: File, tokenName: string, metadata?: Record<string, any>) => {
    setUploading(true);
    setError(null);
    try {
      const tokenId = `custom-${Date.now()}`;
      const url = await storageService.uploadCustomToken(file, tokenId);
      const tokenData: TokenData = {
        id: tokenId,
        name: tokenName,
        imageUrl: url,
        type: 'custom',
        uploadedAt: Date.now(),
        metadata
      };
      await storageService.saveTokenData(tokenData);
      return { url, tokenId };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer upload');
      throw err;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploading,
    error,
    uploadRoleImage,
    uploadMapImage,
    uploadCustomToken
  };
};
