import type {
  AIMapGenerationRequest,
  AIMapGenerationResult,
} from "../types/game";

export interface AIMapStatus {
  used: number;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
  configured: boolean;
}

export interface AIMapSaveRequest {
  name: string;
  imageBase64: string;
  mimeType: string;
  coverData: Record<string, string>;
  gridWidth: number;
  gridHeight: number;
}

export interface AIMapSaveResult {
  mapId: string;
  imagePath: string;
}

export interface AIMapListItem {
  id: string;
  name: string;
  imagePath: string;
  gridWidth: number;
  gridHeight: number;
  createdAt: number;
}

export interface AIMapDraft {
  id?: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  coverData: Record<string, string>;
  userPrompt: string;
  updatedAt?: number;
}

export class AIMapRateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = "AIMapRateLimitError";
  }
}

async function parseError(res: Response): Promise<Error> {
  let body: { error?: string; details?: string; retryAfterSeconds?: number } = {};
  try { body = await res.json(); } catch { /* empty */ }
  let message = body.error || `Erro ${res.status}`;
  if (body.details) message += `\nDetalhes da API: ${body.details}`;
  if (res.status === 429 && typeof body.retryAfterSeconds === "number") {
    return new AIMapRateLimitError(message, body.retryAfterSeconds);
  }
  return new Error(message);
}

export const aiMapService = {
  async getStatus(): Promise<AIMapStatus> {
    const res = await fetch("/api/ai-maps/status");
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async generate(request: AIMapGenerationRequest): Promise<AIMapGenerationResult> {
    const res = await fetch("/api/ai-maps/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async save(request: AIMapSaveRequest): Promise<AIMapSaveResult> {
    const res = await fetch("/api/ai-maps/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async list(): Promise<AIMapListItem[]> {
    const res = await fetch("/api/ai-maps/list");
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async delete(mapId: string): Promise<void> {
    const res = await fetch(`/api/ai-maps/${mapId}`, { method: "DELETE" });
    if (!res.ok) throw await parseError(res);
  },

  async saveDraft(draft: AIMapDraft): Promise<AIMapDraft> {
    const res = await fetch("/api/ai-maps/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async listDrafts(): Promise<AIMapDraft[]> {
    const res = await fetch("/api/ai-maps/drafts");
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async deleteDraft(draftId: string): Promise<void> {
    const res = await fetch(`/api/ai-maps/drafts/${draftId}`, { method: "DELETE" });
    if (!res.ok) throw await parseError(res);
  },
};
