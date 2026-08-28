import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from '@/src/lib/firebase';
import { ShieldAlert } from "lucide-react";

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess();
    } catch (err: any) {
      console.error("Login Error:", err);
      setError("Credenciais inválidas ou erro ao conectar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex bg-neutral-900 justify-center h-screen items-center px-4 w-full text-white">
      <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 shadow-2xl w-full max-w-md text-center">
        <h1 className="text-3xl font-black mb-2">CALL OF WAR</h1>
        <p className="text-sm text-neutral-500 tracking-widest font-mono mb-8 uppercase">SIMULADOR TÁTICO VTT</p>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-950/50 border border-red-900 text-red-500 text-xs px-4 py-3 rounded-lg flex items-center gap-3 text-left">
              <ShieldAlert size={16} />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1 text-left">
            <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 pl-1">E-mail Operacional</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono text-sm"
              placeholder="comando@onyx.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1 text-left">
            <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 pl-1">Código de Acesso</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg transition-colors uppercase tracking-widest text-sm mt-2"
          >
            {loading ? "Autenticando..." : "Entrar no Sistema"}
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] text-neutral-600 font-mono uppercase tracking-tighter">
          Requer credenciais pré-aprovadas no painel Firebase.
        </p>
      </div>
    </div>
  );
}
