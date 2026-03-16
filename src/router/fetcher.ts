import { keccak256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";
import type { RouterPayload } from "../types/index.js";

/**
 * Fetch a RouterPayload from a URI and verify its keccak256 hash
 * matches the expectedHash from the on-chain ValidationRequest event.
 * Throws if the fetch fails or the hash does not match — never returns
 * an unverified payload.
 */
export async function fetchPayload(
  requestURI: string,
  expectedHash: string
): Promise<RouterPayload> {
  const response = await fetch(requestURI);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch payload from ${requestURI}: ${response.status} ${response.statusText}`
    );
  }

  const raw = await response.text();
  const actualHash = keccak256(Buffer.from(raw, "utf8"));

  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(
      `Payload hash mismatch: expected ${expectedHash}, got ${actualHash}`
    );
  }

  logger.info(`Payload hash verified: ${actualHash}`);
  return JSON.parse(raw) as RouterPayload;
}
