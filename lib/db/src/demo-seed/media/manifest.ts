export interface MediaAssetDefinition {
  assetKey: string;
  type: "provider-logo" | "location-hero" | "location-gallery" | "driver-avatar" | "fleet-logo";
  description: string;
  format: "svg" | "png" | "jpg";
  generationStrategy: "svg-procedural" | "placeholder-color" | "initials";
}

export const MEDIA_GENERATION_STRATEGIES = {
  "svg-procedural": "Generate deterministic SVG with seeded colors, shapes, and text",
  "placeholder-color": "Generate solid color rectangle with overlaid text",
  "initials": "Generate circle with initials and seeded background color",
} as const;

export const PROVIDER_LOGO_COLORS = [
  "#1E40AF", "#7C3AED", "#059669", "#DC2626", "#D97706",
  "#0891B2", "#4F46E5", "#16A34A", "#DB2777", "#EA580C",
  "#2563EB", "#9333EA", "#10B981", "#EF4444", "#F59E0B",
  "#06B6D4", "#6366F1", "#22C55E", "#EC4899", "#F97316",
];

export const LOCATION_HERO_PALETTES = [
  { bg: "#E0F2FE", accent: "#0284C7", detail: "#BAE6FD" },
  { bg: "#F0FDF4", accent: "#16A34A", detail: "#BBF7D0" },
  { bg: "#FEF3C7", accent: "#D97706", detail: "#FDE68A" },
  { bg: "#EDE9FE", accent: "#7C3AED", detail: "#DDD6FE" },
  { bg: "#FCE7F3", accent: "#DB2777", detail: "#FBCFE8" },
];

export function getAssetManifest(providerCount: number, locationCount: number, driverCount: number, fleetCount: number): MediaAssetDefinition[] {
  const assets: MediaAssetDefinition[] = [];

  for (let i = 0; i < providerCount; i++) {
    assets.push({
      assetKey: `provider-logo-${i}`,
      type: "provider-logo",
      description: `Logo for provider ${i}`,
      format: "svg",
      generationStrategy: "svg-procedural",
    });
  }

  for (let i = 0; i < locationCount; i++) {
    assets.push({
      assetKey: `location-hero-${i}`,
      type: "location-hero",
      description: `Hero image for location ${i}`,
      format: "svg",
      generationStrategy: "svg-procedural",
    });
  }

  for (let i = 0; i < driverCount; i++) {
    assets.push({
      assetKey: `driver-avatar-${i}`,
      type: "driver-avatar",
      description: `Avatar for driver ${i}`,
      format: "svg",
      generationStrategy: "initials",
    });
  }

  for (let i = 0; i < fleetCount; i++) {
    assets.push({
      assetKey: `fleet-logo-${i}`,
      type: "fleet-logo",
      description: `Logo for fleet ${i}`,
      format: "svg",
      generationStrategy: "svg-procedural",
    });
  }

  return assets;
}
