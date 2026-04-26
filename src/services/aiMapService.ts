import type {
  AIMapGenerationRequest,
  AIMapGenerationResult,
  AIMapSaveRequest,
  AIMapSaveResult,
  AIMapListItem,
  AIMapDraft,
} from "../types/game";

// NOTE: This service has been partially stubbed out after removing the AI backend.
// Draft-related functions may still work if pointed to a valid backend.

/**
 * A safe, no-op (no-operation) version of a function that returns a resolved promise.
 * This is used to prevent errors when calling functions that were previously connected to a backend.
 */
const noOp = <T extends any>(returnValue: T) => async (): Promise<T> => {
  console.warn("AI Map Service function was called but is disabled. Returning a default value.");
  return Promise.resolve(returnValue);
};

export const aiMapService = {
  // STUBBED: Returns a successful save result without doing anything.
  async save(request: AIMapSaveRequest): Promise<AIMapSaveResult> {
    console.warn("aiMapService.save is a stub and does not actually save the map.");
    // Return a fake mapId to satisfy the calling code.
    return Promise.resolve({ mapId: `fake-${Date.now()}`, imagePath: "" });
  },

  // KEPT: These draft functions are kept for the manual map editing flow.
  // They will require a backend to be fully functional.
  saveDraft: noOp<AIMapDraft>({} as AIMapDraft),
  listDrafts: noOp<AIMapDraft[]>([]),
  deleteDraft: noOp<void>(undefined),
  
  // DEPRECATED/REMOVED - These functions are no longer used.
  getStatus: noOp({ used: 0, limit: 0, windowSeconds: 0, retryAfterSeconds: 0, configured: false }),
  generate: noOp<AIMapGenerationResult>({} as AIMapGenerationResult),
  list: noOp<AIMapListItem[]>([]),
  delete: noOp<void>(undefined),
}; 
