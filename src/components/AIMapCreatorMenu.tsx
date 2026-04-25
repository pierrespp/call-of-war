import React, { useState, useRef, useEffect, useCallback } from "react";
import { CELL_SIZE } from "../data/constants";
import { CoverType, MapCoverData, AIMapGenerationResult } from "../types/game";
import {
  aiMapService,
  AIMapRateLimitError,
} from "../services/aiMapService";
import type { AIMapSaveRequest } from "../services/aiMapService";
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

/**
 * AI Map Creator — generates a tactical map from a painted legend.
 *
 * Flow:
 *   1. User paints the legend on a blank grid (walls / covers / water /
 *      deploy zones).
 *   2. We rasterise that legend to a PNG using the SAME colour palette the
 *      Gemini prompt describes, then POST it to `/api/ai-maps/generate`.
 *   3. The server returns the generated image + cover detected per cell.
 *   4. A modal shows the preview with a toggleable cover overlay so the user
 *      can decide whether to keep it (Etapa 8: save) or generate again.
 */

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

// The legendColor values match the colour names used in the Gemini prompt
// (`buildLegendPrompt` in geminiService.ts) so the AI interprets each region
// correctly: cinza/vermelho/amarelo/azul/verde/laranja/branco.
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
const RATE_LIMIT_MAX = 8;
const STATUS_POLL_MS = 5_000;
/** Pixel size of each cell in the offscreen legend canvas sent to Gemini. */
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
  // Background = empty floor.
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
  const [mapGenModel, setMapGenModel] = useState<string>("gemini-3.1-flash-image-preview");

  const [zoom, setZoom] = useState(0.4);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [rateLimitUsed, setRateLimitUsed] = useState<number>(0);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number>(0);
  const [isConfigured, setIsConfigured] = useState<boolean>(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<number>(0);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState<number>(0);
  const [generationResult, setGenerationResult] =
    useState<AIMapGenerationResult | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showCoverOverlay, setShowCoverOverlay] = useState(true);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMapName, setSaveMapName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMapId, setSavedMapId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const cellSize = CELL_SIZE;
  const canvasW = gridWidth * cellSize;
  const canvasH = gridHeight * cellSize;
  const paintedCount = Object.values(coverData).filter(
    (v) => v && v !== "none",
  ).length;
  const canGenerate =
    paintedCount > 0 && !isGenerating && retryAfterSeconds === 0 && isConfigured;

  // Poll rate-limit status every few seconds so the counter stays fresh even
  // if other users (none today, but future-proof) consume slots.
  const refreshStatus = useCallback(async () => {
    try {
      const status = await aiMapService.getStatus();
      setRateLimitUsed(status.used);
      setRetryAfterSeconds(status.retryAfterSeconds);
      setIsConfigured(status.configured);
    } catch {
      // Network blip — keep the previous counter, don't spam errors.
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // Timer for generation progress feedback
  useEffect(() => {
    if (!isGenerating) return;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - generationStartTime) / 1000);
      setGenerationElapsedSeconds(elapsed);
    }, 1000);
    return () => clearInterval(id);
  }, [isGenerating, generationStartTime]);

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

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerationError(null);
    setGenerationResult(null);
    setIsGenerating(true);
    setGenerationStartTime(Date.now());
    setGenerationElapsedSeconds(0);
    try {
      const legendImage = buildLegendImage(coverData, gridWidth, gridHeight);
      const result = await aiMapService.generate({
        legendImage,
        userPrompt,
        gridWidth,
        gridHeight,
        mapGenModel,
      });
      setGenerationResult(result);
      setShowCoverOverlay(true);
    } catch (err) {
      if (err instanceof AIMapRateLimitError) {
        setGenerationError(
          `Limite de requisições atingido. Aguarde ${err.retryAfterSeconds} segundos antes de tentar novamente.`,
        );
        setRetryAfterSeconds(err.retryAfterSeconds);
      } else if (err instanceof Error) {
        // More detailed error messages
        if (err.message.includes("network") || err.message.includes("fetch")) {
          setGenerationError("Erro de conexão. Verifique sua internet e tente novamente.");
        } else if (err.message.includes("timeout")) {
          setGenerationError("A geração demorou muito. Tente simplificar a legenda ou tente novamente.");
        } else if (err.message.includes("não retornou uma imagem")) {
          setGenerationError("O Gemini não conseguiu gerar uma imagem. Tente ajustar a legenda ou o tema.");
        } else {
          setGenerationError(`Erro: ${err.message}`);
        }
      } else {
        setGenerationError("Falha desconhecida ao gerar o mapa. Tente novamente.");
      }
    } finally {
      setIsGenerating(false);
      // Always refresh the counter so the "X/8" reflects this attempt.
      refreshStatus();
    }
  };

  const handleCloseModal = () => {
    setGenerationResult(null);
    setGenerationError(null);
  };

  const handleRegenerate = () => {
    setGenerationResult(null);
    setGenerationError(null);
    // Tiny delay so the modal closes before the loading state appears.
    setTimeout(() => handleGenerate(), 50);
  };

  const handleSaveDraft = () => {
    setSaveMapName("");
    setSaveError(null);
    setSavedMapId(null);
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    if (!generationResult || !saveMapName.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    const request: AIMapSaveRequest = {
      name: saveMapName.trim(),
      imageBase64: generationResult.generatedImage,
      mimeType: generationResult.mimeType,
      coverData: generationResult.detectedCover,
      gridWidth,
      gridHeight,
    };
    try {
      const result = await aiMapService.save(request);
      setSavedMapId(result.mapId);
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
            <Sparkles size={22} className="text-indigo-400" /> Gerador de Mapa
          </h2>
          <p className="text-neutral-500 text-sm">
            Pinte a legenda do terreno, escreva o tema e deixe a IA gerar uma
            imagem realista do mapa.
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

          {/* Prompt */}
          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">
              Tema do Mapa
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Ex: cidade urbana destruída, prédios em ruínas com fumaça."
              rows={4}
              className="w-full bg-neutral-900 border border-neutral-600 text-white rounded p-3 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Texto opcional que ajuda a IA a entender o cenário.
            </p>
          </div>

          {/* Map Gen Model Selection */}
          <div>
            <label className="block text-sm text-neutral-400 font-bold mb-2 uppercase tracking-wider">
              Modelo de Geração
            </label>
            <select
              value={mapGenModel}
              onChange={(e) => setMapGenModel(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-600 text-white rounded p-3 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image Preview (Recomendado)</option>
              <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Mais Rápido)</option>
            </select>
          </div>

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
            <div className="text-xs flex justify-between">
              <span className="text-neutral-400">Gerações neste minuto:</span>
              <span
                className={`font-mono ${rateLimitUsed >= RATE_LIMIT_MAX ? "text-red-400" : "text-neutral-200"}`}
              >
                {rateLimitUsed}/{RATE_LIMIT_MAX}
              </span>
            </div>
            {retryAfterSeconds > 0 && (
              <div className="text-xs text-amber-400 text-center pt-1">
                Aguarde {retryAfterSeconds}s pra próxima geração.
              </div>
            )}
            {!isConfigured && (
              <div className="text-xs text-red-400 text-center pt-1">
                GEMINI_API_KEY não configurada no servidor.
              </div>
            )}
          </div>

          {generationError && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <X size={14} className="text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-red-200 text-xs font-semibold mb-1">Erro na geração</p>
                  <p className="text-red-300 text-xs leading-relaxed">{generationError}</p>
                </div>
              </div>
              <button
                onClick={() => setGenerationError(null)}
                className="w-full text-[10px] text-red-400 hover:text-red-300 transition-colors text-center"
              >
                Dispensar
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-neutral-700 bg-neutral-800">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <Sparkles size={18} /> Gerar Mapa
              </>
            )}
          </button>
          {!canGenerate && !isGenerating && paintedCount === 0 && (
            <p className="text-[11px] text-neutral-500 text-center mt-2">
              Pinte ao menos uma célula pra liberar a geração.
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

      {/* Generation preview modal */}
      {generationResult && (
        <GenerationPreviewModal
          result={generationResult}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          showOverlay={showCoverOverlay}
          onToggleOverlay={() => setShowCoverOverlay((v) => !v)}
          onClose={handleCloseModal}
          onRegenerate={handleRegenerate}
          onSave={handleSaveDraft}
          regenerating={isGenerating}
          canRegenerate={canGenerate || retryAfterSeconds === 0}
        />
      )}

      {/* Loading overlay with enhanced feedback */}
      {isGenerating && (
        <GenerationLoadingOverlay
          elapsedSeconds={generationElapsedSeconds}
          legendPreview={buildLegendImage(coverData, gridWidth, gridHeight)}
        />
      )}

      {/* Save map dialog — z-[60] so it sits above the preview modal (z-50) */}
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
    </div>
  );
}

/** Enhanced loading overlay with progress feedback */
function GenerationLoadingOverlay({
  elapsedSeconds,
  legendPreview,
}: {
  elapsedSeconds: number;
  legendPreview: string;
}) {
  const estimatedTotal = 30; // seconds
  const progress = Math.min(95, (elapsedSeconds / estimatedTotal) * 100);

  return (
    <div className="absolute inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex flex-col items-center gap-6">
          {/* Animated spinner */}
          <div className="relative">
            <div className="w-16 h-16 border-4 border-neutral-700 border-t-indigo-500 rounded-full animate-spin" />
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400" size={24} />
          </div>

          {/* Status text */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-white">Gerando mapa...</h3>
            <p className="text-sm text-neutral-400">
              Isso pode levar até 30 segundos
            </p>
            <p className="text-xs text-neutral-500 font-mono">
              {elapsedSeconds}s decorridos
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full space-y-2">
            <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-neutral-500 text-center">
              {progress < 30 && "Enviando legenda para o Gemini..."}
              {progress >= 30 && progress < 60 && "Gerando imagem realista..."}
              {progress >= 60 && progress < 90 && "Detectando coberturas..."}
              {progress >= 90 && "Finalizando..."}
            </p>
          </div>

          {/* Legend preview */}
          <div className="w-full">
            <p className="text-xs text-neutral-500 mb-2 text-center">Legenda enviada:</p>
            <div className="w-full aspect-square bg-neutral-900 rounded border border-neutral-700 overflow-hidden">
              <img
                src={legendPreview}
                alt="Legenda"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>
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
  onRegenerate: () => void;
  onSave: () => void;
  regenerating: boolean;
  canRegenerate: boolean;
}

function GenerationPreviewModal({
  result,
  gridWidth,
  gridHeight,
  showOverlay,
  onToggleOverlay,
  onClose,
  onRegenerate,
  onSave,
  regenerating,
  canRegenerate,
}: PreviewProps) {
  const detectedCount = Object.keys(result.detectedCover).length;
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
              <Sparkles size={18} className="text-indigo-400" /> Mapa Gerado
            </h3>
            <p className="text-xs text-neutral-400">
              {gridWidth}×{gridHeight} células — {detectedCount} cobertura
              {detectedCount === 1 ? "" : "s"} detectada{detectedCount === 1 ? "" : "s"}
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
            {showOverlay ? "Ocultar coberturas" : "Mostrar coberturas"}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onRegenerate}
              disabled={regenerating || !canRegenerate}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-bold bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              {regenerating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Gerar Novamente
            </button>
            <button
              onClick={onSave}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              title="Disponível na Etapa 8 do plano"
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

/** Renders the generated image with a grid + cover overlay sized to fit. */
function PreviewCanvas({
  imageDataUri,
  gridWidth,
  gridHeight,
  cover,
  showOverlay,
}: PreviewCanvasProps) {
  // Display each cell at a comfortable size — keep the modal under ~720px tall.
  const display = Math.min(720, Math.floor(640 / Math.max(gridWidth, gridHeight)) * Math.max(gridWidth, gridHeight));
  const cellPx = display / Math.max(gridWidth, gridHeight);
  return (
    <div
      className="relative shadow-xl"
      style={{ width: gridWidth * cellPx, height: gridHeight * cellPx }}
    >
      <img
        src={imageDataUri}
        alt="Mapa gerado pela IA"
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

// ── Save Map Dialog ──────────────────────────────────────────────────────────

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
          /* ── Success state ── */
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
          /* ── Name input state ── */
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
