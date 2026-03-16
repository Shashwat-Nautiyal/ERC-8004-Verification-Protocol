#!/usr/bin/env tsx
/**
 * Full e2e: seed a mock ValidationRequest, wait for the validator to process it,
 * then assert a ValidationResponse was posted on-chain.
 *
 * Usage:
 *   tsx scripts/run-e2e.ts
 *
 * Prerequisites:
 *   - Anvil running at RPC_URL
 *   - ValidationRegistry deployed at REGISTRY_ADDRESS
 *   - Validator node running at BASE_URL (npm run dev)
 */
import { ethers } from "ethers";
import { createHash } from "crypto";
import abi from "../abis/ValidationRegistry.json" with { type: "json" };
import "dotenv/config";

const RPC_URL          = process.env["RPC_URL"]!;
const PRIVATE_KEY      = process.env["PRIVATE_KEY"]!;
const REGISTRY_ADDRESS = process.env["REGISTRY_ADDRESS"]!;
const ROUTER_ADDRESS   = process.env["ROUTER_ADDRESS"]!;
const BASE_URL         = process.env["BASE_URL"] ?? "http://localhost:3000";
const AGENT_ID         = process.env["AGENT_ID"] ?? "0xMockAgent";
const POLL_TIMEOUT_MS  = 120_000;
const POLL_INTERVAL_MS = 3_000;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(REGISTRY_ADDRESS, abi, signer);

  const deadline   = Math.floor(Date.now() / 1000) + 3600;
  const chainId    = Number((await provider.getNetwork()).chainId);
  const requestId  = ethers.hexlify(ethers.randomBytes(32));
  const requestURI = `${BASE_URL}/mock-payload/${requestId}`;

  // 1. Build and upload mock payload
  const mockPayload = {
    agentId: AGENT_ID,
    mandate: {
      core: { kind: "swap@1", chainId, router: ROUTER_ADDRESS, deadline },
      payload: {
        tokenIn:      "0xTokenIn",
        tokenOut:     "0xTokenOut",
        amountIn:     "1000000000000000000",
        amountOutMin: "900000000000000000",
        recipient:    await signer.getAddress(),
      },
      signatures: { user: "0x" + "ab".repeat(65) },
    },
    receipt: {
      txHash:      "0x" + "00".repeat(32),
      blockNumber: 0,
      chainId,
      from:        await signer.getAddress(),
      to:          ROUTER_ADDRESS,
      logs:        [],
    },
  };

  const payloadJson = JSON.stringify(mockPayload);
  const requestHash = "0x" + createHash("sha3-256")
    .update(Buffer.from(payloadJson, "utf8"))
    .digest("hex");

  const uploadRes = await fetch(`${BASE_URL}/mock-payloads`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id: requestId, payload: payloadJson }),
  });
  if (!uploadRes.ok) throw new Error(`Payload upload failed: ${uploadRes.status}`);

  // 2. Seed ValidationRequest on-chain
  console.log("Seeding request", requestId);
  const seedTx = await contract.validationRequest(
    ROUTER_ADDRESS, requestId, requestURI, requestHash, deadline
  );
  await seedTx.wait();
  console.log("Request seeded. Waiting for response...");

  // 3. Poll for ValidationResponse
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const filter = contract.filters.ValidationResponse(ROUTER_ADDRESS, requestId);
    const events = await contract.queryFilter(filter, 0, "latest");
    if (events.length > 0) {
      const log   = events[0] as ethers.EventLog;
      const score = Number(log.args[2]);
      console.log(`\nResponse received! score=${score}`);
      if (score < 0 || score > 100) throw new Error(`Score out of range: ${score}`);
      console.log("E2E test PASSED");
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    process.stdout.write(".");
  }

  throw new Error("Timed out waiting for ValidationResponse");
}

main().catch((err) => {
  console.error("\nE2E test FAILED:", err.message);
  process.exit(1);
});
