/**
 * Backward-compatible catalyst classifier.
 * Wraps the granular classifier into the legacy tier-based type.
 */
import { classifyCatalystGranular } from "./catalystClassifier";

export type CatalystType = "tier1" | "tier2" | "tier3" | "tier4" | "other";

/** Returns null if the trade should be skipped (danger pattern matched). */
export function classifyCatalyst(headline: string): CatalystType | null {
  const result = classifyCatalystGranular(headline);
  if (result === null) return null;
  const tierMap: Record<number, CatalystType> = {
    1: "tier1",
    2: "tier2",
    3: "tier3",
    4: "tier4",
    5: "other",
  };
  return tierMap[result.tier] ?? "other";
}
