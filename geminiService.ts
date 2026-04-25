/**
 * Server-side Google Gemini integration for the AI Map Generator.
 *
 * Two operations are exposed:
 *   1. `generateMapFromLegend` — generates a tactical-map image from a painted
 *      legend canvas using `gemini-2.5-flash-image-preview` (Nano Banana).
 *   2. `detectCoverFromImage` — analyses a generated map and returns the cover
 *      type for each grid cell using `gemini-2.5-flash`.
 *
 * Both go through the shared rate limiter; if no slot is available they throw
 * a structured error so HTTP handlers can surface a clear retry message.
 */

import { GoogleGenAI } from "@google/genai";
import { geminiRateLimiter } from "./geminiRateLimiter.js";
import { buildMapGenerationPrompt, buildCoverDetectionPrompt } from "./src/data/geminiPrompts.js";

const IMAGE_MODEL = "gemini-2.5-flash-image-preview";
const VISION_MODEL = "gemini-2.5-flash";

const COVER_TYPES = [
  "none",
  "half",
  "full",
  "wall",
  "water",
  "deployA",
  "deployB",
  "doorOpen",
  "doorClose",
  "window",
] as const;
export type CoverType = (typeof COVER_TYPES)[number];
export type CoverData = Record<string, CoverType>;

export interface GenerateMapResult {
  /** PNG image bytes encoded as base64 (no data-URI prefix). */
  imageBase64: string;
  mimeType: string;
}

export class GeminiRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      `Limite de gerações atingido. Aguarde ${retryAfterSeconds} segundos antes de tentar novamente.`,
    );
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiConfigurationError extends Error {
  constructor() {
    super(
      "GEMINI_API_KEY não configurada no servidor. Adicione-a aos Secrets do App.",
    );
    this.name = "GeminiConfigurationError";
  }
}

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new GeminiConfigurationError();
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function reserveSlotOrThrow(): void {
  const slot = geminiRateLimiter.tryAcquire();
  if (!slot.ok) {
    throw new GeminiRateLimitError(slot.retryAfterSeconds);
  }
}

function stripDataUri(b64: string): { data: string; mimeType: string } {
  const match = b64.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { data: match[2], mimeType: match[1] };
  }
  return { data: b64, mimeType: "image/png" };
}

/**
 * Generates a realistic top-down tactical map from a painted legend image.
 * Throws `GeminiRateLimitError` if the rate limit is exhausted, or
 * `GeminiConfigurationError` if the API key is missing.
 */
export async function generateMapFromLegend(
  legendImageBase64: string,
  userPrompt: string,
  gridWidth: number,
  gridHeight: number,
  modelName: string = "imagen-3.0-generate-001"
): Promise<GenerateMapResult> {
  reserveSlotOrThrow();
  const client = getClient();
  const { data, mimeType } = stripDataUri(legendImageBase64);

  const prompt = buildMapGenerationPrompt({
    gridWidth,
    gridHeight,
    userTheme: userPrompt,
  });

  // Free-tier fallback that ignores the reference image and generates text-to-image
  if (modelName.startsWith("imagen-3.0")) {
    const response = await client.models.generateImages({
      model: modelName,
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
        aspectRatio: "1:1"
      }
    });
    
    if (response.generatedImages && response.generatedImages.length > 0) {
      return {
        imageBase64: response.generatedImages[0].image.imageBytes,
        mimeType: "image/png",
      };
    }
  } else {
    // Advanced image-to-image models (gemini-2.5-flash-image / gemini-3.1-flash-image-preview)
    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: prompt },
          ],
        },
      ],
    });

    const candidates = response.candidates ?? [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts ?? [];
      for (const part of parts) {
        const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
        if (inline?.data) {
          return {
            imageBase64: inline.data,
            mimeType: inline.mimeType ?? "image/png",
          };
        }
      }
    }
  }

  throw new Error(
    "O Gemini não retornou uma imagem. Tente ajustar a legenda ou o prompt.",
  );
}

/**
 * Analyses a generated map image and returns the detected cover for each cell.
 * Returns an empty object if Gemini fails to produce parseable JSON.
 */
export async function detectCoverFromImage(
  imageBase64: string,
  gridWidth: number,
  gridHeight: number,
): Promise<CoverData> {
  reserveSlotOrThrow();
  const client = getClient();
  const { data, mimeType } = stripDataUri(imageBase64);

  const prompt = buildCoverDetectionPrompt({
    gridWidth,
    gridHeight,
  });

  const response = await client.models.generateContent({
    model: VISION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text?.trim() ?? "";
  if (!text) return {};

  try {
    const parsed = JSON.parse(text) as Record<string, string>;
    const result: CoverData = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^\d+,\d+$/.test(key)) continue;
      if (!COVER_TYPES.includes(value as CoverType)) continue;
      if (value === "none") continue;
      result[key] = value as CoverType;
    }
    return result;
  } catch {
    return {};
  }
}
