/** Client-side fee calculation — mirrors server feeCalculator.ts */
export function calculatePlatformFee(basePriceMinor: number): number {
  return Math.min(Math.round(basePriceMinor * 0.15), 2500);
}
