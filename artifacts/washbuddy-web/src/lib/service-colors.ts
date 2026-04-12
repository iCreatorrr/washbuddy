// Shared service color system — used in Quick-Add booking tiles and Bay Timeline blocks
// Each service type gets a distinct color for consistent visual identity across the app

export interface ServiceColorSet {
  // Bay Timeline block colors (bg, border, text)
  bg: string;
  border: string;
  text: string;
  // Quick-Add tile: unselected state
  tileBorder: string;
  tileIcon: string;
  // Quick-Add tile: selected state
  tileBgSelected: string;
  tileBorderSelected: string;
  tileIconSelected: string;
  tileTextSelected: string;
}

const COLOR_MAP: Record<string, ServiceColorSet> = {
  express: {
    bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800",
    tileBorder: "border-blue-300", tileIcon: "text-blue-500",
    tileBgSelected: "bg-blue-50", tileBorderSelected: "border-blue-500",
    tileIconSelected: "text-blue-600", tileTextSelected: "text-blue-900",
  },
  exterior: {
    bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800",
    tileBorder: "border-cyan-300", tileIcon: "text-cyan-500",
    tileBgSelected: "bg-cyan-50", tileBorderSelected: "border-cyan-500",
    tileIconSelected: "text-cyan-600", tileTextSelected: "text-cyan-900",
  },
  interior: {
    bg: "bg-green-100", border: "border-green-300", text: "text-green-800",
    tileBorder: "border-green-300", tileIcon: "text-green-500",
    tileBgSelected: "bg-green-50", tileBorderSelected: "border-green-500",
    tileIconSelected: "text-green-600", tileTextSelected: "text-green-900",
  },
  detail: {
    bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800",
    tileBorder: "border-purple-300", tileIcon: "text-purple-500",
    tileBgSelected: "bg-purple-50", tileBorderSelected: "border-purple-500",
    tileIconSelected: "text-purple-600", tileTextSelected: "text-purple-900",
  },
  undercarriage: {
    bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800",
    tileBorder: "border-amber-300", tileIcon: "text-amber-500",
    tileBgSelected: "bg-amber-50", tileBorderSelected: "border-amber-500",
    tileIconSelected: "text-amber-600", tileTextSelected: "text-amber-900",
  },
  engine: {
    bg: "bg-red-100", border: "border-red-300", text: "text-red-800",
    tileBorder: "border-red-300", tileIcon: "text-red-500",
    tileBgSelected: "bg-red-50", tileBorderSelected: "border-red-500",
    tileIconSelected: "text-red-600", tileTextSelected: "text-red-900",
  },
};

const DEFAULT_COLORS: ServiceColorSet = {
  bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-800",
  tileBorder: "border-slate-300", tileIcon: "text-slate-400",
  tileBgSelected: "bg-slate-50", tileBorderSelected: "border-slate-500",
  tileIconSelected: "text-slate-600", tileTextSelected: "text-slate-900",
};

export function getServiceColors(name: string): ServiceColorSet {
  const n = name.toLowerCase();
  // Order matters — "express wash" should match "express" before "wash"
  if (n.includes("express") || n.includes("quick") || n.includes("rinse")) return COLOR_MAP.express;
  if (n.includes("exterior") || (n.includes("wash") && !n.includes("under"))) return COLOR_MAP.exterior;
  if (n.includes("interior")) return COLOR_MAP.interior;
  if (n.includes("detail")) return COLOR_MAP.detail;
  if (n.includes("undercarriage")) return COLOR_MAP.undercarriage;
  if (n.includes("engine")) return COLOR_MAP.engine;
  return DEFAULT_COLORS;
}

/** Bay Timeline block class string */
export function getTimelineBlockColors(name: string): string {
  const c = getServiceColors(name);
  return `${c.bg} ${c.border} ${c.text}`;
}
