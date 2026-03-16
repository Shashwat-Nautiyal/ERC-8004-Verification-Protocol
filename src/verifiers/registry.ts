import type { IVerifier } from "../types/index.js";
import { MandateIntegrityVerifier } from "./integrity/index.js";
import { SwapReceiptVerifier } from "./swap/index.js";

/**
 * Map from mandate kind → ordered list of verifiers to run.
 * Add new verifiers here.
 */
export const verifierRegistry: Map<string, IVerifier[]> = new Map([
  [
    "swap@1",
    [
      new MandateIntegrityVerifier(),
      new SwapReceiptVerifier(),
    ],
  ],
]);

export function getVerifiers(kind: string): IVerifier[] {
  return verifierRegistry.get(kind) ?? [new MandateIntegrityVerifier()];
}
