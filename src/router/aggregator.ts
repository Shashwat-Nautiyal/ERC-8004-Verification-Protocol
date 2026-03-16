import type { VerifierResult } from "../types/index.js";

/**
 * Aggregate verifier scores into a single 0–100 score.
 * Strategy: floor(mean(scores)), clamped to [0, 100].
 * A single failing verifier (score=0) will drag the mean down significantly.
 */
export function aggregateScores(results: VerifierResult[]): number {
  if (results.length === 0) return 0;

  const sum = results.reduce((acc, r) => acc + r.score, 0);
  const mean = sum / results.length;
  return clamp(Math.floor(mean), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
