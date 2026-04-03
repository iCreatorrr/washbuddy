/**
 * Format a provider name + location name for display, avoiding duplication.
 *
 * Handles cases like:
 *   - "MetroClean Bus Wash" + "MetroClean Bus Wash — Bronx" → "MetroClean Bus Wash — Bronx"
 *   - "MetroClean Bus Wash" + "MetroClean Bus Wash" → "MetroClean Bus Wash"
 *   - null + "Bronx Terminal" → "Bronx Terminal"
 *   - "MetroClean" + "Bronx Terminal" → "MetroClean — Bronx Terminal"
 */
export function formatLocationDisplay(
  providerName?: string | null,
  locationName?: string | null,
): string {
  const provider = (providerName || "").trim();
  const location = (locationName || "").trim();

  if (!provider && !location) return "Unknown Location";
  if (!provider) return location;
  if (!location) return provider;
  if (provider === location) return provider;
  if (location.toLowerCase().startsWith(provider.toLowerCase())) return location;
  if (provider.toLowerCase().startsWith(location.toLowerCase())) return provider;
  return `${provider} — ${location}`;
}
