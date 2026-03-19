#!/usr/bin/env tsx
/**
 * Seed a ValidationRequest with a real EIP-712 signature and a synthetic
 * Uniswap V2 Swap log — produces score 100 end-to-end without deploying Uniswap.
 *
 * Uses Anvil account #1 (0x7099...) as the agent.
 * The validator is account #0 — sybil check passes because signer ≠ validator.
 *
 * Usage:
 *   tsx scripts/seed-signed.ts
 *
 * Then watch Terminal 2 (npm run dev) print:
 *   [integrity]    passed=true  score=100
 *   [swap-receipt] passed=true  score=100
 *   Aggregated score: 100
 */
import { ethers } from "ethers";
import abi from "../abis/ValidationRegistry.json" with { type: "json" };
import "dotenv/config";

const RPC_URL          = process.env["RPC_URL"]!;
const PRIVATE_KEY      = process.env["PRIVATE_KEY"]!;   // account #0 — submits tx
const REGISTRY_ADDRESS = process.env["REGISTRY_ADDRESS"]!;
const ROUTER_ADDRESS   = process.env["ROUTER_ADDRESS"]!;
const BASE_URL         = process.env["BASE_URL"] ?? "http://localhost:3000";

// Anvil account #1 — agent wallet (NOT the validator, sybil check passes)
const AGENT_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const AGENT_ADDRESS     = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// Uniswap V2 Swap event topic
const V2_SWAP_TOPIC = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");

// EIP-712 type — must match sigVerifier.ts exactly
const MANDATE_TYPES = {
  Mandate: [
    { name: "kind",        type: "string"  },
    { name: "chainId",     type: "uint256" },
    { name: "router",      type: "address" },
    { name: "deadline",    type: "uint256" },
    { name: "payloadHash", type: "bytes32" },
  ],
};

async function main() {
  const provider    = new ethers.JsonRpcProvider(RPC_URL);
  const submitter   = new ethers.Wallet(PRIVATE_KEY, provider);
  const agentWallet = new ethers.Wallet(AGENT_PRIVATE_KEY);
  const contract    = new ethers.Contract(REGISTRY_ADDRESS, abi, submitter);

  const chainId  = Number((await provider.getNetwork()).chainId);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // ── 1. Build swap payload (string amounts — JSON-safe) ──────────────────────
  const swapPayload = {
    tokenIn:      "0xTokenA",
    tokenOut:     "0xTokenB",
    amountIn:     "1000",
    amountOutMin: "900",
    recipient:    AGENT_ADDRESS,
  };

  // ── 2. payloadHash — must match what sigVerifier.ts computes ────────────────
  //    sigVerifier: keccak256(toUtf8Bytes(JSON.stringify(mandate.payload)))
  const payloadHashHex = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(swapPayload))
  );

  // ── 3. EIP-712 sign with the AGENT wallet ───────────────────────────────────
  const domain = {
    name:              "ERC-8004",
    version:           "1",
    chainId,
    verifyingContract: ROUTER_ADDRESS,
  };

  const mandateValue = {
    kind:        "swap@1",
    chainId,
    router:      ROUTER_ADDRESS,
    deadline,
    payloadHash: payloadHashHex,
  };

  const userSignature = await agentWallet.signTypedData(domain, MANDATE_TYPES, mandateValue);
  console.log("EIP-712 signature:", userSignature.slice(0, 20) + "...");

  // ── 4. Synthetic Uniswap V2 Swap log ────────────────────────────────────────
  //    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In,
  //               uint256 amount0Out, uint256 amount1Out, address indexed to)
  //
  //    amount0In=1000 → amountIn=1000  (>= mandate.amountIn of 1000) ✓
  //    amount1Out=950 → amountOut=950  (>= mandate.amountOutMin of 900) ✓
  //    to=AGENT_ADDRESS                (== mandate.recipient) ✓
  const syntheticLog = {
    address: "0x0000000000000000000000000000000000000001",  // fake pair
    topics: [
      V2_SWAP_TOPIC,
      ethers.zeroPadValue(AGENT_ADDRESS, 32),  // sender (indexed)
      ethers.zeroPadValue(AGENT_ADDRESS, 32),  // to/recipient (indexed)
    ],
    data: ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256", "uint256"],
      [1000n, 0n, 0n, 950n]  // amount0In, amount1In, amount0Out, amount1Out
    ),
  };

  // ── 5. Full RouterPayload ────────────────────────────────────────────────────
  const routerPayload = {
    agentId: AGENT_ADDRESS,
    mandate: {
      core: { kind: "swap@1", chainId, router: ROUTER_ADDRESS, deadline },
      payload: swapPayload,
      signatures: { user: userSignature },
    },
    receipt: {
      txHash:      "0x" + "aa".repeat(32),  // placeholder — logs are pre-filled
      blockNumber: await provider.getBlockNumber(),
      chainId,
      from:        AGENT_ADDRESS,
      to:          ROUTER_ADDRESS,
      logs:        [syntheticLog],          // hydrateReceiptLogs skips RPC fetch when logs.length > 0
    },
  };

  const payloadJson = JSON.stringify(routerPayload);
  const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payloadJson));
  const requestId   = ethers.hexlify(ethers.randomBytes(32));
  const requestURI  = `${BASE_URL}/mock-payload/${requestId}`;

  // ── 6. Upload payload to server ──────────────────────────────────────────────
  const up = await fetch(`${BASE_URL}/mock-payloads`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id: requestId, payload: payloadJson }),
  });
  if (!up.ok) throw new Error(`Failed to upload payload: ${up.status}`);

  // ── 7. Submit ValidationRequest on-chain ────────────────────────────────────
  console.log("\nSeeding signed ValidationRequest...");
  console.log("  requestId :", requestId);
  console.log("  agentId   :", AGENT_ADDRESS);
  console.log("  requestURI:", requestURI);

  const tx      = await contract.validationRequest(ROUTER_ADDRESS, requestId, requestURI, requestHash, deadline);
  const receipt = await tx.wait();
  console.log("  tx block  :", receipt.blockNumber);

  console.log("\nWaiting ~15s for validator to process...");
  console.log(`\nThen check score breakdown:`);
  console.log(`  curl ${BASE_URL}/responses/${requestId}`);
  console.log(`\nAnd reputation:`);
  console.log(`  curl ${BASE_URL}/reputation/${AGENT_ADDRESS}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
