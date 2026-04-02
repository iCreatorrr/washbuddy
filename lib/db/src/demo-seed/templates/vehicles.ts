export interface VehicleUnitPattern {
  prefix: string;
  startNumber: number;
}

export const UNIT_PREFIXES_BY_FLEET_SIZE = {
  small: ["SB"],
  medium: ["MB", "MC"],
  large: ["LF", "LC", "LS"],
};

export const LICENSE_PLATE_PATTERNS: Record<string, (index: number) => string> = {
  NYC: (i) => `NY-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)}-${(1000 + i).toString()}`,
  DET: (i) => `MI-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)}-${(2000 + i).toString()}`,
  TOR: (i) => `ON-${String.fromCharCode(65 + (i % 26))}${(3000 + i).toString()}`,
  MTL: (i) => `QC-${String.fromCharCode(65 + (i % 26))}${(4000 + i).toString()}`,
};
