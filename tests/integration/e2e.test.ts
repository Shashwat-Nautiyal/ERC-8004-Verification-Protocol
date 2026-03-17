/**
 * Integration test: full flow against an Anvil fork.
 *
 * Prerequisites:
 *   - Anvil running at RPC_URL (default: http://127.0.0.1:8545)
 *   - ValidationRegistry deployed at REGISTRY_ADDRESS
 *   - Validator node running at BASE_URL (npm run dev)
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import abi from "../../abis/ValidationRegistry.json" with { type: "json" };

const TIMEOUT = 60_000;

describe("E2E: ValidationRequest → ValidationResponse", { timeout: TIMEOUT }, () => {
  // All env vars read inside beforeAll — executes AFTER setupFiles loads .env
  let RPC_URL:          string;
  let PRIVATE_KEY:      string;
  let REGISTRY_ADDRESS: string;
  let ROUTER_ADDRESS:   string;
  let BASE_URL:         string;

  let provider:  ethers.JsonRpcProvider;
  let signer:    ethers.Wallet;
  let contract:  ethers.Contract;
  let requestId: string;

  beforeAll(async () => {
    RPC_URL          = process.env["RPC_URL"]          ?? "http://127.0.0.1:8545";
    PRIVATE_KEY      = process.env["PRIVATE_KEY"]      ?? "";
    REGISTRY_ADDRESS = process.env["REGISTRY_ADDRESS"] ?? "";
    ROUTER_ADDRESS   = process.env["ROUTER_ADDRESS"]   ?? "";
    BASE_URL         = process.env["BASE_URL"]         ?? "http://localhost:3000";

    provider = new ethers.JsonRpcProvider(RPC_URL);
    signer   = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(REGISTRY_ADDRESS, abi, signer);
  });

  it("seeds a ValidationRequest event", async () => {
    const chainId    = Number((await provider.getNetwork()).chainId);
    const deadline   = Math.floor(Date.now() / 1000) + 3600;
    requestId        = ethers.hexlify(ethers.randomBytes(32));
    const requestURI = `${BASE_URL}/mock-payload/${requestId}`;

    const mockPayload = {
      agentId: "0xTestAgent",
      mandate: {
        core: { kind: "swap@1", chainId, router: ROUTER_ADDRESS, deadline },
        payload: {
          tokenIn: "0xTokenA", tokenOut: "0xTokenB",
          amountIn: "1000", amountOutMin: "900",
          recipient: await signer.getAddress(),
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
    const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payloadJson));

    // Upload payload to the validator server so it can be fetched
    const up = await fetch(`${BASE_URL}/mock-payloads`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: requestId, payload: payloadJson }),
    });
    expect(up.status).toBe(201);

    // Submit ValidationRequest on-chain
    const tx = await contract.validationRequest(
      ROUTER_ADDRESS, requestId, requestURI, requestHash, deadline
    );
    const receipt = await tx.wait();
    expect(receipt.status).toBe(1);
  });

  it("receives a ValidationResponse with score in [0,100]", async () => {
    const pollStart = Date.now();
    const pollLimit = 45_000;

    while (Date.now() - pollStart < pollLimit) {
      const filter = contract.filters.ValidationResponse(ROUTER_ADDRESS, requestId);
      const events = await contract.queryFilter(filter, 0, "latest");

      if (events.length > 0) {
        const log   = events[0] as ethers.EventLog;
        const score = Number(log.args[2]);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
        return;
      }

      await new Promise((r) => setTimeout(r, 2_000));
    }

    throw new Error("Timed out: no ValidationResponse received");
  });

  it("exposes score breakdown at responseURI", async () => {
    const res  = await fetch(`${BASE_URL}/responses/${requestId}`);
    expect(res.status).toBe(200);
    const blob = await res.json() as { score: number; verifierResults: unknown[] };
    expect(blob.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(blob.verifierResults)).toBe(true);
  });

  it("returns reputation snapshot for agentId", async () => {
    const res  = await fetch(`${BASE_URL}/reputation/0xTestAgent`);
    expect(res.status).toBe(200);
    const data = await res.json() as { agentId: string; average: number; responseCount: number };
    expect(data.agentId).toBe("0xTestAgent");
    expect(data.responseCount).toBeGreaterThan(0);
    expect(data.average).toBeGreaterThanOrEqual(0);
  });
});
