#!/usr/bin/env tsx
/**
 * Manually post a mock ValidationRequest to the registry.
 *
 * Builds a minimal swap@1 RouterPayload, computes its keccak256 hash,
 * serves it locally, then calls validationRequest() on the registry.
 *
 * Usage:
 *   tsx scripts/seed-request.ts
 *
 * Prerequisites:
 *   - Anvil (or any EVM node) running at RPC_URL
 *   - ValidationRegistry deployed at REGISTRY_ADDRESS
 *   - Validator server running at BASE_URL (npm run dev)
 */
import { ethers } from "ethers";

import abi from "../abis/ValidationRegistry.json" with { type: "json" };
import "dotenv/config";

const RPC_URL          = process.env["RPC_URL"]!;
const PRIVATE_KEY      = process.env["PRIVATE_KEY"]!;
const REGISTRY_ADDRESS = process.env["REGISTRY_ADDRESS"]!;
const ROUTER_ADDRESS   = process.env["ROUTER_ADDRESS"]!;
const BASE_URL         = process.env["BASE_URL"] ?? "http://localhost:3000";
const AGENT_ID         = process.env["AGENT_ID"] ?? "0xMockAgent";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(REGISTRY_ADDRESS, abi, signer);

  // 1. Build a minimal swap@1 payload
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const mockPayload = {
    agentId: AGENT_ID,
    mandate: {
      core: {
        kind:     "swap@1",
        chainId:  Number((await provider.getNetwork()).chainId),
        router:   ROUTER_ADDRESS,
        deadline,
      },
      payload: {
        tokenIn:      "0xTokenIn",
        tokenOut:     "0xTokenOut",
        amountIn:     "1000000000000000000",
        amountOutMin: "900000000000000000",
        recipient:    await signer.getAddress(),
      },
      signatures: {
        // In production the user signs the EIP-712 Mandate struct.
        // For seed/test purposes we use a placeholder.
        user: "0x" + "ab".repeat(65),
      },
    },
    receipt: {
      txHash:      "0x" + "00".repeat(32),
      blockNumber: 0,
      chainId:     Number((await provider.getNetwork()).chainId),
      from:        await signer.getAddress(),
      to:          ROUTER_ADDRESS,
      logs:        [],
    },
  };

  const payloadJson = JSON.stringify(mockPayload);
  const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payloadJson));

  // 2. Post payload to the server so the validator can fetch it
  const requestId    = ethers.hexlify(ethers.randomBytes(32));
  const requestURI   = `${BASE_URL}/mock-payload/${requestId}`;

  // Upload mock payload to an in-memory endpoint on the validator server
  const uploadRes = await fetch(`${BASE_URL}/mock-payloads`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id: requestId, payload: payloadJson }),
  });
  if (!uploadRes.ok) {
    throw new Error(`Failed to upload mock payload: ${uploadRes.status}`);
  }

  console.log("Seeding ValidationRequest...");
  console.log("  requestId  :", requestId);
  console.log("  router     :", ROUTER_ADDRESS);
  console.log("  requestURI :", requestURI);
  console.log("  requestHash:", requestHash);
  console.log("  deadline   :", deadline);

  // 3. Call validationRequest() on the registry
  // Adjust the method name to match your deployed contract's interface.
  const tx = await contract.validationRequest(
    ROUTER_ADDRESS,
    requestId,
    requestURI,
    requestHash,
    deadline
  );
  const receipt = await tx.wait();
  console.log("Tx confirmed in block", receipt.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
