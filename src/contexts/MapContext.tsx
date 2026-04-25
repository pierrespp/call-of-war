import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GameMap, MAPS } from '../data/constants';

interface MapContextType {
  maps: Record<string, GameMap>;
  loading: boolean;
  refreshMaps: () => Promise<void>;
  saveMap: (map: GameMap) => Promise<void>;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider = ({ children }: { children: ReactNode }) => {
  const [maps, setMaps] = useState<Record<string, GameMap>>(MAPS);
  const [loading, setLoading] = useState(true);

  const loadMaps = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/ai-maps/list");
      if (!resp.ok) throw new Error("Falha ao carregar mapas locais");
      const localMaps: GameMap[] = await resp.json();
      
      const mapObj: Record<string, GameMap> = { ...MAPS };
      localMaps.forEach((m) => {
        mapObj[m.id] = m;
      });
      setMaps(mapObj);
    } catch (error: any) {
      console.warn('Erro ao carregar mapas locais, usando padrão:', error);
      setMaps(MAPS);
    } finally {
      setLoading(false);
    }
  };

  const saveMap = async (map: GameMap) => {
    // Para simplificar, mapas "hardcoded" não são salvos na API. 
    // AI Maps já são salvos pelo componente do AI Map Generator.
    await loadMaps();
  };

  useEffect(() => {
    loadMaps();
  }, []);

  return (
    <MapContext.Provider value={{ maps, loading, refreshMaps: loadMaps, saveMap }}>
      {children}
    </MapContext.Provider>
  );
};

export const useMaps = () => {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMaps deve ser usado dentro de MapProvider');
  }
  return context;
};
