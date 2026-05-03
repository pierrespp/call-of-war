import React, { useState, useEffect, useRef, useCallback } from "react";
import { GameMap, CELL_SIZE, MapGridSettings, DEFAULT_GRID_SETTINGS, MAPS } from '@/src/core/data/constants';
import { useMaps } from '@/src/core/contexts/MapContext';
import { CoverType, MapCoverData } from '@/src/types/game';
import { validateDeployZones } from '@/src/features/combat/utils/pathfinding';
import { Shield, ShieldAlert, ArrowLeft, Save, Eraser, Square, Droplet, Flag, Grid3x3, RotateCcw, DoorClosed, DoorOpen, AppWindow, RefreshCcw, AlertTriangle, Skull, LogOut, Copy, Check, ClipboardPaste } from "lucide-react";
import { useImages } from '@/src/core/contexts/ImageContext';

// NOTE: Optimized for 60FPS performance using Canvas and Refs.

interface BrushOption {
  id: CoverType;
  label: string;
  short: string;
  bg: string;
  border: string;
  textColor: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}

const BRUSHES: BrushOption[] = [
  { id: "none",    label: "Vazio",          short: "Vazio",   bg: "transparent",                  border: "rgba(115,115,115,0.4)", textColor: "text-neutral-300", Icon: Eraser,      description: "Apaga marcação da célula." },
  { id: "half",    label: "Meia Cobertura", short: "Meia",    bg: "rgba(234,179,8,0.25)",         border: "rgba(234,179,8,0.7)",   textColor: "text-yellow-200",  Icon: Shield,      description: "Paredes baixas, carros (-20% de hit no alvo)." },
  { id: "full",    label: "Cobertura Total",short: "Total",   bg: "rgba(239,68,68,0.25)",         border: "rgba(239,68,68,0.7)",   textColor: "text-red-200",     Icon: ShieldAlert, description: "Paredão, blindado (-40% de hit no alvo)." },
  { id: "wall",    label: "Parede",         short: "Parede",  bg: "rgba(64,64,64,0.7)",           border: "rgba(115,115,115,0.9)", textColor: "text-neutral-200", Icon: Square,      description: "Bloqueia tiros e movimento." },
  { id: "deployA", label: "Deploy Equipe A",short: "Deploy A",bg: "rgba(96,165,250,0.30)",        border: "rgba(96,165,250,0.8)",  textColor: "text-blue-200",    Icon: Flag,        description: "Zona azul clara — onde a Equipe A posiciona suas tropas (zonas devem ter 9 células contíguas)." },
  { id: "deployB", label: "Deploy Equipe B",short: "Deploy B",bg: "rgba(252,165,165,0.40)",       border: "rgba(252,165,165,0.9)", textColor: "text-red-200",     Icon: Flag,        description: "Zona vermelha clara — onde a Equipe B posiciona suas tropas (zonas devem ter 9 células contíguas)." },
  { id: "water",   label: "Água",           short: "Água",    bg: "rgba(30,64,175,0.5)",          border: "rgba(30,64,175,0.9)",   textColor: "text-blue-100",    Icon: Droplet,     description: "Cada célula custa 3 m de movimento (em vez de 1.5 m)." },
  { id: "doorClose", label: "Porta Fechada", short: "Porta F", bg: "rgba(139,69,19,0.5)",         border: "rgba(139,69,19,0.9)",   textColor: "text-amber-700",   Icon: DoorClosed,  description: "Porta fechada (cobertura total, pode ser aberta)." },
  { id: "doorOpen",  label: "Porta Aberta",  short: "Porta A", bg: "rgba(210,180,140,0.5)",       border: "rgba(210,180,140,0.9)", textColor: "text-amber-500",   Icon: DoorOpen,    description: "Porta aberta (caminho livre normal)." },
  { id: "window",    label: "Janela",        short: "Janela",  bg: "rgba(0,255,255,0.3)",         border: "rgba(0,255,255,0.8)",   textColor: "text-cyan-300",    Icon: AppWindow,   description: "Janela (cobertura meia, custo dupla de movimento)." },
  { id: "spawn_pve", label: "Spawn Zumbi",   short: "Spawn Z", bg: "rgba(168,85,247,0.4)",        border: "rgba(168,85,247,0.9)",  textColor: "text-purple-300",  Icon: Skull,       description: "Local onde os zumbis podem ser spawnados no modo PVE." },
  { id: "extraction",label: "Extração PVE",  short: "Extrac",  bg: "rgba(34,197,94,0.4)",         border: "rgba(34,197,94,0.9)",   textColor: "text-green-300",   Icon: LogOut,      description: "Local onde os jogadores devem chegar para finalizar a missão (PVE)." },
];

