#!/usr/bin/env node
/**
 * CLI: query the trust snapshot for a given agentId.
 *
 * Usage:
 *   tsx src/reputation/index.ts <agentId>
 *
 * Fetches from GET /reputation/:agentId on the running validator server.
 * Falls back to querying ValidationResponse events on-chain if --onchain flag is set.
 *
 * Examples:
 *   tsx src/reputation/index.ts 0xAgentAddress
 *   tsx src/reputation/index.ts 0xAgentAddress --onchain
 */
import { ethers } from "ethers";
import abi from "../../abis/ValidationRegistry.json" with { type: "json" };
import { env } from "../utils/env.js";

async function main() {
  const agentId   = process.argv[2];
  const onchain   = process.argv.includes("--onchain");

  if (!agentId) {
    console.error("Usage: tsx src/reputation/index.ts <agentId> [--onchain]");
    process.exit(1);
  }

  if (onchain) {
    await queryOnChain(agentId);
  } else {
    await queryServer(agentId);
  }
}

async function queryServer(agentId: string): Promise<void> {
  const url = `${env.BASE_URL}/reputation/${encodeURIComponent(agentId)}`;
  const res = await fetch(url);

  if (res.status === 404) {
    console.log(`No responses found for agentId: ${agentId}`);
    return;
  }
  if (!res.ok) {
    console.error(`Server error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json() as {
    agentId: string;
    average: number;
    latest: number;
    latestAt: number;
    responseCount: number;
    history: { requestId: string; score: number; timestamp: number }[];
  };

  console.log(`\nReputation for agent: ${data.agentId}`);
  console.log(`  Responses : ${data.responseCount}`);
  console.log(`  Avg score : ${data.average}`);
  console.log(`  Latest    : ${data.latest} (${new Date(data.latestAt * 1000).toISOString()})`);
  console.log("\nHistory:");
  console.log("  RequestId                                                          | Score | Time");
  console.log("  " + "-".repeat(90));
  for (const h of data.history) {
    const time = new Date(h.timestamp * 1000).toISOString();
    console.log(`  ${h.requestId} | ${String(h.score).padStart(5)} | ${time}`);
  }
}

async function queryOnChain(agentId: string): Promise<void> {
  console.log(`Querying on-chain ValidationResponse events (this may be slow)...`);

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const contract  = new ethers.Contract(env.REGISTRY_ADDRESS, abi, provider);
  const events    = await contract.queryFilter(contract.filters.ValidationResponse(), 0, "latest");

  if (events.length === 0) {
    console.log("No ValidationResponse events found on-chain.");
    return;
  }

  // On-chain events don't carry agentId directly; we correlate via responseURI
  // by fetching each response blob from the server store.
  const matching: { requestId: string; score: number; validator: string }[] = [];

  for (const e of events) {
    const log       = e as ethers.EventLog;
    const requestId = log.args[1] as string;
    const score     = Number(log.args[2]);
    const validator = log.args[3] as string;

    // Try to resolve agentId via server
    try {
      const res = await fetch(`${env.BASE_URL}/responses/${requestId}`);
      if (res.ok) {
        const blob = await res.json() as { agentId?: string };
        if (blob.agentId?.toLowerCase() === agentId.toLowerCase()) {
          matching.push({ requestId, score, validator });
        }
      }
    } catch {
      // If server is unreachable, show all events
      matching.push({ requestId, score, validator });
    }
  }

  if (matching.length === 0) {
    console.log(`No on-chain responses found for agentId: ${agentId}`);
    return;
  }

  const avg = Math.floor(matching.reduce((a, b) => a + b.score, 0) / matching.length);
  console.log(`\nOn-chain reputation for agent: ${agentId}`);
  console.log(`  Responses : ${matching.length}`);
  console.log(`  Avg score : ${avg}`);
  console.log("\n  RequestId                                                          | Score");
  console.log("  " + "-".repeat(80));
  for (const m of matching) {
    console.log(`  ${m.requestId} | ${String(m.score).padStart(5)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
