/**
 * Prompt templates for Gemini AI map generation
 */

export interface PromptContext {
  gridWidth: number;
  gridHeight: number;
  userTheme?: string;
}

/**
 * Builds the prompt for generating a tactical map image from a legend
 */
export function buildMapGenerationPrompt(context: PromptContext): string {
  const { gridWidth, gridHeight, userTheme } = context;
  const resolution = gridWidth * 50; // 50px per cell

  let prompt = `You are a tactical map generator for a grid-based tactical combat game.

TECHNICAL SPECIFICATIONS:
- Output resolution: ${resolution}×${resolution} pixels (${gridWidth}×${gridHeight} grid, 50px per cell)
- View: Top-down/bird's eye view, realistic style
- Lighting: Natural daylight, high quality rendering

LEGEND COLOR MAPPING:
You will receive a legend image with colored areas. Each color represents a tactical element that MUST be replaced with realistic visual elements in the generated map:

1. DARK GRAY (#404040) = WALLS
   → Solid, impassable barriers: concrete walls, thick stone walls, reinforced barriers
   → Must be clearly distinguishable as blocking terrain

2. RED (#EF4444) = FULL COVER
   → Large solid objects providing complete protection: buildings, shipping containers, large concrete blocks, thick walls, armored vehicles
   → Should be substantial and clearly provide full concealment

3. YELLOW (#EAB308) = HALF COVER
   → Medium obstacles providing partial protection: cars, low walls, wooden crates, sandbags, debris piles, barrels
   → Should be waist-to-chest height, clearly smaller than full cover

4. BLUE (#1E40AF) = WATER
   → Water bodies: rivers, lakes, ponds, flooded areas
   → Should have realistic water texture and reflections

5. GREEN (#10B981) = DEPLOY ZONE A
   → Clear, accessible area for team deployment: open ground, paved areas, clear terrain
   → Should be visually distinct but not obstructed

6. ORANGE (#F97316) = DEPLOY ZONE B
   → Clear, accessible area for team deployment: open ground, paved areas, clear terrain
   → Should be visually distinct but not obstructed

7. WHITE/EMPTY = OPEN TERRAIN
   → Walkable ground: dirt, grass, pavement, concrete floor
   → Should match the overall theme of the map

CRITICAL REQUIREMENTS:
1. EXACT POSITIONING: The generated elements MUST respect the EXACT position and shape of each colored area in the legend
2. NO DISPLACEMENT: Do not move or shift elements from their legend positions
3. SCALE CONSISTENCY: Maintain the grid structure - each 50×50px cell should contain appropriate-sized elements
4. VISUAL CLARITY: Each cover type must be visually distinct and recognizable
5. REALISTIC STYLE: Use photorealistic textures and lighting, avoid cartoon or stylized looks
6. COHESIVE THEME: All elements should fit together in a believable tactical environment`;

  if (userTheme && userTheme.trim()) {
    prompt += `\n\nTHEME CONTEXT:\n${userTheme.trim()}\n→ Adapt the visual style and element choices to match this theme while maintaining the legend positioning and cover types.`;
  }

  prompt += `\n\nEXAMPLES OF GOOD ELEMENT CHOICES:
- Urban theme: concrete buildings (full), cars/dumpsters (half), asphalt (open)
- Desert theme: rock formations (full), sand dunes (half), sand (open)
- Forest theme: large trees/boulders (full), fallen logs/bushes (half), grass/dirt (open)
- Industrial theme: containers/machinery (full), barrels/crates (half), concrete floor (open)
- Destroyed city: ruined buildings (full), rubble piles (half), cracked pavement (open)

Generate a high-quality, realistic tactical map that precisely follows the legend layout.`;

  return prompt;
}

/**
 * Builds the prompt for detecting cover types from a generated map image
 */
export function buildCoverDetectionPrompt(context: PromptContext): string {
  const { gridWidth, gridHeight } = context;

  return `Analyze this tactical map image and identify the cover type for each cell in a ${gridWidth}×${gridHeight} grid.

GRID STRUCTURE:
- The image is divided into a ${gridWidth}×${gridHeight} grid
- Each cell is 50×50 pixels
- Cell coordinates: x=0 to ${gridWidth - 1} (left to right), y=0 to ${gridHeight - 1} (top to bottom)

COVER TYPE CLASSIFICATION:
Examine the visual elements in each cell and classify them as:

- "none" = Open terrain, walkable ground (grass, dirt, pavement, empty floor)
- "half" = Partial cover objects (cars, low walls, crates, sandbags, barrels, small debris)
- "full" = Full cover objects (buildings, containers, large walls, thick barriers, large vehicles)
- "wall" = Impassable barriers (solid walls, thick concrete barriers, reinforced structures)
- "water" = Water bodies (rivers, lakes, ponds, flooded areas)
- "deployA" = Clear deployment zone A (open, accessible area marked for team A)
- "deployB" = Clear deployment zone B (open, accessible area marked for team B)

CLASSIFICATION RULES:
1. If a cell contains MOSTLY open ground → "none"
2. If a cell contains objects roughly waist-to-chest height → "half"
3. If a cell contains large solid structures providing full concealment → "full"
4. If a cell contains thick impassable barriers → "wall"
5. If a cell contains water → "water"
6. Deployment zones should be identified by their clear, open nature and position
7. When in doubt between two types, choose the more protective one (e.g., half vs full → choose full)

OUTPUT FORMAT:
Return a JSON object where each key is "x,y" (cell coordinates) and the value is the cover type.
Only include cells that are NOT "none" (to reduce output size).

Example:
{
  "0,0": "deployA",
  "5,3": "half",
  "10,7": "full",
  "15,12": "wall",
  "20,8": "water"
}

Analyze the image systematically and return the JSON object.`;
}
