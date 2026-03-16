import { ethers } from "ethers";
import type { Mandate } from "../../types/index.js";

const DOMAIN_NAME    = "ERC-8004";
const DOMAIN_VERSION = "1";

/**
 * EIP-712 type definitions.
 *
 * Mandate signs over both the core fields AND a keccak256 hash of the
 * serialised payload. This ensures the signature is bound to the exact
 * payload (tokenIn/out, amounts, recipient, etc.) and cannot be replayed
 * with a different payload while keeping a valid core signature.
 */
const MANDATE_TYPES = {
  Mandate: [
    { name: "kind",        type: "string"  },
    { name: "chainId",     type: "uint256" },
    { name: "router",      type: "address" },
    { name: "deadline",    type: "uint256" },
    { name: "payloadHash", type: "bytes32" },
  ],
};

function payloadHash(mandate: Mandate): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(mandate.payload ?? null))
  );
}

/**
 * Recover the signer of an EIP-712 mandate.
 * Returns the checksummed address or throws on invalid signature.
 */
export function recoverMandateSigner(mandate: Mandate): string {
  const domain: ethers.TypedDataDomain = {
    name:              DOMAIN_NAME,
    version:           DOMAIN_VERSION,
    chainId:           mandate.core.chainId,
    verifyingContract: mandate.core.router,
  };

  const value = {
    kind:        mandate.core.kind,
    chainId:     mandate.core.chainId,
    router:      mandate.core.router,
    deadline:    mandate.core.deadline,
    payloadHash: payloadHash(mandate),
  };

  return ethers.verifyTypedData(domain, MANDATE_TYPES, value, mandate.signatures.user);
}

/**
 * Returns true if the recovered signer matches the expected address.
 */
export function verifyMandateSignature(
  mandate: Mandate,
  expectedSigner: string
): boolean {
  try {
    const recovered = recoverMandateSigner(mandate);
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}
