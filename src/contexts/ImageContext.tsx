import { createContext, useContext, ReactNode } from 'react';
import { useFirebaseImages } from '../hooks/useFirebaseImages';

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
  const firebaseImages = useFirebaseImages();

  return (
    <ImageContext.Provider value={firebaseImages}>
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
