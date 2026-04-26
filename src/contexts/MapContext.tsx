import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GameMap, MAPS } from '../data/constants';

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
  const [loading, setLoading] = useState(false);

  // This function is kept for compatibility but now does nothing, as maps are static.
  const loadMaps = async () => {
    console.log("MapContext: Using static maps.");
    setMaps(MAPS);
    return Promise.resolve();
  };

  // This function is also a no-op for now.
  const saveMap = async (map: GameMap) => {
    console.log("MapContext: saveMap called, but is a no-op.");
    await loadMaps();
  };

  // No need for an initial `useEffect` to load maps as they are set statically.

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
