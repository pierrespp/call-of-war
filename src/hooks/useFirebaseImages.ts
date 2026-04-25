import { useState, useEffect } from 'react';
import { storageService } from '../services/storageService';

interface ImageCache {
  [key: string]: string;
}

export const useFirebaseImages = () => {
  const [roleImages, setRoleImages] = useState<ImageCache>({});
  const [mapImages, setMapImages] = useState<ImageCache>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      const tokens = await storageService.getAllTokens();

      const roles: ImageCache = {};
      const maps: ImageCache = {};

      tokens.forEach(token => {
        const key = token.name.toLowerCase();
        if (token.type === 'role') {
          roles[key] = token.imageUrl;
        } else if (token.type === 'map') {
          maps[key] = token.imageUrl;
        }
      });

      setRoleImages(roles);
      setMapImages(maps);
    } catch (error) {
      console.error('Erro ao carregar imagens do Firebase:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleImage = (roleName: string): string => {
    const key = roleName.toLowerCase();
    return roleImages[key] || `./roles/${key}.png`;
  };

  const getMapImage = (mapName: string): string => {
    const key = mapName.toLowerCase();
    return mapImages[key] || `./maps/${key}.png`;
  };

  return {
    loading,
    getRoleImage,
    getMapImage,
    roleImages,
    mapImages,
    refreshImages: loadImages
  };
};
