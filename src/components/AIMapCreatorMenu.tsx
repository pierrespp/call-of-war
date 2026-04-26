import React, { useState, useRef, useEffect, useCallback } from "react";
import { compressBase64Image } from "../lib/utils";
import { CELL_SIZE } from "../data/constants";
import { CoverType, MapCoverData, AIMapGenerationResult } from "../types/game";
import { buildMapGenerationPrompt } from "../data/geminiPrompts";
import {
  aiMapService,
} from "../services/aiMapService";
import type { AIMapSaveRequest, AIMapDraft } from "../services/aiMapService";
import {
  Shield,
  ShieldAlert,
  ArrowLeft,
  Sparkles,
  Eraser,
  Square,
  Droplet,
  Flag,
  Grid3x3,
  Trash2,
  Loader2,
  RefreshCw,
  Save,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  AppWindow,
} from "lucide-react";

// NOTE: This component has been modified to remove AI generation features.
// It now functions as a manual map editor and legend painter.

interface BrushOption {
  id: CoverType;
  label: string;
  short: string;
  bg: string;
  border: string;
  textColor: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
  /** Solid colour used when rendering the legend image sent to Gemini. */
  legendColor: string;
}

const BRUSHES: BrushOption[] = [
  { id: "none",    label: "Vazio",           short: "Vazio",   bg: "transparent",            border: "rgba(115,115,115,0.4)", textColor: "text-neutral-300", Icon: Eraser,      description: "Apaga marcação da célula.",                          legendColor: "#ffffff" },
  { id: "half",    label: "Meia Cobertura",  short: "Meia",    bg: "rgba(234,179,8,0.25)",   border: "rgba(234,179,8,0.7)",   textColor: "text-yellow-200",  Icon: Shield,      description: "Paredes baixas, carros (-20% de hit).",              legendColor: "#f5c518" },
  { id: "full",    label: "Cobertura Total", short: "Total",   bg: "rgba(239,68,68,0.25)",   border: "rgba(239,68,68,0.7)",   textColor: "text-red-200",     Icon: ShieldAlert, description: "Paredão, blindado (-40% de hit).",                   legendColor: "#dc2626" },
  { id: "wall",    label: "Parede",          short: "Parede",  bg: "rgba(64,64,64,0.7)",     border: "rgba(115,115,115,0.9)", textColor: "text-neutral-200", Icon: Square,      description: "Bloqueia tiros e movimento.",                        legendColor: "#3a3a3a" },
  { id: "deployA", label: "Deploy Equipe A", short: "Deploy A",bg: "rgba(96,165,250,0.30)",  border: "rgba(96,165,250,0.8)",  textColor: "text-blue-200",    Icon: Flag,        description: "Zona azul — Equipe A (9 células contíguas).",        legendColor: "#16a34a" },
  { id: "deployB", label: "Deploy Equipe B", short: "Deploy B",bg: "rgba(252,165,165,0.40)", border: "rgba(252,165,165,0.9)", textColor: "text-red-200",     Icon: Flag,        description: "Zona vermelha — Equipe B (9 células contíguas).",    legendColor: "#ea580c" },
  { id: "water",   label: "Água",            short: "Água",    bg: "rgba(30,64,175,0.5)",    border: "rgba(30,64,175,0.9)",   textColor: "text-blue-100",    Icon: Droplet,     description: "Lentos rios e lagos.",                                legendColor: "#1d4ed8" },
  { id: "doorClose", label: "Porta Fechada", short: "Porta F", bg: "rgba(139,69,19,0.5)",    border: "rgba(139,69,19,0.9)",   textColor: "text-amber-700",   Icon: DoorClosed,  description: "Porta fechada (cobertura total, pode ser aberta).",  legendColor: "#8b4513" },
  { id: "doorOpen",  label: "Porta Aberta",  short: "Porta A", bg: "rgba(210,180,140,0.5)",  border: "rgba(210,180,140,0.9)", textColor: "text-amber-500",   Icon: DoorOpen,    description: "Porta aberta (caminho livre normal).",               legendColor: "#d2b48c" },
  { id: "window",    label: "Janela",        short: "Janela",  bg: "rgba(0,255,255,0.3)",    border: "rgba(0,255,255,0.8)",   textColor: "text-cyan-300",    Icon: AppWindow,   description: "Janela (cobertura meia, custo /2 mov).",             legendColor: "#00ffff" },
];

