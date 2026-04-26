import React, { useState, useEffect, useRef } from "react";
import { GameMap, CELL_SIZE, MapGridSettings, DEFAULT_GRID_SETTINGS, MAPS } from "../data/constants";
import { useMaps } from "../contexts/MapContext";
import { CoverType, MapCoverData } from "../types/game";
import { validateDeployZones } from "../utils/pathfinding";
import { getImageUrl } from "../lib/utils";
import { Shield, ShieldAlert, ArrowLeft, Save, Eraser, Square, Droplet, Flag, Grid3x3, RotateCcw, DoorClosed, DoorOpen, AppWindow } from "lucide-react";
import { useImages } from "../contexts/ImageContext";

// NOTE: This component has been modified to work without a backend. 
// It loads map data statically and does not save cover/grid settings to any server.

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
];

type ToolMode = "draw" | "pan";

export function MapEditorMenu({ onBack }: { onBack: () => void }) {
  const { getMapImage } = useImages();
  const { maps } = useMaps();
  const [selectedMap, setSelectedMap] = useState(Object.keys(MAPS)[0] || "cidade_ruinas");
  const [coverData, setCoverData] = useState<MapCoverData>({});
  const [zoom, setZoom] = useState(0.4);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // This will just be a visual flicker now
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const [brush, setBrush] = useState<CoverType>("half");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [gridSettings, setGridSettings] = useState<MapGridSettings>(DEFAULT_GRID_SETTINGS);

  const canvasRef = useRef<HTMLDivElement>(null);

  // When map changes, reset the cover data and grid settings to default.
  useEffect(() => {
    setCoverData({});
    setGridSettings(DEFAULT_GRID_SETTINGS);
  }, [selectedMap]);

  const mapInfo = maps[selectedMap];
  if (!mapInfo) {
    return <div>Mapa não encontrado!</div>;
  }

  const cellSize = gridSettings.cellSize;
  const mapW = mapInfo.gridWidth * CELL_SIZE;
  const mapH = mapInfo.gridHeight * CELL_SIZE;
  const gridW = mapInfo.gridWidth * cellSize;
  const gridH = mapInfo.gridHeight * cellSize;
  const canvasW = Math.max(mapW, gridW);
  const canvasH = Math.max(mapH, gridH);

  const updateGrid = (patch: Partial<MapGridSettings>) => {
    setGridSettings(prev => ({ ...prev, ...patch }));
  };

  const resetGridSettings = () => {
    setGridSettings(DEFAULT_GRID_SETTINGS);
  };

  const paintCell = (e: React.MouseEvent) => {
    if (toolMode !== "draw" || isPanning) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;
    const gridX = Math.floor(rawX / cellSize);
    const gridY = Math.floor(rawY / cellSize);
    if (gridX < 0 || gridY < 0 || gridX >= mapInfo.gridWidth || gridY >= mapInfo.gridHeight) return;

    const cellKey = `${gridX},${gridY}`;
    setCoverData(prev => {
      const cur = prev[cellKey] || "none";
      if (cur === brush) return prev;
      const next = { ...prev };
      if (brush === "none") delete next[cellKey];
      else next[cellKey] = brush;
      return next;
    });
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.button === 0 && toolMode === "draw") {
      setIsDragging(true);
      paintCell(e);
    }
  };
  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (isDragging && toolMode === "draw") paintCell(e);
  };

  const handleSave = () => {
    const v = validateDeployZones(coverData);
    if (!v.ok) {
      setValidationError(v.errors.join("\n"));
      setSavedAt(null);
      return;
    }
    
    // SIMULATE saving locally. In a real app, this would be an API call.
    setValidationError(null);
    setIsSaving(true);
    console.log("Simulating save with current cover data:", coverData);

    // Create a downloadable file with the cover data.
    const blob = new Blob([JSON.stringify(coverData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedMap}_cover.json`;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      setIsSaving(false);
      setSavedAt(Date.now());
    }, 500); // Simulate network latency
  };

  const validation = validateDeployZones(coverData);
  const canvasCursor = toolMode === "draw" ? "cursor-crosshair" : "cursor-move";
  const gridLineWidth = Math.max(1, 2 / zoom);

  return (
    <div className="flex bg-neutral-900 h-screen w-full text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-96 bg-neutral-800 border-r border-neutral-700 flex flex-col shadow-2xl z-10">
        <div className="p-6 border-b border-neutral-700">
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-6">
            <ArrowLeft size={16} /> Voltar ao Menu
          </button>
          <h2 className="text-2xl font-black mb-2">Editor de Mapa</h2>
          <p className="text-neutral-500 text-sm">Pinte coberturas, paredes, água e zonas de deploy para os mapas existentes.</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">Mapa</label>
            <select
              className="w-full bg-neutral-900 border border-neutral-600 text-white rounded p-3 focus:outline-none focus:border-indigo-500"
              value={selectedMap}
              onChange={(e) => { setSelectedMap(e.target.value); setCamera({ x: 0, y: 0 }); setValidationError(null); setSavedAt(null); }}
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
                title="Restaurar padrões"
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
            <p className="text-[11px] text-neutral-500 pt-1">Cada zona deve ter exatamente 9 células contíguas.</p>
          </div>

          {validationError && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-xs text-red-200 whitespace-pre-line">
              {validationError}
            </div>
          )}
          {savedAt && !validationError && (
            <div className="bg-emerald-900/50 border border-emerald-700 rounded-lg p-3 text-xs text-emerald-200">
              Arquivo de cobertura (`{selectedMap}_cover.json`) baixado!
            </div>
          )}
        </div>

        <div className="p-6 border-t border-neutral-700 bg-neutral-800">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            <Save size={18} /> {isSaving ? "Salvando..." : "Baixar Arquivo de Cobertura"}
          </button>
           <p className="text-[11px] text-neutral-500 mt-2 text-center">Salva as informações de cobertura em um arquivo JSON local.</p>
        </div>
      </div>

      {/* Map area */}
      <div
        className={`flex-1 relative bg-neutral-900 overflow-hidden ${canvasCursor}`}
        onWheel={(e) => {
          const zoomFactor = 1.08;
          const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
          setZoom(Math.min(Math.max(0.05, newZoom), 8));
        }}
        onMouseDown={(e) => {
          if (toolMode === "pan" && e.button === 0) setIsPanning(true);
          if (e.button === 1 || e.button === 2) setIsPanning(true);
        }}
        onMouseMove={(e) => {
          if (isPanning) {
            setCamera(prev => ({ x: prev.x - e.movementX / zoom, y: prev.y - e.movementY / zoom }));
          }
        }}
        onMouseUp={() => { setIsPanning(false); setIsDragging(false); }}
        onMouseLeave={() => { setIsPanning(false); setIsDragging(false); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={canvasRef}
          onMouseDown={handleMouseDownCanvas}
          onMouseMove={handleMouseMoveCanvas}
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            transformOrigin: "0 0",
            transform: `scale(${zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
            width: canvasW,
            height: canvasH,
            backgroundColor: "#1a1a1a",
          }}
        >
          <img
            src={getImageUrl(mapInfo.imagePath)}
            alt={`Map ${selectedMap}`}
            className="absolute pointer-events-none"
            style={{
              left: 0,
              top: 0,
              width: mapW,
              height: mapH,
              objectFit: "cover",
              objectPosition: "0 0",
            }}
          />

          {zoom > 0.15 && gridSettings.opacity > 0 && (
            <div
              className="absolute pointer-events-none z-10 mix-blend-overlay"
              style={{
                left: 0,
                top: 0,
                width: gridW,
                height: gridH,
                opacity: gridSettings.opacity,
                backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.85) ${gridLineWidth}px, transparent ${gridLineWidth}px), linear-gradient(to bottom, rgba(255,255,255,0.85) ${gridLineWidth}px, transparent ${gridLineWidth}px)`,
                backgroundSize: `${cellSize}px ${cellSize}px`,
              }}
            />
          )}

          {Object.entries(coverData).map(([key, type]) => {
            if (!type || type === "none") return null;
            const [gx, gy] = key.split(",").map(Number);
            const def = BRUSHES.find(b => b.id === type);
            if (!def) return null;
            return (
              <div
                key={key}
                className="absolute pointer-events-none border-2 flex items-center justify-center z-20"
                style={{
                  left: gx * cellSize,
                  top: gy * cellSize,
                  width: cellSize,
                  height: cellSize,
                  borderColor: def.border,
                  backgroundColor: def.bg,
                }}
              >
                <def.Icon size={cellSize * 0.45} className={def.textColor} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
