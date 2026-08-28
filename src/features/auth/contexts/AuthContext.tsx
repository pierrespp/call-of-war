import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from '@/src/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  commanderName: string | null;
  updateCommanderName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  commanderName: null,
  updateCommanderName: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [commanderName, setCommanderName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            setCommanderName(userDoc.data().commanderName || null);
          } else {
            // Se o documento não existe, ainda não tem nome de comandante
            setCommanderName(null);
          }
        } catch (error) {
          console.error("Erro ao carregar perfil do usuário:", error);
          setCommanderName(null);
        }
      } else {
        setCommanderName(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao fazer logout", error);
    }
  };

  const updateCommanderName = async (name: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        await updateDoc(userRef, { 
          commanderName: name,
          updatedAt: new Date().toISOString()
        });
      } else {
        await setDoc(userRef, {
          id: user.uid,
          email: user.email,
          commanderName: name,
          createdAt: new Date().toISOString()
        });
      }
      setCommanderName(name);
    } catch (error) {
      console.error("Erro ao atualizar nome do comandante:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, commanderName, updateCommanderName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
