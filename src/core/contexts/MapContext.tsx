import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GameMap, MAPS } from '@/src/core/data/constants';

// NOTE: This context has been simplified to remove the fetching of AI-generated maps.
// It now only provides the static maps defined in the constants file.

interface MapContextType {
  maps: Record<string, GameMap>;
  loading: boolean;
  refreshMaps: () => Promise<void>;
  saveMap: (map: GameMap) => Promise<void>;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider = ({ children }: { children: ReactNode }) => {
  // The `maps` state is now initialized directly with the static MAPS.
  // The `loading` state is set to false as the data is available synchronously.
  const [maps, setMaps] = useState<Record<string, GameMap>>(MAPS);
  const [loading, setLoading] = useState(true);

  const loadMaps = async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/maps/all');
      if (!resp.ok) throw new Error('Erro ao buscar mapas');
      const data = await resp.json();
      
      // Convert array to record
      const mapRecord: Record<string, GameMap> = {};
      data.forEach((m: GameMap) => {
        mapRecord[m.id] = m;
      });
      
      setMaps(prev => ({ ...prev, ...mapRecord }));
    } catch (err) {
      console.error("MapContext: Error loading maps:", err);
      // Fallback to static maps already in state
    } finally {
      setLoading(false);
    }
  };

  const saveMap = async (map: GameMap) => {
    // In this app, map registration is handled by AdminPanel calling /api/ai-maps/register-manual
    // This is a no-op that just refreshes the list.
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