type ToolMode = "draw" | "pan";

const GRID_SIZE_OPTIONS = [30, 40, 50] as const;
const LEGEND_CELL_PX = 50;

/** Build a PNG image of the painted legend, base64-encoded with data-URI prefix. */
function buildLegendImage(
  coverData: MapCoverData,
  gridWidth: number,
  gridHeight: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth * LEGEND_CELL_PX;
  canvas.height = gridHeight * LEGEND_CELL_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não disponível neste navegador.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [key, type] of Object.entries(coverData)) {
    if (!type || type === "none") continue;
    const def = BRUSHES.find((b) => b.id === type);
    if (!def) continue;
    const [gx, gy] = key.split(",").map(Number);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    ctx.fillStyle = def.legendColor;
    ctx.fillRect(gx * LEGEND_CELL_PX, gy * LEGEND_CELL_PX, LEGEND_CELL_PX, LEGEND_CELL_PX);
  }
  return canvas.toDataURL("image/png");
}

export function AIMapCreatorMenu({ onBack }: { onBack: () => void }) {
  const [gridWidth, setGridWidth] = useState<number>(40);
  const [gridHeight, setGridHeight] = useState<number>(40);
  const [coverData, setCoverData] = useState<MapCoverData>({});
  const [brush, setBrush] = useState<CoverType>("half");
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const [userPrompt, setUserPrompt] = useState<string>("");

  const [zoom, setZoom] = useState(0.4);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [generationResult, setGenerationResult] =
    useState<AIMapGenerationResult | null>(null);
  const [showCoverOverlay, setShowCoverOverlay] = useState(true);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMapName, setSaveMapName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMapId, setSavedMapId] = useState<string | null>(null);

  const [showSaveDraftDialog, setShowSaveDraftDialog] = useState(false);
  const [showLoadDraftDialog, setShowLoadDraftDialog] = useState(false);
  const [draftName, setDraftName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const cellSize = CELL_SIZE;
  const canvasW = gridWidth * cellSize;
  const canvasH = gridHeight * cellSize;
  const paintedCount = Object.values(coverData).filter(
    (v) => v && v !== "none",
  ).length;

  const setGridSize = (size: number) => {
    setGridWidth(size);
    setGridHeight(size);
    setCoverData({});
    setCamera({ x: 0, y: 0 });
  };

  const clearCanvas = () => {
    if (paintedCount === 0) return;
    if (
      window.confirm(
        "Tem certeza que quer apagar toda a legenda pintada? Essa ação não pode ser desfeita.",
      )
    ) {
      setCoverData({});
    }
  };

  const paintCell = (e: React.MouseEvent) => {
    if (toolMode !== "draw" || isPanning) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;
    const gridX = Math.floor(rawX / cellSize);
    const gridY = Math.floor(rawY / cellSize);
    if (gridX < 0 || gridY < 0 || gridX >= gridWidth || gridY >= gridHeight)
      return;

    const cellKey = `${gridX},${gridY}`;
    setCoverData((prev) => {
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

  const handleCloseModal = () => {
    setGenerationResult(null);
  };

  const handleSaveMap = () => {
    setSaveMapName("");
    setSaveError(null);
    setSavedMapId(null);
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    if (!generationResult || !saveMapName.trim()) return;
    setIsSaving(true);
    setSaveError(null);

    const dataUri = `data:${generationResult.mimeType};base64,${generationResult.generatedImage}`;
    let finalImage = dataUri;
    try {
      finalImage = await compressBase64Image(dataUri, 2048, 0.8);
    } catch (ce) {
      console.warn("Falha ao comprimir mapa gerado:", ce);
    }

    const request: AIMapSaveRequest = {
      name: saveMapName.trim(),
      imageBase64: finalImage.split(",")[1], // Send only the base64 part
      mimeType: "image/jpeg",
      coverData: generationResult.detectedCover,
      gridWidth,
      gridHeight,
    };
    try {
      // The result is not actually used, but we keep the stub call commented out
      // to show where a real save implementation would go.
      // const result = await aiMapService.save(request);
      console.log("aiMapService.save stub was called, but is disabled.");
      // Fake a successful save for the UI
      setSavedMapId(Date.now().toString()); 
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erro desconhecido ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseSaveDialog = () => {
    setShowSaveDialog(false);
    setSaveError(null);
    setSavedMapId(null);
  };

  const handleBackToMenuAfterSave = () => {
    setShowSaveDialog(false);
    setGenerationResult(null);
    onBack();
  };

  const handleConfirmSaveDraft = async () => {
    if (!draftName.trim() || paintedCount === 0) return;
    try {
      await aiMapService.saveDraft({
        name: draftName.trim(),
        gridWidth,
        gridHeight,
        coverData,
        userPrompt: "", // User prompt is removed
      });
      alert("Rascunho salvo com sucesso!");
      setShowSaveDraftDialog(false);
    } catch (e) {
      alert("Erro ao salvar rascunho: " + (e instanceof Error ? e.message : "desconhecido"));
    }
  };

  const handleExternalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      const [prefix, base64] = dataUri.split(',');
      const mime = prefix.split(':')[1].split(';')[0];
      
      setGenerationResult({
        generatedImage: base64,
        mimeType: mime,
        detectedCover: coverData,
      });
      setShowCoverOverlay(true);
    };
    reader.readAsDataURL(file);
    
    e.target.value = "";
  };

  const canvasCursor = toolMode === "draw" ? "cursor-crosshair" : "cursor-move";
  const gridLineWidth = Math.max(1, 2 / zoom);

  return (
    <div className="flex bg-neutral-900 h-screen w-full text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-96 bg-neutral-800 border-r border-neutral-700 flex flex-col shadow-2xl z-10">
        <div className="p-6 border-b border-neutral-700">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={16} /> Voltar ao Menu
          </button>
          <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
            <Sparkles size={22} className="text-indigo-400" /> Editor de Mapa
          </h2>
          <p className="text-neutral-500 text-sm">
            Pinte o layout do terreno e exporte para usar em seu jogo.
          </p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Grid size selector */}
          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider flex items-center gap-2">
              <Grid3x3 size={14} /> Tamanho do Grid
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GRID_SIZE_OPTIONS.map((size) => {
                const active = gridWidth === size;
                return (
                  <button
                    key={size}
                    onClick={() => setGridSize(size)}
                    className={`py-2 rounded font-bold text-xs transition-colors border ${active ? "bg-indigo-600 border-indigo-500 text-white" : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
                  >
                    {size}×{size}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Trocar o tamanho apaga a legenda atual.
            </p>
          </div>

          {/* Tool mode */}
          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">
              Ferramenta
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setToolMode("draw")}
                className={`py-2 rounded font-bold text-xs transition-colors border ${toolMode === "draw" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
              >
                Pintar
              </button>
              <button
                onClick={() => setToolMode("pan")}
                className={`py-2 rounded font-bold text-xs transition-colors border ${toolMode === "pan" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"}`}
              >
                Câmera
              </button>
            </div>
          </div>

          {/* Brushes */}
          {toolMode === "draw" && (
            <div>
              <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">
                Pincel
              </label>
              <div className="grid grid-cols-2 gap-2">
                {BRUSHES.map((b) => {
                  const isActive = brush === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBrush(b.id)}
                      title={b.description}
                      className={`flex items-center gap-2 p-2 rounded border-2 text-xs font-bold transition-all ${isActive ? "ring-2 ring-indigo-400 scale-[1.02]" : "opacity-90 hover:opacity-100"}`}
                      style={{
                        backgroundColor:
                          b.bg === "transparent" ? "rgba(38,38,38,0.6)" : b.bg,
                        borderColor: b.border,
                      }}
                    >
                      <b.Icon size={14} className={b.textColor} />
                      <span className={b.textColor}>{b.short}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-500 mt-2">
                {BRUSHES.find((b) => b.id === brush)?.description}
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">
                Clique e arraste pra pintar várias células.
              </p>
            </div>
          )}

          {/* Painted summary + clear */}
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-700 space-y-2">
            <h3 className="font-bold text-sm text-neutral-300 uppercase tracking-widest border-b border-neutral-800 pb-2 mb-2 flex items-center justify-between">
              <span>Legenda</span>
              <button
                onClick={clearCanvas}
                disabled={paintedCount === 0}
                className="text-[10px] flex items-center gap-1 text-neutral-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-neutral-500"
                title="Apagar tudo"
              >
                <Trash2 size={11} /> Limpar
              </button>
            </h3>
            <div className="text-xs flex justify-between">
              <span className="text-neutral-400">Células pintadas:</span>
              <span className="font-mono text-neutral-200">{paintedCount}</span>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-700 bg-neutral-800">
          <button
            onClick={() => {
              const legendImage = buildLegendImage(coverData, gridWidth, gridHeight);
              const generatedPrompt = buildMapGenerationPrompt({ gridWidth, gridHeight, userTheme: userPrompt });
              const promptFileContent = `=== INSTRUÇÕES PARA GERAÇÃO MANUAL DE MAPA ===\n\n1. Use uma ferramenta de IA generativa (Midjourney, etc.) com a funcionalidade Image-to-Image.\n2. Use a imagem 'legend.png' como a imagem de base.\n3. Use o prompt de texto abaixo para guiar a IA.\n\n=== PROMPT DE GERAÇÃO ===\n\n${generatedPrompt}`;
              
              const blobTxt = new Blob([promptFileContent], { type: "text/plain" });
              const urlTxt = URL.createObjectURL(blobTxt);
              const aTxt = document.createElement("a");
              aTxt.href = urlTxt;
              aTxt.download = "map_prompt.txt";
              aTxt.click();
              URL.revokeObjectURL(urlTxt);

              const aImg = document.createElement("a");
              aImg.href = legendImage;
              aImg.download = "legend.png";
              aImg.click();
            }}
            disabled={paintedCount === 0}
            className="w-full flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors mt-2"
          >
            Exportar P/ Geração Manual
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => {
                setDraftName("");
                setShowSaveDraftDialog(true);
              }}
              disabled={paintedCount === 0}
              className="w-full text-xs flex items-center justify-center gap-1 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-200 font-bold py-2 rounded transition-colors"
            >
              <Save size={14} /> Salvar Rascunho
            </button>
            <button
              onClick={() => setShowLoadDraftDialog(true)}
              className="w-full text-xs flex items-center justify-center gap-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-bold py-2 rounded transition-colors"
            >
              <RefreshCw size={14} /> Carregar Rascunho
            </button>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={paintedCount === 0}
            className="w-full text-xs flex items-center justify-center gap-2 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 font-bold py-2 rounded border border-indigo-700/50 transition-colors mt-2 disabled:opacity-40"
          >
             Importar Mapa Gerado Externamente
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleExternalImageUpload}
          />
          {paintedCount === 0 && (
            <p className="text-[11px] text-neutral-500 text-center mt-2">
              Pinte ao menos uma célula para habilitar as ações.
            </p>
          )}
        </div>
      </div>

      {/* Canvas area */}
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
            setCamera((prev) => ({
              x: prev.x - e.movementX / zoom,
              y: prev.y - e.movementY / zoom,
            }));
          }
        }}
        onMouseUp={() => {
          setIsPanning(false);
          setIsDragging(false);
        }}
        onMouseLeave={() => {
          setIsPanning(false);
          setIsDragging(false);
        }}
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
            backgroundColor: "#ffffff",
          }}
        >
          {/* Grid lines */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.18) ${gridLineWidth}px, transparent ${gridLineWidth}px), linear-gradient(to bottom, rgba(0,0,0,0.18) ${gridLineWidth}px, transparent ${gridLineWidth}px)`,
              backgroundSize: `${cellSize}px ${cellSize}px`,
            }}
          />

          {/* Painted cells */}
          {Object.entries(coverData).map(([key, type]) => {
            if (!type || type === "none") return null;
            const [gx, gy] = key.split(",").map(Number);
            const def = BRUSHES.find((b) => b.id === type);
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
                  backgroundColor:
                    def.bg === "transparent" ? "rgba(0,0,0,0.05)" : def.bg,
                }}
              >
                <def.Icon size={cellSize * 0.45} className={def.textColor} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview modal for imported external images */}
      {generationResult && (
        <GenerationPreviewModal
          result={generationResult}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          showOverlay={showCoverOverlay}
          onToggleOverlay={() => setShowCoverOverlay((v) => !v)}
          onClose={handleCloseModal}
          onSave={handleSaveMap}
        />
      )}
      
      {/* Save map dialog */}
      {showSaveDialog && (
        <SaveMapDialog
          mapName={saveMapName}
          onChangeName={setSaveMapName}
          isSaving={isSaving}
          error={saveError}
          savedMapId={savedMapId}
          onConfirm={handleConfirmSave}
          onCancel={handleCloseSaveDialog}
          onBackToMenu={handleBackToMenuAfterSave}
        />
      )}

      {showSaveDraftDialog && (
        <div className="absolute inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">Salvar Rascunho da Legenda</h3>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Nome do rascunho"
              autoFocus
              className="w-full bg-neutral-900 border border-neutral-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <div className="flex gap-3 mt-2">
               <button onClick={() => setShowSaveDraftDialog(false)} className="flex-1 py-2 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-700 font-bold">Cancelar</button>
               <button onClick={handleConfirmSaveDraft} disabled={!draftName.trim()} className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showLoadDraftDialog && (
        <LoadDraftDialog
          onCancel={() => setShowLoadDraftDialog(false)}
          onLoad={(draft: AIMapDraft) => {
             setGridWidth(draft.gridWidth);
             setGridHeight(draft.gridHeight);
             setCoverData(draft.coverData);
             if (draft.userPrompt) setUserPrompt(draft.userPrompt);
             setShowLoadDraftDialog(false);
          }}
        />
      )}
    </div>
  );
}

interface PreviewProps {
  result: AIMapGenerationResult;
  gridWidth: number;
  gridHeight: number;
  showOverlay: boolean;
  onToggleOverlay: () => void;
  onClose: () => void;
  onSave: () => void;
}

function GenerationPreviewModal({
  result,
  gridWidth,
  gridHeight,
  showOverlay,
  onToggleOverlay,
  onClose,
  onSave,
}: PreviewProps) {
  const dataUri = `data:${result.mimeType};base64,${result.generatedImage}`;

  return (
    <div
      className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <div>
            <h3 className="text-lg font-black flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-400" /> Pré-visualização do Mapa
            </h3>
             <p className="text-xs text-neutral-400">
              Verifique se a legenda está alinhada com a imagem importada.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 rounded hover:bg-neutral-700 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950">
          <PreviewCanvas
            imageDataUri={dataUri}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            cover={result.detectedCover}
            showOverlay={showOverlay}
          />
        </div>

        <div className="p-4 border-t border-neutral-700 bg-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onToggleOverlay}
            className="flex items-center gap-2 px-3 py-2 rounded text-xs font-bold bg-neutral-900 border border-neutral-700 hover:bg-neutral-700 text-neutral-200"
          >
            {showOverlay ? <EyeOff size={14} /> : <Eye size={14} />}
            {showOverlay ? "Ocultar Legenda" : "Mostrar Legenda"}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onSave}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Save size={14} /> Salvar Mapa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PreviewCanvasProps {
  imageDataUri: string;
  gridWidth: number;
  gridHeight: number;
  cover: MapCoverData;
  showOverlay: boolean;
}

function PreviewCanvas({
  imageDataUri,
  gridWidth,
  gridHeight,
  cover,
  showOverlay,
}: PreviewCanvasProps) {
  const display = Math.min(720, Math.floor(640 / Math.max(gridWidth, gridHeight)) * Math.max(gridWidth, gridHeight));
  const cellPx = display / Math.max(gridWidth, gridHeight);
  return (
    <div
      className="relative shadow-xl"
      style={{ width: gridWidth * cellPx, height: gridHeight * cellPx }}
    >
      <img
        src={imageDataUri}
        alt="Mapa importado"
        className="absolute inset-0 w-full h-full object-cover rounded"
      />
      {showOverlay && (
        <>
          <div
            className="absolute inset-0 pointer-events-none rounded"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)`,
              backgroundSize: `${cellPx}px ${cellPx}px`,
            }}
          />
          {Object.entries(cover).map(([key, type]) => {
            if (!type || type === "none") return null;
            const [gx, gy] = key.split(",").map(Number);
            const def = BRUSHES.find((b) => b.id === type);
            if (!def) return null;
            return (
              <div
                key={key}
                className="absolute pointer-events-none border flex items-center justify-center"
                style={{
                  left: gx * cellPx,
                  top: gy * cellPx,
                  width: cellPx,
                  height: cellPx,
                  borderColor: def.border,
                  backgroundColor:
                    def.bg === "transparent" ? "rgba(0,0,0,0.0)" : def.bg,
                }}
              >
                {cellPx >= 18 && (
                  <def.Icon size={cellPx * 0.5} className={def.textColor} />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

interface SaveMapDialogProps {
  mapName: string;
  onChangeName: (name: string) => void;
  isSaving: boolean;
  error: string | null;
  savedMapId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onBackToMenu: () => void;
}

function SaveMapDialog({
  mapName,
  onChangeName,
  isSaving,
  error,
  savedMapId,
  onConfirm,
  onCancel,
  onBackToMenu,
}: SaveMapDialogProps) {
  return (
    <div className="absolute inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div
        className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {savedMapId ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center py-2">
              <CheckCircle2 size={48} className="text-green-400" />
              <h3 className="text-xl font-black text-white">Mapa salvo!</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                <span className="text-white font-semibold">"{mapName}"</span> foi salvo com
                sucesso e já está disponível no seletor de mapas ao criar uma partida.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-700 transition-colors text-sm font-bold"
              >
                Fechar
              </button>
              <button
                onClick={onBackToMenu}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
              >
                Voltar ao Menu
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
                <Save size={18} className="text-indigo-400" /> Salvar Mapa
              </h3>
              <p className="text-neutral-400 text-sm">
                Dê um nome para identificar este mapa no seletor de partidas.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={mapName}
                onChange={(e) => onChangeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSaving && mapName.trim()) onConfirm();
                }}
                placeholder="Ex: Deserto Tático, Base Urbana…"
                maxLength={50}
                autoFocus
                className="w-full bg-neutral-900 border border-neutral-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <div className="flex items-center justify-between">
                {error ? (
                  <p className="text-red-400 text-xs">{error}</p>
                ) : (
                  <span />
                )}
                <span className="text-neutral-500 text-xs ml-auto">{mapName.length}/50</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-700 disabled:opacity-40 transition-colors text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                disabled={isSaving || !mapName.trim()}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Salvando…
                  </>
                ) : (
                  <>
                    <Save size={14} /> Salvar Mapa
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface LoadDraftDialogProps {
  onCancel: () => void;
  onLoad: (draft: AIMapDraft) => void;
}

function LoadDraftDialog({ onCancel, onLoad }: LoadDraftDialogProps) {
  const [drafts, setDrafts] = useState<AIMapDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aiMapService.listDrafts().then(d => {
      setDrafts(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="absolute inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4 max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-white flex items-center gap-2">
          Carregar Rascunho
        </h3>
        {loading ? (
          <p className="text-neutral-400">Carregando...</p>
        ) : drafts.length === 0 ? (
          <p className="text-neutral-400">Nenhum rascunho encontrado.</p>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto pr-2">
            {drafts.map(d => (
              <button
                key={d.id}
                onClick={() => onLoad(d)}
                className="text-left bg-neutral-900 border border-neutral-700 p-3 rounded hover:bg-neutral-700 hover:border-indigo-500 transition-colors"
              >
                <div className="font-bold text-white">{d.name}</div>
                <div className="text-xs text-neutral-500">{d.gridWidth}x{d.gridHeight} • {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ""}</div>
              </button>
            ))}
          </div>
        )}
        <button onClick={onCancel} className="mt-2 py-2 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-700 font-bold transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}
