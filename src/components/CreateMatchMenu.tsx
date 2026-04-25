import React, { useEffect, useRef, useState } from "react";
import { CLASSES, WEAPONS, ARMORS, ATTACHMENTS, SKILLS, MAPS } from "../data/constants";
import { apiService, RoomStateResponse } from "../services/apiService";
import { DraftUnit } from "../types/game";
import { Check, X } from "lucide-react";
import { getImageUrl } from "../lib/utils";

const MAX_POINTS = 100;
const MAX_UNITS = 9;

interface Props {
  roomId: string;
  playerToken: string;
  playerTeam: "A" | "B";
  state: RoomStateResponse | null;
  onBack: () => void;
}

export function CreateMatchMenu({ roomId, playerToken, playerTeam, state, onBack }: Props) {
  const teamFaction: "USA" | "TR" = playerTeam === "A" ? "USA" : "TR";
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [selectedMap, setSelectedMap] = useState("cidade_ruinas");
  const [savingTeam, setSavingTeam] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [savingReady, setSavingReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
    
    if (state.draft.selectedMap !== selectedMap) setSelectedMap(state.draft.selectedMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.draft, playerTeam]);

  const myReady = state?.draft.ready[playerTeam] ?? false;
  const opponentTeam = playerTeam === "A" ? "B" : "A";
  const opponentReady = state?.draft.ready[opponentTeam] ?? false;
  const opponentName = state?.players[opponentTeam]?.name;
  const opponentUnitCount = state?.draft.teams[opponentTeam]?.length ?? 0;

  // ── Cost helpers ────────────────────────────────────────────────────────
  const calcUnitCost = (u: DraftUnit) => {
    let sum = 0;
    if (u.className) sum += CLASSES[u.className]?.points || 0;
    if (u.weaponName) sum += WEAPONS[u.weaponName]?.points || 0;
    if (u.armorName) sum += ARMORS[u.armorName]?.points || 0;
    (u.attachments || []).forEach(a => sum += ATTACHMENTS[a]?.points || 0);
    (u.skills || []).forEach(s => sum += SKILLS[s]?.points || 0);
    return sum;
  };
  const teamCost = units.reduce((acc, u) => acc + calcUnitCost(u), 0);

  const isWeaponAllowed = (weaponName: string, className: string) => {
    const w = WEAPONS[weaponName]; if (!w) return false;
    if (w.weaponFaction !== "Todos" && w.weaponFaction !== teamFaction) return false;
    const classDisplay = CLASSES[className]?.name || "";
    if (w.allowedClasses.length === 0) return true;
    return w.allowedClasses.includes(classDisplay);
  };
  const firstAllowedWeapon = (className: string) =>
    Object.keys(WEAPONS).find(wn => isWeaponAllowed(wn, className)) || Object.keys(WEAPONS)[0];

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

  const updateUnits = (next: DraftUnit[]) => { setUnits(next); pushTeam(next); };

  const addUnit = () => {
    if (units.length >= MAX_UNITS) { setErrorMsg(`Máximo de ${MAX_UNITS} unidades por equipe.`); return; }
    const firstClassKey = Object.keys(CLASSES).find(k => CLASSES[k].faction === teamFaction) || Object.keys(CLASSES)[0];
    const newUnit: DraftUnit = {
      id: crypto.randomUUID(),
      name: `Soldado ${units.length + 1}`,
      className: firstClassKey,
      weaponName: firstAllowedWeapon(firstClassKey),
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

  const removeUnit = (id: string) => updateUnits(units.filter(u => u.id !== id));

  const updateUnit = (id: string, field: keyof DraftUnit, value: any) => {
    const idx = units.findIndex(u => u.id === id);
    if (idx === -1) return;
    const oldUnit = units[idx];
    let newUnit: DraftUnit = { ...oldUnit, [field]: value };
    if (field === "className") {
      const newClassName = CLASSES[value]?.name || "";
      newUnit.skills = newUnit.skills.filter(s => SKILLS[s] && SKILLS[s].classRequired === newClassName);
      if (!newUnit.weaponName || !isWeaponAllowed(newUnit.weaponName, value)) {
        newUnit.weaponName = firstAllowedWeapon(value);
      }
    }
    if (field === "weaponName" || field === "className") {
      const slots = WEAPONS[newUnit.weaponName || ""]?.slots ?? 0;
      if (newUnit.attachments.length > slots) newUnit.attachments = newUnit.attachments.slice(0, slots);
    }
    const oldCost = calcUnitCost(oldUnit);
    const newCost = calcUnitCost(newUnit);
    if (teamCost - oldCost + newCost > MAX_POINTS) {
      setErrorMsg("Limite de pontos atingido.");
      return;
    }
    const next = [...units]; next[idx] = newUnit;
    updateUnits(next);
  };

  const toggleArrayItem = (unitId: string, field: "attachments" | "skills", item: string) => {
    const u = units.find(x => x.id === unitId); if (!u) return;
    if (field === "attachments") {
      const isAdding = !u.attachments.includes(item);
      const slots = WEAPONS[u.weaponName || ""]?.slots || 0;
      if (isAdding && u.attachments.length >= slots) {
        setErrorMsg(`Número máximo de acessórios para a arma atual (${slots}) atingido.`);
        return;
      }
    }
    const arr = u[field] as string[];
    const newArr = arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];
    updateUnit(unitId, field, newArr);
  };

  const handleMapChange = async (mapId: string) => {
    if (playerTeam !== "A") return;
    setSelectedMap(mapId);
    setSavingMap(true);
    try { await apiService.setDraftMap(roomId, playerToken, mapId); }
    catch (e) { setErrorMsg(e instanceof Error ? e.message : "Erro ao trocar mapa"); }
    finally { setSavingMap(false); }
  };

  const handleToggleReady = async () => {
    setSavingReady(true);
    setErrorMsg(null);
    try { await apiService.setDraftReady(roomId, playerToken, !myReady); }
    catch (e) { setErrorMsg(e instanceof Error ? e.message : "Erro ao alternar pronto"); }
    finally { setSavingReady(false); }
  };

  const canBeReady = units.length > 0 && teamCost <= MAX_POINTS && units.length <= MAX_UNITS;

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 p-8 flex flex-col items-center overflow-y-auto w-full">
      <div className="w-full max-w-6xl bg-neutral-800 p-8 rounded-2xl border border-neutral-700 shadow-2xl relative mb-12">
        <button
          onClick={onBack}
          className="absolute top-4 left-4 text-neutral-400 hover:text-white px-2 py-1 bg-neutral-700/50 rounded text-sm transition-colors"
        >
          Voltar ao Lobby
        </button>

        <h1 className="text-3xl font-black text-center text-white mb-2">
          Montar Exército — Equipe {playerTeam} ({teamFaction})
        </h1>
        <p className="text-center text-neutral-400 mb-2">
          Limite: {MAX_POINTS} pontos · {MAX_UNITS} unidades · {teamCost} / {MAX_POINTS} pts · {units.length} / {MAX_UNITS} un.
        </p>
        {savingTeam && <p className="text-center text-xs text-neutral-500">Salvando…</p>}

        {/* Map row */}
        <div className="flex justify-center mb-6 gap-4 mt-4 items-center">
          <label className="text-sm text-neutral-400 font-bold uppercase tracking-wider">Mapa</label>
          {playerTeam === "A" ? (
            <select
              className="bg-neutral-900 border border-neutral-600 text-white rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              value={selectedMap}
              onChange={e => handleMapChange(e.target.value)}
              disabled={savingMap}
            >
              {Object.values(MAPS).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <span className="bg-neutral-900 border border-neutral-700 px-3 py-1.5 rounded text-neutral-300">
              {MAPS[selectedMap]?.name || selectedMap} <span className="text-xs text-neutral-500">(escolhido pelo Jogador A)</span>
            </span>
          )}
        </div>

        {/* Opponent status banner */}
        <div className="mb-6 bg-neutral-900 border border-neutral-700 rounded-lg p-3 flex items-center justify-between text-sm">
          <div>
            <span className="text-neutral-400">Adversário (Equipe {opponentTeam}): </span>
            <span className="font-bold text-white">{opponentName || "aguardando entrar…"}</span>
            {opponentName && (
              <span className="text-neutral-500 ml-2">· {opponentUnitCount} unidade(s)</span>
            )}
          </div>
          <div className={`flex items-center gap-2 font-bold ${opponentReady ? "text-emerald-400" : "text-neutral-500"}`}>
            {opponentReady ? <><Check size={16} /> Pronto</> : <><X size={16} /> Aguardando</>}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-200">{errorMsg}</div>
        )}

        <div className="flex gap-4">
          <div className="w-1/3 flex flex-col gap-3">
            {units.map(u => (
              <div key={u.id} className="bg-neutral-900 border border-neutral-700 p-4 rounded-xl relative group">
                <button onClick={() => removeUnit(u.id)} className="absolute top-2 right-2 text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                <div className="flex justify-between items-center mb-3">
                  <input
                    value={u.name}
                    onChange={(e) => updateUnit(u.id, "name", e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-indigo-500 focus:outline-none font-bold text-white w-2/3"
                  />
                  <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-bold">{calcUnitCost(u)} pts</span>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <label className="text-neutral-500 text-xs block">Classe</label>
                    <select value={u.className} onChange={e => updateUnit(u.id, "className", e.target.value)}
                      className="w-full bg-neutral-800 border-none rounded p-1 text-neutral-300 outline-none focus:ring-1 focus:ring-indigo-500">
                      {Object.values(CLASSES).filter(c => c.faction === teamFaction).map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.points})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-neutral-500 text-xs block">Arma</label>
                    <select value={u.weaponName || ""} onChange={e => updateUnit(u.id, "weaponName", e.target.value)}
                      className="w-full bg-neutral-800 border-none rounded p-1 text-neutral-300 outline-none focus:ring-1 focus:ring-indigo-500">
                      {Object.values(WEAPONS).filter(w => isWeaponAllowed(w.name, u.className)).map(w => (
                        <option key={w.name} value={w.name}>{w.weaponClass} · {w.name} ({w.points} pts)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-neutral-500 text-xs block">Colete</label>
                    <select value={u.armorName || ""} onChange={e => updateUnit(u.id, "armorName", e.target.value)}
                      className="w-full bg-neutral-800 border-none rounded p-1 text-neutral-300 outline-none focus:ring-1 focus:ring-indigo-500">
                      {Object.values(ARMORS).map(a => <option key={a.name} value={a.name}>{a.name} ({a.points})</option>)}
                    </select>
                  </div>
                  <div className="pt-2">
                    <label className="text-neutral-500 text-xs block mb-1">Acessórios ({u.attachments.length}/{WEAPONS[u.weaponName || ""]?.slots || 0})</label>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.values(ATTACHMENTS).map(att => (
                        <label key={att.name} className="flex items-center gap-1 text-xs text-neutral-400 cursor-pointer">
                          <input type="checkbox" checked={u.attachments.includes(att.name)} onChange={() => toggleArrayItem(u.id, "attachments", att.name)} className="accent-indigo-500" />
                          <span className="truncate" title={att.description}>{att.name} ({att.points})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2">
                    <label className="text-neutral-500 text-xs block mb-1">Habilidades</label>
                    <div className="flex flex-col gap-1">
                      {Object.values(SKILLS).filter(sk => sk.classRequired === CLASSES[u.className]?.name).map(sk => {
                        const isSextoSentido = sk.name === "Sexto Sentido";
                        return (
                          <label key={sk.name} className={`flex items-center gap-1 text-xs ${isSextoSentido ? "text-neutral-600 opacity-50 cursor-not-allowed" : "text-neutral-400 cursor-pointer"}`}>
                            <input type="checkbox" disabled={isSextoSentido} checked={isSextoSentido ? false : u.skills.includes(sk.name)} onChange={() => toggleArrayItem(u.id, "skills", sk.name)} className="accent-indigo-500" />
                            <span title={sk.description}>{sk.name}{isSextoSentido ? " 🔒 Em breve" : ` (${sk.points})`}</span>
                          </label>
                        );
                      })}
                      {Object.values(SKILLS).filter(sk => sk.classRequired === CLASSES[u.className]?.name).length === 0 && (
                        <span className="text-xs text-neutral-600 italic">Nenhuma disp.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addUnit}
              disabled={units.length >= MAX_UNITS || teamCost >= MAX_POINTS}
              className="w-full py-4 border-2 border-dashed border-neutral-700 hover:border-indigo-500 text-neutral-500 hover:text-indigo-400 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-500"
            >
              <span className="text-xl">+</span> Recrutar Unidade
            </button>
          </div>

          <div className="w-2/3 border-l border-neutral-700 pl-6 flex flex-col justify-between">
            <div>
              <h3 className="text-xl text-white font-bold mb-4">Resumo do Exército</h3>
              {units.length === 0 ? (
                <p className="text-neutral-500 italic">Nenhuma unidade recrutada.</p>
              ) : (
                <div className="space-y-4">
                  {units.map(u => (
                    <div key={u.id} className="flex gap-4 items-center bg-black/20 p-3 rounded-lg border border-neutral-800">
                      <div
                        className="w-12 h-12 bg-neutral-800 rounded flex items-center justify-center text-xl font-black text-neutral-600 bg-cover bg-center shrink-0"
                        style={{ backgroundImage: `url("${getImageUrl('/roles/' + CLASSES[u.className]?.name.toLowerCase() + '.png')}")` }}
                      >
                        {!["assalto","suporte","médico","granadeiro","sniper"].includes(CLASSES[u.className]?.name.toLowerCase()) &&
                          CLASSES[u.className]?.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-indigo-400 leading-tight">
                          {u.name} <span className="text-neutral-500 text-xs ml-1 font-normal">— {CLASSES[u.className]?.name}</span>
                        </h4>
                        <p className="text-xs text-neutral-400 capitalize mt-1 pt-1 border-t border-neutral-800/50">
                          {u.weaponName} | {u.armorName}
                          {u.attachments.length > 0 && ` | Acds: ${u.attachments.length}`}
                          {u.skills.length > 0 && ` | Hab: ${u.skills.length}`}
                        </p>
                      </div>
                      <div className="font-mono font-bold text-neutral-300">{calcUnitCost(u)} pts</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-neutral-700 text-center">
              <button
                onClick={handleToggleReady}
                disabled={savingReady || (!myReady && !canBeReady)}
                className={`px-10 py-4 rounded-xl font-black text-white text-xl tracking-wide shadow-lg transition-all w-full max-w-md ${
                  myReady
                    ? "bg-amber-600 hover:bg-amber-500"
                    : canBeReady
                      ? "bg-green-600 hover:bg-green-500 hover:shadow-green-500/20"
                      : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
                }`}
              >
                {myReady ? "✕ CANCELAR PRONTO" : "✓ PRONTO PARA POSICIONAR"}
              </button>
              {!canBeReady && !myReady && (
                <p className="text-sm text-red-400 mt-3">Recrute pelo menos 1 unidade para confirmar.</p>
              )}
              {myReady && opponentReady && (
                <p className="text-sm text-emerald-400 mt-3">Ambos prontos! Indo para Posicionamento…</p>
              )}
              {myReady && !opponentReady && (
                <p className="text-sm text-neutral-400 mt-3">Aguardando o adversário ficar pronto.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
