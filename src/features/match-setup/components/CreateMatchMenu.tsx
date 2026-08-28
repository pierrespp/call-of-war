import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CLASSES,
  WEAPONS,
  ARMORS,
  ATTACHMENTS,
  SKILLS,
} from "@/src/core/data/constants";
import type { GameMap } from "@/src/core/data/constants";
import { apiService, RoomStateResponse } from "@/src/core/services/apiService";
import { DraftUnit } from "@/src/types/game";
import { Check, X, Save, Download, Trash2, Shield, Zap, Users, ChevronDown } from "lucide-react";
import { getImageUrl } from "@/src/lib/utils";
import { useImages } from "@/src/core/contexts/ImageContext";
import { useMaps } from "@/src/core/contexts/MapContext";

const MAX_POINTS = 100;
const MAX_UNITS = 9;

interface TacticalSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; description?: string }[];
  label?: string;
  playerTeam: "A" | "B";
  className?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function TacticalSelect({ value, onChange, options, playerTeam, className, disabled, onOpenChange }: TacticalSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(o => o.value === value);
  const selectedLabel = selectedOption?.label || value;
  const selectedDescription = selectedOption?.description;

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen) {
          setIsOpen(false);
          onOpenChange?.(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        title={selectedDescription || selectedLabel}
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all outline-none ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-white/20 active:scale-[0.98]"
        }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={`ml-2 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`absolute z-[100] mt-2 w-full glass-panel overflow-hidden border ${
              playerTeam === "A" ? "border-indigo-500/30" : "border-orange-500/30"
            } rounded-2xl shadow-2xl`}
          >
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5 pb-4">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.description || opt.label}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    onOpenChange?.(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex flex-col ${
                    opt.value === value 
                      ? (playerTeam === "A" ? "bg-indigo-500/20 text-indigo-300" : "bg-orange-500/20 text-orange-300")
                      : "text-neutral-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-sm font-bold">{opt.label}</span>
                  {opt.description && (
                    <span className="text-[10px] opacity-60 font-medium">{opt.description}</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface Props {
  roomId: string;
  playerToken: string;
  playerTeam: "A" | "B";
  state: RoomStateResponse;
  onBack: () => void;
  onMatchReady: () => void;
}

export function CreateMatchMenu({
  roomId,
  playerToken,
  playerTeam,
  state,
  onBack,
  onMatchReady,
}: Props) {
  const { maps } = useMaps();
  const { getRoleImage } = useImages();
  const teamFaction: "USA" | "TR" = playerTeam === "A" ? "USA" : "TR";
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [savedArmies, setSavedArmies] = useState<Record<string, DraftUnit[]>>(
    {},
  );

  // Load saved armies from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("cowSavedArmies");
    if (saved) {
      try {
        setSavedArmies(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar exércitos salvos:", e);
      }
    }
  }, []);

  const saveCurrentArmy = () => {
    if (units.length === 0) {
      setErrorMsg("Adicione unidades antes de salvar.");
      return;
    }
    const name = prompt("Nome para este exército:");
    if (!name) return;

    const newSaved = { ...savedArmies, [name]: [...units] };
    setSavedArmies(newSaved);
    localStorage.setItem("cowSavedArmies", JSON.stringify(newSaved));
  };

  const loadArmy = (name: string) => {
    const loaded = savedArmies[name];
    if (loaded) {
      // Re-generate IDs to avoid duplicates if loaded multiple times
      const fresh = loaded.map((u) => ({ ...u, id: crypto.randomUUID() }));
      updateUnits(fresh);
    }
  };

  const deleteArmy = (name: string) => {
    if (!confirm(`Excluir exército "${name}"?`)) return;
    const newSaved = { ...savedArmies };
    delete newSaved[name];
    setSavedArmies(newSaved);
    localStorage.setItem("cowSavedArmies", JSON.stringify(newSaved));
  };
  const [savingMap, setSavingMap] = useState(false);
  const [savingReady, setSavingReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSelectUnitId, setActiveSelectUnitId] = useState<string | null>(null);
  const lastSentRef = useRef<string>("");

  // Sync local state from polled server state or when team changes (sandbox)
  useEffect(() => {
    if (!state) return;
    const serverTeam = state.draft.teams[playerTeam] || [];
    const serverJson = JSON.stringify(serverTeam);

    // Always hydrate if the server indicates a change we didn't just send,
    // or if we just switched teams (which means our lastSentRef won't match serverJson)
    if (serverJson !== lastSentRef.current) {
      setUnits(serverTeam);
      lastSentRef.current = serverJson;
    }

    if (state.draft.selectedMap !== selectedMap)
      setSelectedMap(state.draft.selectedMap);

    // Detectar transição para Deploy
    if (state.phase === 'deploy') {
      onMatchReady();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.draft, state?.phase, playerTeam]);

  const myReady = state?.draft.ready[playerTeam] ?? false;
  const opponentTeam = playerTeam === "A" ? "B" : "A";
  const opponentReady = state?.draft.ready[opponentTeam] ?? false;
  const opponentName = state?.players[opponentTeam]?.name;
  const opponentUnitCount = state?.draft.teams[opponentTeam]?.length ?? 0;

  // ── Cost helpers ────────────────────────────────────────────────────────
  const calcUnitCost = (u: DraftUnit) => {
    let sum = 0;
    if (u.className) sum += CLASSES[u.className]?.points || 0;
    if (u.primaryWeapon) sum += WEAPONS[u.primaryWeapon]?.points || 0;
    if (u.secondaryWeapon) sum += WEAPONS[u.secondaryWeapon]?.points || 0;
    if (u.armorName) sum += ARMORS[u.armorName]?.points || 0;
    (u.attachments || []).forEach((a) => (sum += ATTACHMENTS[a]?.points || 0));
    (u.skills || []).forEach((s) => (sum += SKILLS[s]?.points || 0));
    return sum;
  };
  const teamCost = units.reduce((acc, u) => acc + calcUnitCost(u), 0);

  const isPrimaryWeaponAllowed = (weaponName: string, className: string) => {
    const w = WEAPONS[weaponName];
    if (!w) return false;
    if (w.weaponClass === "Pistola" || w.weaponClass === "Revólver") return false;
    if (w.weaponFaction !== "Todos" && w.weaponFaction !== teamFaction)
      return false;
    const classDisplay = CLASSES[className]?.name || "";
    if (w.allowedClasses.length === 0) return true;
    return w.allowedClasses.includes(classDisplay);
  };
  const isSecondaryWeaponAllowed = (weaponName: string, className: string) => {
    const w = WEAPONS[weaponName];
    if (!w) return false;
    if (w.weaponClass !== "Pistola" && w.weaponClass !== "Revólver") return false;
    if (w.weaponFaction !== "Todos" && w.weaponFaction !== teamFaction)
      return false;
    const classDisplay = CLASSES[className]?.name || "";
    if (w.allowedClasses.length === 0) return true;
    return w.allowedClasses.includes(classDisplay);
  };
  const isAttachmentAllowed = (attName: string, weaponName: string) => {
    const att = ATTACHMENTS[attName];
    if (!att) return false;
    if (!att.weaponClasses || att.weaponClasses.length === 0) return true;
    const w = WEAPONS[weaponName];
    if (!w) return false;
    return att.weaponClasses.includes(w.weaponClass);
  };

  const firstAllowedPrimaryWeapon = (className: string) =>
    Object.keys(WEAPONS).find((wn) => isPrimaryWeaponAllowed(wn, className)) || "AK-47";

  const firstAllowedSecondaryWeapon = (className: string) =>
    Object.keys(WEAPONS).find((wn) => isSecondaryWeaponAllowed(wn, className)) || "Pistola Padrão";

  // ── Push local team to server (debounced ish — fires on every change) ───
  const pushTeam = async (next: DraftUnit[]) => {
    setSavingTeam(true);
    setErrorMsg(null);
    try {
      await apiService.setDraftTeam(roomId, playerToken, next);
      lastSentRef.current = JSON.stringify(next);
    } catch (e) {
      console.error("Draft Push Error:", e);
      setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar time");
    } finally {
      setSavingTeam(false);
    }
  };

  const updateUnits = (next: DraftUnit[]) => {
    setUnits(next);
    pushTeam(next);
  };

  const addUnit = () => {
    if (units.length >= MAX_UNITS) {
      setErrorMsg(`Máximo de ${MAX_UNITS} unidades por equipe.`);
      return;
    }
    const firstClassKey =
      Object.keys(CLASSES).find((k) => CLASSES[k].faction === teamFaction) ||
      Object.keys(CLASSES)[0];
    const newUnit: DraftUnit = {
      id: crypto.randomUUID(),
      name: `Soldado ${units.length + 1}`,
      className: firstClassKey,
      primaryWeapon: firstAllowedPrimaryWeapon(firstClassKey),
      secondaryWeapon: firstAllowedSecondaryWeapon(firstClassKey),
      armorName: Object.keys(ARMORS)[0],
      attachments: [],
      skills: [],
    };
    if (teamCost + calcUnitCost(newUnit) > MAX_POINTS) {
      setErrorMsg("Pontos insuficientes para adicionar unidade base.");
      return;
    }
    updateUnits([...units, newUnit]);
  };

  const removeUnit = (id: string) =>
    updateUnits(units.filter((u) => u.id !== id));

  const updateUnit = (id: string, field: keyof DraftUnit, value: any) => {
    const idx = units.findIndex((u) => u.id === id);
    if (idx === -1) return;
    const oldUnit = units[idx];
    let newUnit: DraftUnit = { ...oldUnit, [field]: value };
    if (field === "className") {
      const newClassName = CLASSES[value]?.name || "";
      newUnit.skills = newUnit.skills.filter(
        (s) =>
          SKILLS[s] &&
          (Array.isArray(SKILLS[s].classRequired)
            ? SKILLS[s].classRequired.includes(newClassName)
            : SKILLS[s].classRequired === newClassName),
      );
      if (!newUnit.primaryWeapon || !isPrimaryWeaponAllowed(newUnit.primaryWeapon, value)) {
        newUnit.primaryWeapon = firstAllowedPrimaryWeapon(value);
      }
      if (!newUnit.secondaryWeapon || !isSecondaryWeaponAllowed(newUnit.secondaryWeapon, value)) {
        newUnit.secondaryWeapon = firstAllowedSecondaryWeapon(value);
      }
    }
    if (field === "primaryWeapon" || field === "className") {
      newUnit.attachments = newUnit.attachments.filter((attName) =>
        isAttachmentAllowed(attName, newUnit.primaryWeapon || ""),
      );
    }
    const oldCost = calcUnitCost(oldUnit);
    const newCost = calcUnitCost(newUnit);
    if (teamCost - oldCost + newCost > MAX_POINTS) {
      setErrorMsg("Limite de pontos atingido.");
      return;
    }
    const next = [...units];
    next[idx] = newUnit;
    updateUnits(next);
  };

  const changeAttachmentCount = (
    unitId: string,
    item: string,
    delta: number,
  ) => {
    const u = units.find((x) => x.id === unitId);
    if (!u) return;
    const arr = [...u.attachments];
    if (delta > 0) {
      arr.push(item);
    } else if (delta < 0) {
      const idx = arr.indexOf(item);
      if (idx !== -1) arr.splice(idx, 1);
    }
    updateUnit(unitId, "attachments", arr);
  };

  const toggleArrayItem = (
    unitId: string,
    field: "attachments" | "skills",
    item: string,
  ) => {
    const u = units.find((x) => x.id === unitId);
    if (!u) return;
    const arr = u[field] as string[];
    const newArr = arr.includes(item)
      ? arr.filter((i) => i !== item)
      : [...arr, item];
    updateUnit(unitId, field, newArr);
  };

  const handleMapChange = async (mapId: string) => {
    if (playerTeam !== "A") return;
    setSelectedMap(mapId);
    setSavingMap(true);
    try {
      await apiService.setDraftMap(roomId, playerToken, mapId);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao trocar mapa");
    } finally {
      setSavingMap(false);
    }
  };

  const handleDifficultyChange = async (diff: string) => {
    if (playerTeam !== "A") return;
    try {
      await apiService.setDraftPveConfig(roomId, playerToken, { 
        difficulty: diff,
        gameMode: state?.draft.gameMode || "pve-zombies" 
      });
    } catch (e) {
      setErrorMsg("Erro ao mudar dificuldade");
    }
  };

  const handleToggleReady = async () => {
    setSavingReady(true);
    setErrorMsg(null);
    try {
      await apiService.setDraftReady(roomId, playerToken, !myReady);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao alternar pronto");
    } finally {
      setSavingReady(false);
    }
  };

  const canBeReady =
    units.length > 0 && teamCost <= MAX_POINTS && units.length <= MAX_UNITS;

  const isPve = state?.draft.gameMode === "pve-zombies" || state?.draft.gameMode === "pve-tactical";
  
  // Calculate Target DP Preview for UI
  const getDifficultyPreview = () => {
    const playersCount = [state?.players.A, state?.players.A2, state?.players.A3, state?.players.A4].filter(Boolean).length;
    let base = state?.draft.difficulty === "hard" ? 100 : state?.draft.difficulty === "easy" ? 50 : 75;
    const estimatedDP = base + (Math.max(0, playersCount - 1) * 25);
    return estimatedDP;
  };

  return (
    <div className="relative w-full text-neutral-200 p-4 md:p-8 flex flex-col items-center font-sans">
      {/* Dynamic Map Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-105"
          style={{ 
            backgroundImage: `url(${maps[selectedMap]?.imagePath || ""})`,
            filter: "brightness(1.2) contrast(1.1) saturate(1.1)"
          }}
        />
        {/* Subtle vignette instead of full dark overlay */}
        <div 
          className="absolute inset-0" 
          style={{ background: "radial-gradient(circle, transparent 50%, rgba(0,0,0,0.3) 100%)" }}
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative z-10 w-full max-w-7xl glass-panel p-6 md:p-8 rounded-3xl mb-12 shadow-2xl ${
          playerTeam === "A" ? "shadow-indigo-500/30" : "shadow-orange-500/30"
        }`}
      >
        <button
          onClick={onBack}
          className="btn-tactical absolute top-6 left-6 text-neutral-400 hover:text-white px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/5 backdrop-blur-md"
        >
          ← Voltar ao Lobby
        </button>

        {/* Game Mode Selector (Only for Player A) */}
        {playerTeam === "A" && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-md">
              <button
                onClick={() => apiService.setDraftPveConfig(roomId, playerToken, { gameMode: "pvp", difficulty: state.draft.difficulty })}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!isPve ? "bg-indigo-600 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                VERSUS (PVP)
              </button>
              <button
                onClick={() => apiService.setDraftPveConfig(roomId, playerToken, { gameMode: "pve-zombies", difficulty: state.draft.difficulty })}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isPve ? "bg-red-600 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                ZUMBIS (PVE)
              </button>
            </div>
          </div>
        )}

        {isPve ? (
          <div className="mb-10 mt-4">
            <h1 className="text-5xl font-black text-center text-white mb-2 uppercase tracking-tighter italic text-shadow-glow">
              Operação: <span className="text-red-500">Sobrevivência</span>
            </h1>
            <p className="text-center text-neutral-500 text-xs uppercase tracking-[0.3em] font-bold mb-8">
              Protocolo de Extermínio // Setor Tático
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Col 1: Missão/Mapa */}
              <div className="glass-panel-dark p-5 rounded-xl border-tactical">
                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Shield size={14} className={`animate-pulse-slow ${playerTeam === "A" ? "text-indigo-400" : "text-orange-400"}`} /> Local de Inserção
                </div>
                {playerTeam === "A" ? (
                  <TacticalSelect
                    value={selectedMap}
                    onChange={handleMapChange}
                    playerTeam={playerTeam}
                    options={(Object.values(maps) as GameMap[]).map((m) => ({
                      value: m.id,
                      label: m.name
                    }))}
                  />
                ) : (
                  <div className="text-white font-black bg-white/10 p-3 rounded-lg border border-white/10 flex justify-between items-center">
                    <span>{maps[selectedMap]?.name || selectedMap}</span>
                    <span className="text-[10px] text-neutral-500 px-2 py-0.5 bg-white/5 rounded">FIXO</span>
                  </div>
                )}
                <div className="mt-3 text-[10px] text-neutral-500 font-medium">Coordenadas geográficas confirmadas.</div>
              </div>

              {/* Col 2: Dificuldade/DP */}
              <div className="glass-panel-dark p-5 rounded-xl border border-red-900/30 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-[50px] pointer-events-none group-hover:bg-red-500/10 transition-all" />
                <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Zap size={14} className="fill-current" /> Nível de Ameaça
                </div>
                
                <div className="flex bg-white/10 p-1 rounded-xl border border-white/5 mb-4">
                   {["easy", "normal", "hard"].map((d) => (
                     <button
                       key={d}
                       disabled={playerTeam !== "A"}
                       onClick={() => handleDifficultyChange(d)}
                       className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all btn-tactical ${
                         state?.draft.difficulty === d 
                           ? "bg-red-700 text-white shadow-lg shadow-red-900/40" 
                           : "text-neutral-500 hover:text-neutral-400"
                       }`}
                     >
                        {d === "easy" ? "Fácil" : d === "normal" ? "Normal" : "Difícil"}
                     </button>
                   ))}
                </div>

                <div className="flex items-baseline gap-2">
                   <span className="text-3xl font-black text-white font-mono leading-none">~{getDifficultyPreview()}</span>
                   <span className="text-xs font-bold text-red-700 uppercase">DP</span>
                </div>
                <div className="text-[10px] text-neutral-500 mt-2 font-medium">Estimativa de pressão da horda hZ.</div>
              </div>

              {/* Col 3: Squad */}
              <div className="glass-panel-dark p-5 rounded-xl border-tactical">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Users size={14} /> Esquadrão Ativo
                </div>
                <div className="grid grid-cols-1 gap-2">
                   {[state?.players.A, state?.players.A2, state?.players.A3, state?.players.A4].filter(Boolean).map((p, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={i} 
                        className="text-[11px] px-3 py-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-between"
                      >
                         <span className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {p!.name}
                         </span>
                         <span className="text-[9px] opacity-50 font-mono">ID: {i+1}</span>
                      </motion.div>
                   ))}
                   {[...Array(Math.max(0, 4 - ([state?.players.A, state?.players.A2, state?.players.A3, state?.players.A4].filter(Boolean).length)))].map((_, i) => (
                      <div key={`empty-${i}`} className="text-[10px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-neutral-400 border-dashed italic">
                        Livre para Inserção
                      </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-10 mt-4">
            <h1 className="text-4xl font-black text-center text-white mb-2 uppercase tracking-tighter italic">
              Preparação de <span className="text-indigo-500">Combate</span>
            </h1>
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                <div className="flex items-center gap-2">
                  <span className="text-white bg-white/5 px-2 py-0.5 rounded">TIME</span>
                  <span className={playerTeam === "A" ? "text-indigo-400" : "text-orange-400"}>{teamFaction}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white bg-white/5 px-2 py-0.5 rounded">CAPACIDADE</span>
                  <span className="text-neutral-300">{units.length} / {MAX_UNITS} UNIDADES</span>
                </div>
              </div>
              
              <div className="w-full max-w-md">
                <div className="flex justify-between text-[10px] font-mono mb-1.5">
                  <span className="text-neutral-400">ORÇAMENTO TÁTICO</span>
                  <span className={teamCost > MAX_POINTS ? "text-red-500" : "text-indigo-400"}>{teamCost} / {MAX_POINTS} CP</span>
                </div>
                <TacticalProgressBar current={teamCost} max={MAX_POINTS} />
              </div>
            </div>
          </div>
        )}

        {savingTeam && (
          <p className="text-center text-xs text-neutral-500">Salvando…</p>
        )}

        {!isPve && (
          <div className="flex justify-center mb-6 gap-4 mt-4 items-center">
            <label className="text-sm text-neutral-400 font-bold uppercase tracking-wider">
              Mapa
            </label>
            {playerTeam === "A" ? (
              <TacticalSelect
                value={selectedMap}
                onChange={handleMapChange}
                playerTeam={playerTeam}
                disabled={savingMap}
                className="min-w-[200px]"
                options={(Object.values(maps) as GameMap[]).map((m) => ({
                  value: m.id,
                  label: m.name
                }))}
              />
            ) : (
              <span className="bg-white/10 border border-white/10 px-3 py-1.5 rounded text-neutral-300">
                {maps[selectedMap]?.name || selectedMap}{" "}
                <span className="text-xs text-neutral-500">
                  (escolhido pelo Jogador A)
                </span>
              </span>
            )}
          </div>
        )}

        {!isPve && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8 glass-panel-dark border-tactical rounded-xl p-4 flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-widest">Adversário (Equipe {opponentTeam})</span>
                <span className="text-sm font-black text-white flex items-center gap-2">
                  {opponentName || "AGUARDANDO INSERÇÃO..."}
                  {opponentName && <span className="text-indigo-500/50">// {opponentUnitCount} UNIDADES</span>}
                </span>
              </div>
            </div>
            
            <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border font-black uppercase tracking-tighter transition-all ${opponentReady ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-white/10 border-white/10 text-neutral-600"}`}>
              {opponentReady ? (
                <>
                  <Check size={14} className="animate-bounce" /> Status: Pronto
                </>
              ) : (
                <>
                  <X size={14} /> Status: Pendente
                </>
              )}
            </div>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 p-4 bg-red-950/30 border border-red-500/30 rounded-xl text-xs text-red-400 font-bold flex items-center gap-3"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {errorMsg}
          </motion.div>
        )}

        <div className="flex gap-8 items-stretch">
          {/* Saved Armies Column */}
          <div className="w-1/4 glass-panel-dark border-tactical p-5 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                <Shield size={14} className={playerTeam === "A" ? "text-indigo-400" : "text-orange-400"} /> Arquivos de Dados
              </h3>
              <button
                onClick={saveCurrentArmy}
                className="btn-tactical text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-md font-black uppercase transition-all flex items-center gap-1.5"
              >
                <Save size={10} /> Gravar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 max-h-[600px] pr-2 custom-scrollbar">
              <AnimatePresence>
                {Object.keys(savedArmies).length === 0 ? (
                  <p className="text-[10px] text-neutral-700 italic text-center py-12 border border-dashed border-white/10 rounded-xl">
                    Sem registros salvos.
                  </p>
                ) : (
                  Object.keys(savedArmies).map((name) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={name}
                    className="bg-white/10 border border-white/10 p-3 rounded-xl group hover:border-indigo-500/50 transition-all relative"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black text-white truncate flex-1 mr-2 tracking-tight">
                          {name}
                        </span>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => loadArmy(name)}
                            className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-md transition-all"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={() => deleteArmy(name)}
                            className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-md transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-mono text-neutral-400 uppercase">
                        <span>{savedArmies[name].length} UN</span>
                        <span className="text-neutral-400 font-black">{savedArmies[name].reduce((acc, u) => acc + calcUnitCost(u), 0)} CP</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            <AnimatePresence>
              {units.map((u) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={u.id}
                  style={{ zIndex: activeSelectUnitId === u.id ? 100 : 1 }}
                  className={`glass-panel-dark p-6 rounded-2xl relative group ${playerTeam === "A" ? "border-neon-usa" : "border-neon-tr"}`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl ${playerTeam === "A" ? "bg-indigo-500" : "bg-orange-500"}`} />
                  
                  <button
                    onClick={() => removeUnit(u.id)}
                    className="absolute top-4 right-4 text-neutral-600 hover:text-red-500 transition-colors p-1"
                  >
                    <X size={16} />
                  </button>

                  <div className="flex justify-between items-center mb-6">
                    <div className="flex-1">
                      <input
                        value={u.name}
                        onChange={(e) => updateUnit(u.id, "name", e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-white/10 focus:border-indigo-500 focus:outline-none font-black text-xl text-white w-full transition-all uppercase tracking-tighter italic"
                      />
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-neutral-100 uppercase tracking-widest mb-1">Custo de Desdobramento</span>
                      <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-lg text-sm font-mono font-black">
                        {calcUnitCost(u)} CP
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-sm">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-neutral-100 uppercase tracking-widest block mb-2">Classe Operacional</label>
                        <TacticalSelect
                          value={u.className}
                          onChange={(val) => updateUnit(u.id, "className", val)}
                          onOpenChange={(open) => setActiveSelectUnitId(open ? u.id : null)}
                          playerTeam={playerTeam}
                          options={Object.values(CLASSES)
                            .filter((c) => c.faction === teamFaction)
                            .map((c) => ({
                              value: c.id,
                              label: `${c.name} (${c.points} CP)`,
                              description: `HP: ${c.hp} // Precisão: ${c.hit}% // Crítico: ${c.critical}% // Movimento: ${c.movement}m`
                            }))}
                        />
                      </div>
                      
                      <div>
                        <label className="text-[10px] font-black text-neutral-100 uppercase tracking-widest block mb-2">Armamento Primário</label>
                        <TacticalSelect
                          value={u.primaryWeapon || ""}
                          onChange={(val) => updateUnit(u.id, "primaryWeapon", val)}
                          onOpenChange={(open) => setActiveSelectUnitId(open ? u.id : null)}
                          playerTeam={playerTeam}
                          options={Object.values(WEAPONS)
                            .filter((w) => isPrimaryWeaponAllowed(w.name, u.className))
                            .map((w) => ({
                              value: w.name,
                              label: `${w.name} (${w.points} CP)`,
                              description: `${w.weaponClass} // Dano: ${w.damage} // Crítico: ${w.critical} (${w.criticalChance}%) // Tiros: ${w.shots} // Alcance: ${w.range}`
                            }))}
                        />
                        {u.primaryWeapon && WEAPONS[u.primaryWeapon] && (
                          <div className="grid grid-cols-4 gap-2 text-[9px] font-mono font-black text-neutral-500 uppercase mt-3 px-1">
                            <div className="flex flex-col"><span>Dano</span><span className="text-white">{WEAPONS[u.primaryWeapon].damage}</span></div>
                            <div className="flex flex-col"><span>Tiros</span><span className="text-white">{WEAPONS[u.primaryWeapon].shots}</span></div>
                            <div className="flex flex-col"><span>Alcance</span><span className="text-white">{WEAPONS[u.primaryWeapon].range}m</span></div>
                            <div className="flex flex-col"><span>Slots</span><span className="text-white">{WEAPONS[u.primaryWeapon].slots}</span></div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-neutral-100 uppercase tracking-widest block mb-2">Armamento Secundário</label>
                        <TacticalSelect
                          value={u.secondaryWeapon || ""}
                          onChange={(val) => updateUnit(u.id, "secondaryWeapon", val)}
                          onOpenChange={(open) => setActiveSelectUnitId(open ? u.id : null)}
                          playerTeam={playerTeam}
                          options={Object.values(WEAPONS)
                            .filter((w) => isSecondaryWeaponAllowed(w.name, u.className))
                            .map((w) => ({
                              value: w.name,
                              label: `${w.name} (${w.points} CP)`,
                              description: `${w.weaponClass} // Dano: ${w.damage} // Crítico: ${w.critical} (${w.criticalChance}%) // Tiros: ${w.shots}`
                            }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-neutral-300 uppercase tracking-widest block mb-2">Proteção Balística</label>
                        <TacticalSelect
                          value={u.armorName || ""}
                          onChange={(val) => updateUnit(u.id, "armorName", val)}
                          onOpenChange={(open) => setActiveSelectUnitId(open ? u.id : null)}
                          playerTeam={playerTeam}
                          options={Object.values(ARMORS).map((a) => ({
                            value: a.name,
                            label: `${a.name} (${a.points} CP)`,
                            description: `Redução: -${a.reduction} Dano // Slots: ${a.slots} // Penalidade: -${a.movePenal}m Movimento`
                          }))}
                        />
                      </div>

                      <div className="pt-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-3">Equipamento Utilitário</label>
                        <div className="grid grid-cols-2 gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                          {Object.values(ATTACHMENTS).map((att) => {
                            const allowed = isAttachmentAllowed(att.name, u.primaryWeapon || "");
                            if (!allowed) return null;

                            if (att.isGrenade) {
                              const count = u.attachments.filter((a) => a === att.name).length;
                              return (
                                <div 
                                  key={att.name} 
                                  title={att.description}
                                  className="flex items-center justify-between text-[10px] font-bold text-neutral-400 col-span-2 bg-white/10/50 p-2 rounded-lg"
                                >
                                  <span className="truncate pr-2">{att.name} ({att.points})</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => changeAttachmentCount(u.id, att.name, -1)}
                                      disabled={count === 0}
                                      className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all disabled:opacity-30"
                                    >
                                      -
                                    </button>
                                    <span className="w-4 text-center font-mono text-white">{count}</span>
                                    <button
                                      type="button"
                                      onClick={() => changeAttachmentCount(u.id, att.name, 1)}
                                      className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center hover:bg-emerald-500/20 hover:text-emerald-400 transition-all"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <label 
                                key={att.name} 
                                title={att.description}
                                className="flex items-center gap-3 text-[10px] font-bold text-neutral-400 cursor-pointer group/label"
                              >
                                <div className="relative">
                                  <input
                                    type="checkbox"
                                    checked={u.attachments.includes(att.name)}
                                    onChange={() => toggleArrayItem(u.id, "attachments", att.name)}
                                    className="peer sr-only"
                                  />
                                  <div className="w-4 h-4 bg-white/5 border border-white/10 rounded transition-all peer-checked:bg-indigo-500 peer-checked:border-indigo-400" />
                                  <Check size={10} className="absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                </div>
                                <span className="group-hover/label:text-white transition-colors">{att.name} ({att.points})</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-3">Habilidades de Classe</label>
                        <div className="flex flex-wrap gap-2">
                          {Object.values(SKILLS)
                            .filter((sk) =>
                              Array.isArray(sk.classRequired)
                                ? sk.classRequired.includes(CLASSES[u.className]?.name)
                                : sk.classRequired === CLASSES[u.className]?.name
                            )
                            .map((sk) => {
                              const isSextoSentido = sk.name === "Sexto Sentido";
                              const isActive = u.skills.includes(sk.name);
                              return (
                                <button
                                  key={sk.name}
                                  onClick={() => !isSextoSentido && toggleArrayItem(u.id, "skills", sk.name)}
                                  disabled={isSextoSentido}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all border ${
                                    isSextoSentido
                                      ? "bg-white/10 border-white/10 text-neutral-700 cursor-not-allowed"
                                      : isActive
                                        ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20"
                                        : "bg-white/5 border-white/10 text-neutral-400 hover:border-neutral-500"
                                  }`}
                                  title={sk.description}
                                >
                                  {sk.name} {isSextoSentido ? "🔒" : `(${sk.points})`}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={addUnit}
              disabled={units.length >= MAX_UNITS || teamCost >= MAX_POINTS}
              className="w-full py-6 glass-panel-dark border-dashed border-2 border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-neutral-500 hover:text-indigo-400 font-black uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-30 disabled:cursor-not-allowed group shadow-inner"
            >
              <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center text-2xl font-normal group-hover:rotate-90 transition-transform">+</div>
              Recrutar Novo Operativo
            </motion.button>
          </div>

          <div className="w-1/3 glass-panel-dark border-tactical p-6 rounded-2xl flex flex-col justify-between">
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <div className="w-1 h-4 bg-indigo-500" />
                {isPve ? "Status do Esquadrão" : "Manifesto de Equipe"}
              </h3>
              
              {units.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-700">
                  <Users size={40} className="mb-4 opacity-20" />
                  <p className="text-[10px] font-black uppercase tracking-widest italic">Nenhum operative em campo.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {units.map((u) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={u.id}
                      className="flex gap-4 items-center bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10 group hover:bg-white/10 transition-all shadow-lg"
                    >
                      <div
                        className="w-10 h-10 bg-white/10 rounded-lg border border-white/10 flex items-center justify-center shrink-0 grayscale group-hover:grayscale-0 transition-all"
                        style={{
                          backgroundImage: `url("${getRoleImage(CLASSES[u.className]?.name || "")}")`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      >
                        {!getRoleImage(CLASSES[u.className]?.name || "") && (
                          <span className="text-[10px] font-black text-neutral-600">
                            {CLASSES[u.className]?.name?.substring(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h4 className="font-black text-white text-[11px] uppercase tracking-tight truncate">
                            {u.name}
                          </h4>
                          <span className="text-[9px] font-mono text-indigo-400 font-black">{calcUnitCost(u)}</span>
                        </div>
                        <p className="text-[9px] text-neutral-400 font-bold uppercase truncate">
                          {CLASSES[u.className]?.name} // {u.primaryWeapon}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-white/10">
              <div className="mb-6 flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Total da Operação</span>
                  <span className={`text-3xl font-black font-mono leading-none ${teamCost > MAX_POINTS ? "text-red-500" : "text-white"}`}>
                    {teamCost}<span className="text-xs text-neutral-500 ml-1">/{MAX_POINTS} CP</span>
                  </span>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-black uppercase ${canBeReady ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {canBeReady ? "VALIDADO" : "INVÁLIDO"}
                </div>
              </div>

              <motion.button
                whileHover={canBeReady ? { scale: 1.02 } : {}}
                whileTap={canBeReady ? { scale: 0.98 } : {}}
                onClick={handleToggleReady}
                disabled={savingReady || (!myReady && !canBeReady)}
                className={`w-full py-4 rounded-xl font-black text-sm tracking-[0.2em] shadow-xl transition-all border uppercase ${
                  myReady
                    ? "bg-amber-600/20 border-amber-500/50 text-amber-500 hover:bg-amber-600 hover:text-white"
                    : canBeReady
                      ? "bg-indigo-600 border-indigo-400 text-white hover:bg-indigo-500 shadow-indigo-500/20"
                      : "bg-white/10 border-white/10 text-neutral-700 cursor-not-allowed"
                }`}
              >
                {myReady ? "✕ Cancelar Prontidão" : "✓ Iniciar Missão"}
              </motion.button>
              
              <AnimatePresence>
                {myReady && !opponentReady && (
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[9px] text-neutral-400 font-black uppercase tracking-widest text-center mt-4 animate-pulse"
                  >
                    Aguardando sinal verde do adversário...
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function TacticalProgressBar({ current, max }: { current: number; max: number }) {
  const percent = Math.min(100, (current / max) * 100);
  const colorClass = percent > 90 ? "bg-red-500" : percent > 70 ? "bg-amber-500" : "bg-indigo-500";
  
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`h-full ${colorClass} shadow-[0_0_8px_rgba(99,102,241,0.4)]`}
      />
    </div>
  );
}
