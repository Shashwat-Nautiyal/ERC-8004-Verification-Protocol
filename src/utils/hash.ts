import { ethers } from "ethers";

/**
 * Compute keccak256 of a Buffer and return the 0x-prefixed hex string.
 */
export function keccak256(data: Buffer): string {
  return ethers.keccak256(new Uint8Array(data));
}
