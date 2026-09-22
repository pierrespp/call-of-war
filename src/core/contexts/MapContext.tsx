import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GameMap, MAPS } from '@/src/core/data/constants';
import { getImageUrl } from '@/src/lib/utils';

interface MapContextType {
  maps: Record<string, GameMap>;
  loading: boolean;
  refreshMaps: () => Promise<void>;
  saveMap: (map: GameMap) => Promise<void>;
}

const normalizeMap = (m: GameMap): GameMap => ({
  ...m,
  imagePath: getImageUrl(m.imagePath),
});

const normalizeMapRecord = (record: Record<string, GameMap>): Record<string, GameMap> => {
  const out: Record<string, GameMap> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = normalizeMap(v);
  }
  return out;
};

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider = ({ children }: { children: ReactNode }) => {
  const [maps, setMaps] = useState<Record<string, GameMap>>(() => normalizeMapRecord(MAPS));
  const [loading, setLoading] = useState(true);

  const loadMaps = async () => {
    try {
      setLoading(true);
      const apiBase = (import.meta.env.VITE_API_URL ?? "") + "/api";
      const resp = await fetch(`${apiBase}/maps/all`);
      if (!resp.ok) throw new Error('Erro ao buscar mapas');
      const data = await resp.json();
      
      // Convert array to record with normalized paths
      const mapRecord: Record<string, GameMap> = {};
      data.forEach((m: GameMap) => {
        mapRecord[m.id] = normalizeMap(m);
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
