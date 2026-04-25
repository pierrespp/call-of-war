import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { GameState, MapCoverData } from '../types/game';

const GAME_DOC_ID = 'current-game';

export const gameService = {
  // Salvar estado do jogo
  async saveGameState(state: GameState): Promise<void> {
    const stateWithTimestamp = {
      ...state,
      lastSaved: Date.now()
    };
    await setDoc(doc(db, 'games', GAME_DOC_ID), stateWithTimestamp);
  },

  // Buscar estado do jogo
  async getGameState(): Promise<GameState | null> {
    const docRef = doc(db, 'games', GAME_DOC_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as GameState;
    }
    return null;
  },

  // Atualizar estado do jogo
  async updateGameState(updates: Partial<GameState>): Promise<void> {
    const docRef = doc(db, 'games', GAME_DOC_ID);
    await updateDoc(docRef, {
      ...updates,
      lastUpdated: Date.now()
    });
  },

  // Escutar mudanças em tempo real
  subscribeToGameState(callback: (state: GameState) => void): () => void {
    const docRef = doc(db, 'games', GAME_DOC_ID);
    return onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data() as GameState);
      }
    });
  },

  // Salvar configuração de cobertura de mapa
  async saveMapCover(mapId: string, coverData: MapCoverData): Promise<void> {
    await setDoc(doc(db, 'map-covers', mapId), {
      coverData,
      lastUpdated: Date.now()
    });
  },

  // Buscar configuração de cobertura de mapa
  async getMapCover(mapId: string): Promise<MapCoverData> {
    const docRef = doc(db, 'map-covers', mapId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data().coverData as MapCoverData;
    }
    return {};
  },

  // Salvar histórico de partidas
  async saveGameHistory(gameId: string, gameData: any): Promise<void> {
    await setDoc(doc(db, 'game-history', gameId), {
      ...gameData,
      savedAt: Date.now()
    });
  },

  // Buscar histórico de partidas
  async getGameHistory(limit: number = 10): Promise<any[]> {
    const historyRef = collection(db, 'game-history');
    const snapshot = await getDocs(historyRef);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .sort((a: any, b: any) => b.savedAt - a.savedAt)
      .slice(0, limit);
  },

  // Salvar sessão de jogo
  async saveSession(sessionId: string, sessionData: any): Promise<void> {
    await setDoc(doc(db, 'sessions', sessionId), {
      ...sessionData,
      createdAt: Date.now()
    });
  },

  // Buscar sessão de jogo
  async getSession(sessionId: string): Promise<any | null> {
    const docRef = doc(db, 'sessions', sessionId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  }
};
