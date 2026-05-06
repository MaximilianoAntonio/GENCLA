export type PaletteName = "Predeterminada" | "Puesta de sol" | "Oceano" | "Pastel";

export const CHART_PALETTES: Record<PaletteName, string[]> = {
  Predeterminada: [
    "#FF6B6B",
    "#4ECDC4",
    "#FFD93D",
    "#5D5FEF",
    "#F97F51",
    "#1B9CFC",
    "#F7B731",
    "#2ED573",
    "#9B59B6",
    "#F39C12"
  ],
  "Puesta de sol": [
    "#F94144",
    "#F3722C",
    "#F8961E",
    "#F9844A",
    "#F9C74F",
    "#90BE6D",
    "#43AA8B",
    "#4D908E",
    "#577590",
    "#277DA1"
  ],
  Oceano: [
    "#0077B6",
    "#00B4D8",
    "#48CAE4",
    "#90E0EF",
    "#CAF0F8",
    "#023E8A",
    "#0096C7",
    "#ADE8F4",
    "#03045E",
    "#4CC9F0"
  ],
  Pastel: [
    "#FFADAD",
    "#FFD6A5",
    "#FDFFB6",
    "#CAFFBF",
    "#9BF6FF",
    "#A0C4FF",
    "#BDB2FF",
    "#FFC6FF",
    "#E9C46A",
    "#D4E09B"
  ]
};

export const PALETTE_OPTIONS: PaletteName[] = Object.keys(CHART_PALETTES) as PaletteName[];

export function getPalette(name: PaletteName): string[] {
  return CHART_PALETTES[name] ?? CHART_PALETTES.Predeterminada;
}
