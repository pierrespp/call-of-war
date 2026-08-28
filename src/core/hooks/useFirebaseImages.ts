import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { TokenData } from '@/src/core/services/storageService';
import { MAPS } from '@/src/core/data/constants';
import { getImageUrl } from '@/src/lib/utils';
import { useAuth } from '@/src/features/auth/contexts/AuthContext';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface ImageCache {
  [key: string]: string;
}

export const useFirebaseImages = () => {
  const { user, loading: authLoading } = useAuth();
  const [roleImages, setRoleImages] = useState<ImageCache>({});
  const [mapImages, setMapImages] = useState<ImageCache>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth state to be resolved
    if (authLoading) return;

    // If not logged in, we don't start the listener to avoid permission errors
    if (!user) {
      setLoading(false);
      return;
    }

    const tokensRef = collection(db, 'tokens');
    const q = query(tokensRef);

    setLoading(true);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roles: ImageCache = {};
      const maps: ImageCache = {};

      snapshot.forEach((doc) => {
        const token = doc.data() as TokenData;
        if (!token || token.deleted) return;

        const key = token.name.toLowerCase().replace("médico", "medico").replace(/\s+/g, '_');
        if (token.type === 'role') {
          roles[key] = token.imageUrl;
          roles[doc.id] = token.imageUrl;
          if (token.id) roles[token.id] = token.imageUrl;
        } else if (token.type === 'map') {
          maps[key] = token.imageUrl;
          maps[doc.id] = token.imageUrl;
          if (token.id) maps[token.id] = token.imageUrl;
        }
      });

      setRoleImages(roles);
      setMapImages(maps);
      setLoading(false);
    }, (error) => {
       if (error?.code === 'permission-denied') {
        console.warn('[useFirebaseImages] Acesso ao Firebase negado. Verifique se o usuário tem permissões.', error);
      } else {
        console.warn('[useFirebaseImages] Erro ao carregar imagens do Firebase:', error);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const getRoleImage = (roleName: string): string => {
    if (!roleName) return getImageUrl('/roles/assalto.png');
    let originalKey = roleName.toLowerCase().replace("médico", "medico");
    let key = originalKey.replace(/\s+/g, '_');
    
    if (roleImages[key]) return roleImages[key];
    if (roleImages[originalKey]) return roleImages[originalKey];

    // Auto-map complex class names to their base image types if available
    let fallbackKey = originalKey;
    if (fallbackKey.includes('assalto')) fallbackKey = 'assalto';
    else if (fallbackKey.includes('suporte')) fallbackKey = 'suporte';
    else if (fallbackKey.includes('medico') || fallbackKey.includes('médico')) fallbackKey = 'medico';
    else if (fallbackKey.includes('sniper')) fallbackKey = 'sniper';
    else if (fallbackKey.includes('granadeiro')) fallbackKey = 'granadeiro';

    return roleImages[fallbackKey] || getImageUrl(`/roles/${fallbackKey}.png`);
  };

  const getMapImage = (mapName: string): string => {
    if (!mapName) return '';
    
    // Total priority to Firestore/Cloudinary images (try ID first, then key)
    if (mapImages[mapName]) return mapImages[mapName];

    const key = mapName.toLowerCase().replace(/\s+/g, '_');
    if (mapImages[key]) return mapImages[key];
    
    // Check static MAPS constants - if imagePath is a full URL, use it
    const staticMapKey = Object.keys(MAPS).find(k => k.toLowerCase() === key || k === mapName);
    if (staticMapKey && MAPS[staticMapKey]) {
      const path = MAPS[staticMapKey].imagePath;
      if (path.startsWith('http') || path.includes('cloudinary')) {
        return path;
      }
      // If we have it in mapImages under the ID, use it
      if (mapImages[MAPS[staticMapKey].id]) return mapImages[MAPS[staticMapKey].id];

      // Use local static fallback
      if (path) return getImageUrl(path);
    }

    // If the mapName already looks like a URL, return it
    if (mapName.startsWith('http')) {
      return mapName;
    }

    // Try a direct static fallback
    return getImageUrl(`/maps/${key}.jpg`);
  };

  return {
    loading,
    getRoleImage,
    getMapImage,
    roleImages,
    mapImages,
    refreshImages: async () => {} // Kept for interface compatibility
  };
};
