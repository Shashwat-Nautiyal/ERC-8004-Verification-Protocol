import type { IVerifier, Mandate, Receipt, VerifierResult } from "../../types/index.js";
import { recoverMandateSigner } from "./sigVerifier.js";
import { env } from "../../utils/env.js";

export class MandateIntegrityVerifier implements IVerifier {
  readonly label = "integrity";

  async verify(mandate: Mandate, _receipt?: Receipt): Promise<VerifierResult> {
    // 1. Required fields
    if (!mandate.core.kind || !mandate.core.router || !mandate.core.chainId) {
      return this.fail("Missing required core fields (kind / router / chainId)");
    }

    // 2. Deadline not expired
    const nowSec = Math.floor(Date.now() / 1000);
    if (mandate.core.deadline < nowSec) {
      return this.fail(
        `Deadline expired: ${mandate.core.deadline} < now ${nowSec}`
      );
    }

    // 3. User signature present and recoverable
    if (!mandate.signatures.user) {
      return this.fail("Missing user signature");
    }

    let signer: string;
    try {
      signer = recoverMandateSigner(mandate);
    } catch (err) {
      return this.fail(`Signature recovery failed: ${String(err)}`);
    }

    // Sybil resistance: mandate signer must not be this validator
    if (signer.toLowerCase() === env.VALIDATOR_ADDRESS.toLowerCase()) {
      return this.fail(`Sybil: mandate signer ${signer} is the validator itself`);
    }

    return {
      score:   100,
      label:   this.label,
      passed:  true,
      detail:  `Signer recovered: ${signer}`,
    };
  }

  private fail(detail: string): VerifierResult {
    return { score: 0, label: this.label, passed: false, detail };
  }
}