type ToolMode = "draw" | "pan";

export function MapEditorMenu({ onBack }: { onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getMapImage } = useImages();
  const { maps, loading: mapsLoading } = useMaps();
  const [selectedMap, setSelectedMap] = useState<string>("");

  // Refs for camera and zoom (to avoid React re-renders)
  const cameraRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(0.4);
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const needsRedraw = useRef(true);

  const [coverData, setCoverData] = useState<MapCoverData>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const toolModeRef = useRef<ToolMode>("draw");
  const [brush, setBrush] = useState<CoverType>("half");
  const brushRef = useRef<CoverType>("half");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [gridSettings, setGridSettings] = useState<MapGridSettings>(DEFAULT_GRID_SETTINGS);
  const gridSettingsRef = useRef<MapGridSettings>(DEFAULT_GRID_SETTINGS);

  // Sync refs with state when they change
  useEffect(() => { toolModeRef.current = toolMode; }, [toolMode]);
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => { gridSettingsRef.current = gridSettings; needsRedraw.current = true; }, [gridSettings]);

  // Set initial selected map once maps are loaded
  useEffect(() => {
    if (!selectedMap && Object.keys(maps).length > 0) {
      setSelectedMap(Object.keys(maps)[0]);
    }
  }, [maps, selectedMap]);

  // When map changes, fetch data from server
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedMap) return;
      setIsFetching(true);
      try {
        const [coverResp, gridResp] = await Promise.all([
          fetch(`/api/maps/${selectedMap}/cover`),
          fetch(`/api/maps/${selectedMap}/grid-settings`)
        ]);
        
        if (coverResp.ok) {
          const data = await coverResp.json();
          setCoverData(data);
        }
        
        if (gridResp.ok) {
          const data = await gridResp.json();
          setGridSettings(data);
        }

        // Load map image
        const imgUrl = getMapImage(selectedMap);
        if (imgUrl) {
          const img = new Image();
          img.src = imgUrl;
          img.onload = () => {
            mapImageRef.current = img;
            needsRedraw.current = true;
          };
        }
      } catch (err) {
        console.error("Failed to fetch map data:", err);
      } finally {
        setIsFetching(false);
        setValidationError(null);
        setSavedAt(null);
      }
    };
    
    fetchData();
  }, [selectedMap, getMapImage]);

  const mapInfo = selectedMap ? maps[selectedMap] : null;
  const validation = validateDeployZones(coverData);

  // --- RENDERING LOOP ---
  useEffect(() => {
    let animationId: number;
    
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !mapInfo) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      // Sync canvas size to container
      const container = containerRef.current;
      if (container) {
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      // Center and apply camera/zoom
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoomRef.current, zoomRef.current);
      ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

      const cellSize = gridSettingsRef.current.cellSize;
      const mapW = mapInfo.gridWidth * CELL_SIZE;
      const mapH = mapInfo.gridHeight * CELL_SIZE;
      const gridW = mapInfo.gridWidth * cellSize;
      const gridH = mapInfo.gridHeight * cellSize;

      // 1. Draw Map Background
      if (mapImageRef.current) {
        ctx.drawImage(mapImageRef.current, 0, 0, mapW, mapH);
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, mapW, mapH);
      }

      // 2. Draw Grid
      if (zoomRef.current > 0.15 && gridSettingsRef.current.opacity > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${gridSettingsRef.current.opacity * 0.5})`;
        ctx.lineWidth = 1 / zoomRef.current;
        ctx.beginPath();
        for (let x = 0; x <= mapInfo.gridWidth; x++) {
          ctx.moveTo(x * cellSize, 0);
          ctx.lineTo(x * cellSize, gridH);
        }
        for (let y = 0; y <= mapInfo.gridHeight; y++) {
          ctx.moveTo(0, y * cellSize);
          ctx.lineTo(gridW, y * cellSize);
        }
        ctx.stroke();
      }

      // 3. Draw Cover Data
      Object.entries(coverData).forEach(([key, type]) => {
        if (!type || type === "none") return;
        const [gx, gy] = key.split(",").map(Number);
        const def = BRUSHES.find(b => b.id === type);
        if (!def) return;

        const cellX = gx * cellSize;
        const cellY = gy * cellSize;
        
        let isIncomplete = false;
        if (type === "deployA") {
          const zone = validation.zonesA.find(z => z.cells.includes(key));
          if (zone && zone.cells.length !== 9) isIncomplete = true;
        } else if (type === "deployB") {
          const zone = validation.zonesB.find(z => z.cells.includes(key));
          if (zone && zone.cells.length !== 9) isIncomplete = true;
        }

        const bgColor = isIncomplete ? "rgba(245,158,11,0.4)" : def.bg;
        const borderColor = isIncomplete ? "rgba(245,158,11,0.8)" : def.border;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2 / zoomRef.current;
        ctx.fillRect(cellX, cellY, cellSize, cellSize);
        ctx.strokeRect(cellX, cellY, cellSize, cellSize);

        if (isIncomplete) {
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.moveTo(cellX + cellSize/2, cellY + cellSize/4);
          ctx.lineTo(cellX + cellSize/4, cellY + cellSize*0.75);
          ctx.lineTo(cellX + cellSize*0.75, cellY + cellSize*0.75);
          ctx.fill();
        } else if (type === 'wall' || type === 'full' || type === 'half') {
          ctx.fillStyle = def.border;
          ctx.fillRect(cellX + cellSize*0.3, cellY + cellSize*0.3, cellSize*0.4, cellSize*0.4);
        } else if (type === 'water') {
           ctx.fillStyle = "rgba(30,64,175,0.4)";
           ctx.fillRect(cellX, cellY, cellSize, cellSize);
        } else if (type === 'deployA' || type === 'deployB') {
           ctx.fillStyle = type === 'deployA' ? "rgba(96,165,250,0.5)" : "rgba(252,165,165,0.5)";
           ctx.beginPath();
           ctx.arc(cellX + cellSize/2, cellY + cellSize/2, cellSize/4, 0, Math.PI * 2);
           ctx.fill();
        }
      });

      ctx.restore();
      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [coverData, mapInfo, validation.zonesA, validation.zonesB]);

  const paintCell = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (toolModeRef.current !== "draw" || isPanningRef.current) return;
    if (!canvasRef.current || !mapInfo) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Convert screen coordinates to world coordinates
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const worldX = (screenX - canvas.width / 2) / zoomRef.current + cameraRef.current.x;
    const worldY = (screenY - canvas.height / 2) / zoomRef.current + cameraRef.current.y;
    
    const cellSize = gridSettingsRef.current.cellSize;
    const gridX = Math.floor(worldX / cellSize);
    const gridY = Math.floor(worldY / cellSize);
    
    if (gridX < 0 || gridY < 0 || gridX >= mapInfo.gridWidth || gridY >= mapInfo.gridHeight) return;

    const cellKey = `${gridX},${gridY}`;
    setCoverData(prev => {
      const cur = prev[cellKey] || "none";
      if (cur === brushRef.current) return prev;
      const next = { ...prev };
      if (brushRef.current === "none") delete next[cellKey];
      else next[cellKey] = brushRef.current;
      return next;
    });
    needsRedraw.current = true;
  }, [mapInfo]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && toolModeRef.current === "draw") {
      isDraggingRef.current = true;
      paintCell(e);
    } else if (e.button === 1 || e.button === 2 || (e.button === 0 && toolModeRef.current === "pan")) {
      isPanningRef.current = true;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      cameraRef.current.x -= e.movementX / zoomRef.current;
      cameraRef.current.y -= e.movementY / zoomRef.current;
      needsRedraw.current = true;
    } else if (isDraggingRef.current) {
      paintCell(e);
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      const factor = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
      zoomRef.current = Math.min(Math.max(0.05, zoomRef.current * factor), 8);
    };

    container.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => container.removeEventListener("wheel", handleWheelNative);
  }, [selectedMap]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setCoverData(json);
        setValidationError(null);
        setSavedAt(null);
        needsRedraw.current = true;
      } catch (err) {
        alert("JSON de overlay inválido!");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSave = () => {
    const blob = new Blob([JSON.stringify(coverData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedMap}_cover.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSavedAt(Date.now());
  };
  
  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(coverData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const json = JSON.parse(text);
      if (typeof json === 'object' && json !== null) {
        setCoverData(json);
        setValidationError(null);
        setSavedAt(null);
        setPasted(true);
        setTimeout(() => setPasted(false), 2000);
      } else {
        throw new Error("Formato JSON inválido");
      }
    } catch (err) {
      alert("Erro ao colar JSON: Certifique-se de que o conteúdo copiado é um JSON válido.");
    }
  };

  const handleSyncServer = async () => {
    setIsSyncing(true);
    setValidationError(null);
    try {
      const [coverResp, gridResp] = await Promise.all([
        fetch(`/api/maps/${selectedMap}/cover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(coverData)
        }),
        fetch(`/api/maps/${selectedMap}/grid-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gridSettings)
        })
      ]);

      if (!coverResp.ok || !gridResp.ok) throw new Error("Erro ao sincronizar com servidor");
      setSavedAt(Date.now());
    } catch (err) {
      setValidationError("Falha na sincronização: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setIsSyncing(false);
    }
  };

  const resetGridSettings = () => {
    setGridSettings(DEFAULT_GRID_SETTINGS);
    needsRedraw.current = true;
  };

  const updateGrid = (patch: Partial<MapGridSettings>) => {
    setGridSettings(prev => ({ ...prev, ...patch }));
    needsRedraw.current = true;
  };

  if (mapsLoading && !selectedMap) {
    return (
      <div className="flex bg-neutral-900 h-screen w-full text-white items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCcw className="animate-spin text-indigo-500" size={48} />
          <p className="text-xl font-bold animate-pulse">Carregando Mapas...</p>
        </div>
      </div>
    );
  }

  if (!mapInfo) {
    return (
      <div className="flex bg-neutral-900 h-screen w-full text-white items-center justify-center p-8">
        <div className="bg-neutral-800 border border-neutral-700 p-8 rounded-2xl max-w-md text-center shadow-2xl">
          <AlertTriangle className="text-amber-500 mx-auto mb-4" size={48} />
          <h2 className="text-2xl font-black mb-2">Mapa não encontrado!</h2>
          <p className="text-neutral-400 mb-6 font-medium">Não foi possível carregar os dados do mapa ou a lista de mapas está vazia.</p>
          <button onClick={onBack} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-indigo-600/20">
            Voltar ao Menu
          </button>
        </div>
      </div>
    );
  }

  const canvasCursor = toolMode === "draw" ? "cursor-crosshair" : "cursor-move";

  return (
    <div className="flex h-full w-full text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-96 glass-panel-dark border-r border-white/5 flex flex-col shadow-2xl z-10 backdrop-blur-2xl">
        <div className="p-6 border-b border-neutral-700">
          <button onClick={onBack} className="btn-tactical flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-6 text-[10px] font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            <ArrowLeft size={16} /> Voltar ao Menu
          </button>
          <h2 className="text-2xl font-black mb-2">Editor de Mapa</h2>
          <p className="text-neutral-500 text-sm">Pinte coberturas, paredes, água e zonas de deploy para os mapas existentes.</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">Mapa</label>
            <select
              className="w-full bg-neutral-900/50 backdrop-blur-md border border-white/10 text-white rounded-xl p-3 focus:outline-none focus:border-indigo-500 transition-all font-bold text-sm"
              value={selectedMap}
              onChange={(e) => { 
                setSelectedMap(e.target.value); 
                cameraRef.current = { x: 0, y: 0 }; 
                setValidationError(null); 
                setSavedAt(null);
                needsRedraw.current = true;
              }}
            >
              {Object.values(maps).map((map: GameMap) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">Ferramenta</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setToolMode("draw")}
                className={`py-2 rounded font-bold text-xs transition-colors border ${toolMode === "draw" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
              >Pintar</button>
              <button
                onClick={() => setToolMode("pan")}
                className={`py-2 rounded font-bold text-xs transition-colors border ${toolMode === "pan" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
              >Câmera</button>
            </div>
          </div>

          {toolMode === "draw" && (
            <div>
              <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">Pincel</label>
              <div className="grid grid-cols-2 gap-2">
                {BRUSHES.map(b => {
                  const isActive = brush === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBrush(b.id)}
                      title={b.description}
                      className={`flex items-center gap-2 p-2 rounded border-2 text-xs font-bold transition-all ${isActive ? "ring-2 ring-indigo-400 scale-[1.02]" : "opacity-90 hover:opacity-100"}`}
                      style={{ backgroundColor: b.bg === "transparent" ? "rgba(38,38,38,0.6)" : b.bg, borderColor: b.border }}
                    >
                      <b.Icon size={14} className={b.textColor} />
                      <span className={b.textColor}>{b.short}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-500 mt-2">{BRUSHES.find(b => b.id === brush)?.description}</p>
              <p className="text-[11px] text-neutral-500 mt-1">Clique e arraste pra pintar várias células de uma vez.</p>
            </div>
          )}

          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-700 space-y-3">
            <h3 className="font-bold text-sm text-neutral-300 uppercase tracking-widest border-b border-neutral-800 pb-2 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-2"><Grid3x3 size={14} /> Grid</span>
              <button
                onClick={resetGridSettings}
                className="text-[10px] flex items-center gap-1 text-neutral-500 hover:text-indigo-300"
              ><RotateCcw size={11} /> Padrão</button>
            </h3>

            <div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                <span className="font-bold uppercase tracking-wider">Tamanho</span>
                <span className="font-mono text-neutral-200">{gridSettings.cellSize} px</span>
              </div>
              <input
                type="range"
                min={20}
                max={150}
                step={1}
                value={gridSettings.cellSize}
                onChange={(e) => updateGrid({ cellSize: parseInt(e.target.value, 10) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                <span className="font-bold uppercase tracking-wider">Opacidade</span>
                <span className="font-mono text-neutral-200">{Math.round(gridSettings.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(gridSettings.opacity * 100)}
                onChange={(e) => updateGrid({ opacity: parseInt(e.target.value, 10) / 100 })}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-700 space-y-2">
            <h3 className="font-bold text-sm text-neutral-300 uppercase tracking-widest border-b border-neutral-800 pb-2 mb-2">Zonas de Deploy</h3>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-blue-300">Equipe A:</span>
                <span className="font-mono">{validation.zonesA.length} zona(s) — {validation.zonesA.map(z => z.cells.length).join(", ") || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-300">Equipe B:</span>
                <span className="font-mono">{validation.zonesB.length} zona(s) — {validation.zonesB.map(z => z.cells.length).join(", ") || "—"}</span>
              </div>
            </div>
          </div>

          {validationError && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-xs text-red-200 whitespace-pre-line">
              {validationError}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-black/20 space-y-3">
          <button
            onClick={handleSyncServer}
            disabled={isSyncing || isFetching}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            {isSyncing ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
            {isSyncing ? "Sincronizando..." : "Sincronizar com Servidor"}
          </button>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSave}
              className="flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-bold py-2 rounded-lg transition-colors border border-neutral-600 text-xs"
            >Baixar JSON</button>
            <input type="file" accept=".json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImport} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-bold py-2 rounded-lg transition-colors border border-neutral-600 text-xs"
            >Carregar JSON</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyClipboard}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-xs transition-all border ${copied ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copiado!" : "Copiar JSON"}
            </button>
            <button
              onClick={handlePasteClipboard}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-xs transition-all border ${pasted ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
            >
              {pasted ? <Check size={14} /> : <ClipboardPaste size={14} />}
              {pasted ? "Colado!" : "Colar JSON"}
            </button>
          </div>
        </div>
      </div>

      {/* Map area */}
      <div
        ref={containerRef}
        className={`flex-1 relative bg-neutral-950 overflow-hidden ${canvasCursor}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block"
        />
      </div>
    </div>
  );
}
