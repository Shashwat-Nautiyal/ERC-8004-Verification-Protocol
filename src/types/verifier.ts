import type { Mandate } from "./mandate.js";
import type { Receipt } from "./receipt.js";

export type VerifierResult = {
  score: number;       // 0–100
  label: string;       // short human-readable name for the check
  passed: boolean;
  detail?: string;     // optional explanation / failure reason
};

export interface IVerifier {
  /** Unique label used in aggregation logs */
  readonly label: string;

  /**
   * Verify a mandate (and optionally its on-chain receipt).
   * Must never throw — return a failed VerifierResult instead.
   */
  verify(mandate: Mandate, receipt?: Receipt): Promise<VerifierResult>;
}
