import { createContext, useContext, ReactNode } from 'react';
import { getImageUrl } from '../lib/utils';

interface ImageContextType {
  loading: boolean;
  getRoleImage: (roleName: string) => string;
  getMapImage: (mapName: string) => string;
  roleImages: Record<string, string>;
  mapImages: Record<string, string>;
  refreshImages: () => Promise<void>;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export const ImageProvider = ({ children }: { children: ReactNode }) => {
  const getRoleImage = (roleName: string): string => {
    const key = roleName.toLowerCase();
    return getImageUrl(`/roles/${key}.png`);
  };

  const getMapImage = (mapName: string): string => {
    const key = mapName.toLowerCase();
    return getImageUrl(`/maps/${key}.jpg`);
  };

  const imageData: ImageContextType = {
    loading: false,
    getRoleImage,
    getMapImage,
    roleImages: {},
    mapImages: {},
    refreshImages: async () => {},
  };

  return (
    <ImageContext.Provider value={imageData}>
      {children}
    </ImageContext.Provider>
  );
};

export const useImages = () => {
  const context = useContext(ImageContext);
  if (!context) {
    throw new Error('useImages deve ser usado dentro de ImageProvider');
  }
  return context;
};
