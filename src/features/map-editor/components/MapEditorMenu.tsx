import React, { useState, useEffect, useRef, useCallback } from "react";
import { GameMap, CELL_SIZE, MapGridSettings, DEFAULT_GRID_SETTINGS, MAPS } from '@/src/core/data/constants';
import { useMaps } from '@/src/core/contexts/MapContext';
import { CoverType, MapCoverData } from '@/src/types/game';
import { TileSet, TileDefinition, TileCategory, MapTileData, MapCellTile } from '@/src/types/tileset';
import { BUILTIN_TILESETS } from '@/src/core/data/tilesets';
import { createTileLookup, deriveCoverDataFromTiles, generateUrbanTacticalPreset, validateTileSetManifest } from '@/src/utils/tilesetUtils';
import { validateDeployZones } from '@/src/features/combat/utils/pathfinding';
import {
  Shield, ShieldAlert, ArrowLeft, Save, Eraser, Square, Droplet, Flag,
  Grid3x3, RotateCcw, RotateCw, DoorClosed, DoorOpen, AppWindow, RefreshCcw,
  AlertTriangle, Skull, LogOut, Copy, Check, ClipboardPaste, Layers, Palette, Wand2, UploadCloud
} from "lucide-react";
import { useImages } from '@/src/core/contexts/ImageContext';

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
  { id: "none",       label: "Vazio",          short: "Vazio",   bg: "transparent",                  border: "rgba(115,115,115,0.4)", textColor: "text-neutral-300", Icon: Eraser,      description: "Apaga marcação da célula." },
  { id: "half",       label: "Meia Cobertura", short: "Meia",    bg: "rgba(234,179,8,0.25)",         border: "rgba(234,179,8,0.7)",   textColor: "text-yellow-200",  Icon: Shield,      description: "Paredes baixas, carros (-20% de hit no alvo)." },
  { id: "full",       label: "Cobertura Total",short: "Total",   bg: "rgba(239,68,68,0.25)",         border: "rgba(239,68,68,0.7)",   textColor: "text-red-200",     Icon: ShieldAlert, description: "Paredão, blindado (-40% de hit no alvo)." },
  { id: "wall",       label: "Parede",         short: "Parede",  bg: "rgba(64,64,64,0.7)",           border: "rgba(115,115,115,0.9)", textColor: "text-neutral-200", Icon: Square,      description: "Bloqueia tiros e movimento." },
  { id: "deployA",    label: "Deploy Equipe A",short: "Deploy A",bg: "rgba(96,165,250,0.30)",        border: "rgba(96,165,250,0.8)",  textColor: "text-blue-200",    Icon: Flag,        description: "Zona azul clara — onde a Equipe A posiciona suas tropas (zonas devem ter 9 células contíguas)." },
  { id: "deployB",    label: "Deploy Equipe B",short: "Deploy B",bg: "rgba(252,165,165,0.40)",       border: "rgba(252,165,165,0.9)", textColor: "text-red-200",     Icon: Flag,        description: "Zona vermelha clara — onde a Equipe B posiciona suas tropas (zonas devem ter 9 células contíguas)." },
  { id: "water",      label: "Água",           short: "Água",    bg: "rgba(30,64,175,0.5)",          border: "rgba(30,64,175,0.9)",   textColor: "text-blue-100",    Icon: Droplet,     description: "Cada célula custa 3 m de movimento (em vez de 1.5 m)." },
  { id: "doorClose",  label: "Porta Fechada",  short: "Porta F", bg: "rgba(139,69,19,0.5)",         border: "rgba(139,69,19,0.9)",   textColor: "text-amber-700",   Icon: DoorClosed,  description: "Porta fechada (cobertura total, pode ser aberta)." },
  { id: "doorOpen",   label: "Porta Aberta",   short: "Porta A", bg: "rgba(210,180,140,0.5)",       border: "rgba(210,180,140,0.9)", textColor: "text-amber-500",   Icon: DoorOpen,    description: "Porta aberta (caminho livre normal)." },
  { id: "window",     label: "Janela",         short: "Janela",  bg: "rgba(0,255,255,0.3)",         border: "rgba(0,255,255,0.8)",   textColor: "text-cyan-300",    Icon: AppWindow,   description: "Janela (cobertura meia, custo duplo de movimento)." },
  { id: "spawn_pve",  label: "Spawn Zumbi",    short: "Spawn Z", bg: "rgba(168,85,247,0.4)",        border: "rgba(168,85,247,0.9)",  textColor: "text-purple-300",  Icon: Skull,       description: "Local onde os zumbis podem ser spawnados no modo PVE." },
  { id: "extraction", label: "Extração PVE",   short: "Extrac",  bg: "rgba(34,197,94,0.4)",         border: "rgba(34,197,94,0.9)",   textColor: "text-green-300",   Icon: LogOut,      description: "Local onde os jogadores devem chegar para finalizar a missão (PVE)." },
];

