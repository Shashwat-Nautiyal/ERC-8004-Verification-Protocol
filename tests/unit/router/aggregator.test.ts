import { describe, it, expect } from "vitest";
import { aggregateScores } from "../../../src/router/aggregator.js";
import type { VerifierResult } from "../../../src/types/index.js";

function r(score: number): VerifierResult {
  return { score, label: "test", passed: score > 0 };
}

describe("aggregateScores", () => {
  it("returns 0 for empty array", () => {
    expect(aggregateScores([])).toBe(0);
  });

  it("returns 100 for all-passing", () => {
    expect(aggregateScores([r(100), r(100), r(100)])).toBe(100);
  });

  it("drags mean down when one verifier fails", () => {
    // floor((100 + 0 + 100) / 3) = floor(66.67) = 66
    expect(aggregateScores([r(100), r(0), r(100)])).toBe(66);
  });

  it("floors the mean, not rounds", () => {
    // floor(mean(100, 99)) = floor(99.5) = 99
    expect(aggregateScores([r(100), r(99)])).toBe(99);
  });

  it("clamps above 100 to 100", () => {
    const result = aggregateScores([{ score: 200, label: "x", passed: true }]);
    expect(result).toBe(100);
  });

  it("clamps below 0 to 0", () => {
    const result = aggregateScores([{ score: -50, label: "x", passed: false }]);
    expect(result).toBe(0);
  });

  it("handles single result", () => {
    expect(aggregateScores([r(75)])).toBe(75);
  });

  it("correctly averages mixed scores", () => {
    // floor((80 + 60 + 70) / 3) = floor(70) = 70
    expect(aggregateScores([r(80), r(60), r(70)])).toBe(70);
  });
});
