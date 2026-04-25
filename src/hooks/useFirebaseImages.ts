import { useState, useEffect } from 'react';
import { storageService } from '../services/storageService';
import { MAPS } from '../data/constants';
import { getImageUrl } from '../lib/utils';

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
        const key = token.name.toLowerCase().replace("médico", "medico");
        if (token.type === 'role') {
          roles[key] = token.imageUrl;
        } else if (token.type === 'map') {
          maps[key] = token.imageUrl;
        }
      });

      setRoleImages(roles);
      setMapImages(maps);
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        console.warn('Acesso ao Firebase negado. Usando imagens locais como fallback. Verifique as regras de segurança (Firestore Rules).');
      } else {
        console.warn('Não foi possível carregar imagens do Firebase. Usando imagens locais.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getRoleImage = (roleName: string): string => {
    const key = roleName.toLowerCase().replace("médico", "medico");
    return roleImages[key] || getImageUrl(`/roles/${key}.png`);
  };

  const getMapImage = (mapName: string): string => {
    const key = mapName.toLowerCase();
    return mapImages[key] || (MAPS[mapName] ? getImageUrl(MAPS[mapName].imagePath) : getImageUrl(`/maps/${key}.jpg`));
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