const CATEGORY_LABELS: Record<TileCategory | 'all', string> = {
  all: "Todos",
  floor: "Terrenos & Chão",
  wall: "Paredes",
  cover: "Coberturas & Props",
  liquid: "Líquidos",
  door: "Portas",
  window: "Janelas",
  special: "Especiais",
};

type ToolMode = "tile" | "cover" | "pan";

export function MapEditorMenu({ onBack }: { onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getMapImage } = useImages();
  const { maps, loading: mapsLoading } = useMaps();
  const [selectedMap, setSelectedMap] = useState<string>("");

  // Refs for camera and zoom (for 60FPS fluid canvas)
  const cameraRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(0.4);
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const tileImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const needsRedraw = useRef(true);

  // Editor modes & tile selection state
  const [activeTileSetId, setActiveTileSetId] = useState<string>(BUILTIN_TILESETS[0]?.id || "urban_ruins");
  const [tileCategory, setTileCategory] = useState<TileCategory | 'all'>("all");
  const [selectedTileId, setSelectedTileId] = useState<string | null>("asphalt_clean");
  const [tileRotation, setTileRotation] = useState<0 | 90 | 180 | 270>(0);
  const selectedTileIdRef = useRef<string | null>("asphalt_clean");
  const tileRotationRef = useRef<0 | 90 | 180 | 270>(0);

  // Tactical cover & tile data
  const [coverData, setCoverData] = useState<MapCoverData>({});
  const [tileData, setTileData] = useState<MapTileData>({});
  const coverDataRef = useRef<MapCoverData>({});
  const tileDataRef = useRef<MapTileData>({});

  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>("tile");
  const toolModeRef = useRef<ToolMode>("tile");
  const [brush, setBrush] = useState<CoverType>("half");
  const brushRef = useRef<CoverType>("half");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [gridSettings, setGridSettings] = useState<MapGridSettings>(DEFAULT_GRID_SETTINGS);
  const gridSettingsRef = useRef<MapGridSettings>(DEFAULT_GRID_SETTINGS);

  const tileLookup = useRef(createTileLookup(BUILTIN_TILESETS));

  // Sync refs with state
  useEffect(() => { toolModeRef.current = toolMode; }, [toolMode]);
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => { selectedTileIdRef.current = selectedTileId; }, [selectedTileId]);
  useEffect(() => { tileRotationRef.current = tileRotation; }, [tileRotation]);
  useEffect(() => { coverDataRef.current = coverData; needsRedraw.current = true; }, [coverData]);
  useEffect(() => { tileDataRef.current = tileData; needsRedraw.current = true; }, [tileData]);
  useEffect(() => { gridSettingsRef.current = gridSettings; needsRedraw.current = true; }, [gridSettings]);

  // Pre-load all tile sprites into memory
  useEffect(() => {
    BUILTIN_TILESETS.forEach(set => {
      set.tiles.forEach(t => {
        if (!tileImagesRef.current[t.id]) {
          const img = new Image();
          img.src = t.imagePath;
          img.onload = () => {
            tileImagesRef.current[t.id] = img;
            needsRedraw.current = true;
          };
        }
      });
    });
  }, []);

  // Set initial selected map
  useEffect(() => {
    if (!selectedMap && Object.keys(maps).length > 0) {
      setSelectedMap(Object.keys(maps)[0]);
    }
  }, [maps, selectedMap]);

  // When map changes, fetch tiles & cover data
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedMap) return;
      setIsFetching(true);
      try {
        const [coverResp, gridResp, tileResp] = await Promise.all([
          fetch(`/api/maps/${selectedMap}/cover`),
          fetch(`/api/maps/${selectedMap}/grid-settings`),
          fetch(`/api/maps/${selectedMap}/tiles`),
        ]);
        
        if (coverResp.ok) {
          const data = await coverResp.json();
          setCoverData(data);
        }
        
        if (gridResp.ok) {
          const data = await gridResp.json();
          setGridSettings(data);
        }

        if (tileResp.ok) {
          const data = await tileResp.json();
          setTileData(data || {});
        }

        // Load background map image
        const imgUrl = getMapImage(selectedMap);
        if (imgUrl) {
          const img = new Image();
          img.src = imgUrl;
          img.onload = () => {
            mapImageRef.current = img;
            needsRedraw.current = true;
          };
        } else {
          mapImageRef.current = null;
          needsRedraw.current = true;
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
  const activeTileSet = BUILTIN_TILESETS.find(s => s.id === activeTileSetId) || BUILTIN_TILESETS[0];

  const filteredTiles = activeTileSet.tiles.filter(t => {
    if (tileCategory === 'all') return true;
    return t.category === tileCategory;
  });

  // --- RENDERING LOOP (60 FPS Canvas API) ---
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

      // 1. Draw Map Background (se existir)
      if (mapImageRef.current) {
        ctx.drawImage(mapImageRef.current, 0, 0, mapW, mapH);
      } else {
        ctx.fillStyle = "#1e2024";
        ctx.fillRect(0, 0, gridW, gridH);
      }

      // 2. Render Tile Layer (Sprites & Presets Modulares)
      const currentTiles = tileDataRef.current;
      for (const [cellKey, cellTile] of Object.entries(currentTiles)) {
        const tile = cellTile as MapCellTile;
        if (!tile) continue;
        const [gx, gy] = cellKey.split(",").map(Number);
        const img = tileImagesRef.current[tile.tileId];
        const cellX = gx * cellSize;
        const cellY = gy * cellSize;

        if (img && img.complete) {
          ctx.save();
          if (tile.rotation) {
            ctx.translate(cellX + cellSize / 2, cellY + cellSize / 2);
            ctx.rotate((tile.rotation * Math.PI) / 180);
            ctx.drawImage(img, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
          } else {
            ctx.drawImage(img, cellX, cellY, cellSize, cellSize);
          }
          ctx.restore();
        } else {
          // Fallback visual tile placeholder
          ctx.fillStyle = "#2d3039";
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
        }
      }


      // 3. Draw Grid Lines
      if (zoomRef.current > 0.15 && gridSettingsRef.current.opacity > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${gridSettingsRef.current.opacity * 0.4})`;
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

      // 4. Draw Tactical Cover & Deploy Zones Overlay
      const currentCover = coverDataRef.current;
      for (const [key, type] of Object.entries(currentCover)) {
        if (!type || type === "none") continue;
        const [gx, gy] = key.split(",").map(Number);
        const def = BRUSHES.find(b => b.id === type);
        if (!def) continue;

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

        // Se estiver no modo tile, mostramos overlay tático semi-transparente para não ofuscar o sprite
        const isTileMode = toolModeRef.current === "tile";
        const hasTile = !!currentTiles[key];

        if (type === 'deployA' || type === 'deployB' || type === 'spawn_pve' || type === 'extraction' || !hasTile || !isTileMode) {
          const bgColor = isIncomplete ? "rgba(245,158,11,0.4)" : def.bg;
          const borderColor = isIncomplete ? "rgba(245,158,11,0.8)" : def.border;

          ctx.fillStyle = bgColor;
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.5 / zoomRef.current;
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
          ctx.strokeRect(cellX, cellY, cellSize, cellSize);

          if (isIncomplete) {
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            ctx.moveTo(cellX + cellSize/2, cellY + cellSize/4);
            ctx.lineTo(cellX + cellSize/4, cellY + cellSize*0.75);
            ctx.lineTo(cellX + cellSize*0.75, cellY + cellSize*0.75);
            ctx.fill();
          } else if (type === 'deployA' || type === 'deployB') {
            ctx.fillStyle = type === 'deployA' ? "rgba(96,165,250,0.7)" : "rgba(252,165,165,0.7)";
            ctx.beginPath();
            ctx.arc(cellX + cellSize/2, cellY + cellSize/2, cellSize/4, 0, Math.PI * 2);
            ctx.fill();
          } else if (type === 'spawn_pve') {
            ctx.fillStyle = "rgba(168,85,247,0.8)";
            ctx.fillRect(cellX + cellSize*0.3, cellY + cellSize*0.3, cellSize*0.4, cellSize*0.4);
          } else if (type === 'extraction') {
            ctx.fillStyle = "rgba(34,197,94,0.8)";
            ctx.fillRect(cellX + cellSize*0.25, cellY + cellSize*0.25, cellSize*0.5, cellSize*0.5);
          }
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [mapInfo, validation.zonesA, validation.zonesB]);

  const paintCell = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (isPanningRef.current) return;
    if (!canvasRef.current || !mapInfo) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const worldX = (screenX - canvas.width / 2) / zoomRef.current + cameraRef.current.x;
    const worldY = (screenY - canvas.height / 2) / zoomRef.current + cameraRef.current.y;
    
    const cellSize = gridSettingsRef.current.cellSize;
    const gridX = Math.floor(worldX / cellSize);
    const gridY = Math.floor(worldY / cellSize);
    
    if (gridX < 0 || gridY < 0 || gridX >= mapInfo.gridWidth || gridY >= mapInfo.gridHeight) return;

    const cellKey = `${gridX},${gridY}`;

    if (toolModeRef.current === "tile") {
      const tileId = selectedTileIdRef.current;
      const rot = tileRotationRef.current;

      setTileData(prev => {
        const next = { ...prev };
        if (!tileId) {
          delete next[cellKey];
        } else {
          next[cellKey] = { tileId, rotation: rot };
        }
        return next;
      });

      // Atualiza automaticamente o cover correspondente
      if (tileId) {
        const tileDef = tileLookup.current[tileId];
        if (tileDef) {
          setCoverData(prev => {
            const next = { ...prev };
            // Não sobrescrever zonas de deploy e spawns ao pintar chão comum
            const isSpecial = ['deployA', 'deployB', 'spawn_pve', 'extraction'].includes(next[cellKey] || '');
            if (!isSpecial || tileDef.coverType !== 'none') {
              next[cellKey] = tileDef.coverType;
            }
            return next;
          });
        }
      } else {
        setCoverData(prev => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
      }
      needsRedraw.current = true;
    } else if (toolModeRef.current === "cover") {
      setCoverData(prev => {
        const cur = prev[cellKey] || "none";
        if (cur === brushRef.current) return prev;
        const next = { ...prev };
        if (brushRef.current === "none") delete next[cellKey];
        else next[cellKey] = brushRef.current;
        return next;
      });
      needsRedraw.current = true;
    }
  }, [mapInfo]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && (toolModeRef.current === "tile" || toolModeRef.current === "cover")) {
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

  const rotateCurrentTile = () => {
    const nextRot = ((tileRotation + 90) % 360) as 0 | 90 | 180 | 270;
    setTileRotation(nextRot);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (json.tiles) {
          setTileData(json.tiles);
          if (json.cover) setCoverData(json.cover);
        } else {
          setCoverData(json);
        }
        setValidationError(null);
        setSavedAt(null);
        needsRedraw.current = true;
      } catch (err) {
        alert("JSON de mapa inválido!");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSave = () => {
    const payload = {
      mapId: selectedMap,
      gridSettings,
      tiles: tileData,
      cover: coverData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedMap}_map_data.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSavedAt(Date.now());
  };
  
  const handleCopyClipboard = () => {
    const payload = {
      mapId: selectedMap,
      gridSettings,
      tiles: tileData,
      cover: coverData,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const json = JSON.parse(text);
      if (typeof json === 'object' && json !== null) {
        if (json.tiles) {
          setTileData(json.tiles);
          if (json.cover) setCoverData(json.cover);
        } else {
          setCoverData(json);
        }
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
      const [tileResp, coverResp, gridResp] = await Promise.all([
        fetch(`/api/maps/${selectedMap}/tiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tileData),
        }),
        fetch(`/api/maps/${selectedMap}/cover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(coverData),
        }),
        fetch(`/api/maps/${selectedMap}/grid-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gridSettings),
        }),
      ]);

      if (!tileResp.ok || !coverResp.ok || !gridResp.ok) {
        throw new Error("Erro ao sincronizar com servidor");
      }

      const tileResult = await tileResp.json();
      if (tileResult.coverData) {
        setCoverData(tileResult.coverData);
      }

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
          <p className="text-neutral-400 mb-6 font-medium">Não foi possível carregar os dados do mapa.</p>
          <button onClick={onBack} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-indigo-600/20">
            Voltar ao Menu
          </button>
        </div>
      </div>
    );
  }

  const canvasCursor = toolMode === "pan" ? "cursor-move" : "cursor-crosshair";

  return (
    <div className="flex h-full w-full text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-[420px] glass-panel-dark border-r border-white/5 flex flex-col shadow-2xl z-10 backdrop-blur-2xl">
        <div className="p-5 border-b border-neutral-700/80">
          <button onClick={onBack} className="btn-tactical flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-4 text-[10px] font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            <ArrowLeft size={16} /> Voltar ao Menu
          </button>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Editor de Mapas & Tiles</h2>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
              VTT Studio
            </span>
          </div>
          <p className="text-neutral-400 text-xs mt-1">Carimbe sprites de terrenos, paredes, carros e obstáculos no grid com regras táticas embutidas.</p>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Mapa Selector */}
          <div>
            <label className="block text-xs text-neutral-400 font-bold mb-1.5 uppercase tracking-wider">Mapa Ativo</label>
            <select
              className="w-full bg-neutral-900/80 border border-white/10 text-white rounded-xl p-2.5 focus:outline-none focus:border-indigo-500 font-bold text-xs"
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
                <option key={map.id} value={map.id}>{map.name} ({map.gridWidth}x{map.gridHeight})</option>
              ))}
            </select>
          </div>

          {/* Abas de Modo de Ferramenta */}
          <div>
            <label className="block text-xs text-neutral-400 font-bold mb-1.5 uppercase tracking-wider">Modo de Edição</label>
            <div className="grid grid-cols-3 gap-1.5 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
              <button
                onClick={() => setToolMode("tile")}
                className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${toolMode === "tile" ? "bg-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
              >
                <Palette size={14} /> Presets / Tiles
              </button>
              <button
                onClick={() => setToolMode("cover")}
                className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${toolMode === "cover" ? "bg-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
              >
                <Layers size={14} /> Zonas Táticas
              </button>
              <button
                onClick={() => setToolMode("pan")}
                className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${toolMode === "pan" ? "bg-indigo-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
              >
                <Grid3x3 size={14} /> Câmera
              </button>
            </div>
          </div>

          {/* MODO 1: PALETA DE TILES / SPRITES */}
          {toolMode === "tile" && (
            <div className="space-y-4 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-neutral-300">Paleta de Sprites</h3>
                  <p className="text-[10px] text-neutral-500">Selecione uma miniatura e carimbe no grid.</p>
                </div>
                <button
                  onClick={rotateCurrentTile}
                  title="Girar sprite selecionado em 90 graus"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-indigo-300 rounded-lg text-xs font-bold transition-all shadow"
                >
                  <RotateCw size={14} /> {tileRotation}°
                </button>
              </div>

              {/* Seletor de Categorias */}
              <div className="flex flex-wrap gap-1">
                {(['all', 'floor', 'wall', 'cover', 'door', 'liquid'] as (TileCategory | 'all')[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setTileCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${tileCategory === cat ? "bg-indigo-600 text-white" : "bg-neutral-800/80 text-neutral-400 hover:text-neutral-200"}`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              {/* Grid de Miniaturas de Sprites */}
              <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1 custom-scrollbar">
                {/* Botão Borracha */}
                <button
                  onClick={() => setSelectedTileId(null)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all aspect-square ${selectedTileId === null ? "border-red-500 bg-red-500/20 ring-2 ring-red-500" : "border-neutral-700 bg-neutral-800/60 hover:bg-neutral-800"}`}
                >
                  <Eraser size={20} className="text-red-400 mb-1" />
                  <span className="text-[10px] font-bold text-neutral-300">Borracha</span>
                </button>

                {filteredTiles.map(tile => {
                  const isSelected = selectedTileId === tile.id;
                  return (
                    <button
                      key={tile.id}
                      onClick={() => setSelectedTileId(tile.id)}
                      title={`${tile.name} — ${tile.description}`}
                      className={`flex flex-col items-center justify-center p-1.5 rounded-xl border text-center transition-all aspect-square relative group ${isSelected ? "border-indigo-500 bg-indigo-600/30 ring-2 ring-indigo-500 shadow-lg" : "border-neutral-700/80 bg-neutral-800/40 hover:border-neutral-500 hover:bg-neutral-800"}`}
                    >
                      <div className="w-9 h-9 rounded overflow-hidden flex items-center justify-center mb-1 bg-black/40">
                        <img
                          src={tile.imagePath}
                          alt={tile.name}
                          className="w-full h-full object-contain"
                          style={{ transform: isSelected ? `rotate(${tileRotation}deg)` : undefined }}
                        />
                      </div>
                      <span className="text-[9px] font-medium text-neutral-300 truncate w-full leading-tight">{tile.name}</span>
                    </button>
                  );
                })}
              </div>

              {selectedTileId && tileLookup.current[selectedTileId] && (
                <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-200">{tileLookup.current[selectedTileId].name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 font-mono text-indigo-300">
                      Cover: {tileLookup.current[selectedTileId].coverType}
                    </span>
                  </div>
                  <p className="text-neutral-400 text-[10px]">{tileLookup.current[selectedTileId].description}</p>
                </div>
              )}

              {/* Botão de Geração Rápida de Layout Urbano */}
              <div className="pt-2 border-t border-neutral-800 flex flex-col gap-2">
                <button
                  onClick={() => {
                    const width = mapInfo?.gridWidth || 40;
                    const height = mapInfo?.gridHeight || 40;
                    const generated = generateUrbanTacticalPreset({
                      gridWidth: width,
                      gridHeight: height,
                    });

                    // Forçar pré-carregamento de imagens dos novos tiles se necessário
                    Object.values(generated.tiles).forEach(t => {
                      if (!t) return;
                      const def = tileLookup.current[t.tileId];
                      if (def && !tileImagesRef.current[t.tileId]) {
                        const img = new Image();
                        img.src = def.imagePath;
                        img.onload = () => {
                          tileImagesRef.current[t.tileId] = img;
                          needsRedraw.current = true;
                        };
                      }
                    });

                    tileDataRef.current = generated.tiles;
                    coverDataRef.current = generated.cover;
                    setTileData({ ...generated.tiles });
                    setCoverData({ ...generated.cover });
                    setValidationError(null);
                    setSavedAt(null);
                    needsRedraw.current = true;
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-indigo-300 border border-indigo-500/30 font-bold py-2 rounded-xl text-xs transition-all shadow active:scale-[0.98]"
                >
                  <Wand2 size={14} className="text-indigo-400" />
                  Gerar Layout Urbano Base
                </button>
              </div>
            </div>
          )}

          {/* MODO 2: ZONAS TÁTICAS E DEPLOY */}
          {toolMode === "cover" && (
            <div className="space-y-3 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-300">Zonas Táticas de Combate</h3>
                <span className="text-[10px] text-neutral-500">Deploy, PVE & Spawns</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {BRUSHES.map(b => {
                  const isActive = brush === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBrush(b.id)}
                      title={b.description}
                      className={`flex items-center gap-2 p-2 rounded-lg border-2 text-xs font-bold transition-all ${isActive ? "ring-2 ring-indigo-400 scale-[1.02]" : "opacity-90 hover:opacity-100"}`}
                      style={{ backgroundColor: b.bg === "transparent" ? "rgba(38,38,38,0.6)" : b.bg, borderColor: b.border }}
                    >
                      <b.Icon size={14} className={b.textColor} />
                      <span className={b.textColor}>{b.short}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">{BRUSHES.find(b => b.id === brush)?.description}</p>
            </div>
          )}

          {/* Grid Settings */}
          <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800 space-y-2.5">
            <h3 className="font-bold text-xs text-neutral-300 uppercase tracking-widest border-b border-neutral-800 pb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Grid3x3 size={13} /> Grid de Combate</span>
              <button
                onClick={resetGridSettings}
                className="text-[10px] flex items-center gap-1 text-neutral-500 hover:text-indigo-300"
              ><RotateCcw size={10} /> Padrão</button>
            </h3>

            <div>
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                <span className="font-bold uppercase tracking-wider">Tamanho da Célula</span>
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
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                <span className="font-bold uppercase tracking-wider">Opacidade do Grid</span>
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

          {/* Status das Zonas de Deploy */}
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 space-y-1.5">
            <h3 className="font-bold text-xs text-neutral-300 uppercase tracking-widest border-b border-neutral-800 pb-1">Validação de Deploy</h3>
            <div className="text-[11px] space-y-1">
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

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/5 bg-black/30 space-y-2">
          <button
            onClick={handleSyncServer}
            disabled={isSyncing || isFetching}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 text-xs"
          >
            {isSyncing ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
            {isSyncing ? "Sincronizando..." : "Sincronizar com Servidor"}
          </button>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSave}
              className="flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold py-1.5 rounded-lg transition-colors border border-neutral-700 text-[11px]"
            >Baixar Mapa</button>
            <input type="file" accept=".json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImport} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold py-1.5 rounded-lg transition-colors border border-neutral-700 text-[11px]"
            >Carregar Mapa</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyClipboard}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border ${copied ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"}`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copiado!" : "Copiar JSON"}
            </button>
            <button
              onClick={handlePasteClipboard}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border ${pasted ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"}`}
            >
              {pasted ? <Check size={13} /> : <ClipboardPaste size={13} />}
              {pasted ? "Colado!" : "Colar JSON"}
            </button>
          </div>
        </div>
      </div>

      {/* Map Area Canvas */}
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
