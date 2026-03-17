import { ethers } from "ethers";
import { pollValidationRequests, writeValidationResponse, hydrateReceiptLogs } from "../registry/index.js";
import { getVerifiers } from "../verifiers/registry.js";
import { aggregateScores } from "./aggregator.js";
import { fetchPayload } from "./fetcher.js";
import { saveResponse } from "../server/store.js";
import { logger } from "../utils/logger.js";
import { env } from "../utils/env.js";
import type { ValidationRequest } from "../types/index.js";

const POLL_INTERVAL_MS = 15_000;
const processed = new Set<string>();

export async function startPollLoop(routerAddress: string): Promise<void> {
  logger.info(`Starting poll loop for router ${routerAddress}`);

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  let fromBlock = await provider.getBlockNumber();

  const tick = async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      const requests = await pollValidationRequests(routerAddress, fromBlock, currentBlock);

      for (const req of requests) {
        if (processed.has(req.requestId)) continue;
        processed.add(req.requestId);
        await processRequest(req).catch((err) =>
          logger.error(`Error processing ${req.requestId}: ${String(err)}`)
        );
      }

      // Advance so next tick only scans new blocks
      fromBlock = currentBlock + 1;
    } catch (err) {
      logger.error(`Poll tick failed: ${String(err)}`);
    }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

async function processRequest(req: ValidationRequest): Promise<void> {
  logger.info(`Processing request ${req.requestId}`);

  // 1. Fetch and hash-verify payload (throws on mismatch — hard abort)
  const payload = await fetchPayload(req.requestURI, req.requestHash);

  // 2. Hydrate receipt logs from RPC if the client submitted only a txHash
  if (payload.receipt) {
    payload.receipt = await hydrateReceiptLogs(payload.receipt);
  }

  // 3. Select verifiers for mandate kind
  const kind = payload.mandate.core.kind;
  const verifiers = getVerifiers(kind);

  // 4. Run all verifiers — a crash in one scores 0, does not abort the pipeline
  const verifierResults = await Promise.all(
    verifiers.map((v) =>
      v.verify(payload.mandate, payload.receipt).catch((err) => ({
        score:  0,
        label:  v.label,
        passed: false,
        detail: String(err),
      }))
    )
  );

  verifierResults.forEach((r) =>
    logger.info(`  [${r.label}] passed=${r.passed} score=${r.score}${r.detail ? ` — ${r.detail}` : ""}`)
  );

  // 5. Aggregate
  const score = aggregateScores(verifierResults);
  logger.info(`Aggregated score for ${req.requestId}: ${score}`);

  // 6. Save response + breakdown to local store (serves responseURI)
  const timestamp = Math.floor(Date.now() / 1000);
  const responseURI = `${env.BASE_URL}/responses/${req.requestId}`;

  saveResponse(req.requestId, {
    requestId:       req.requestId,
    score,
    validator:       env.VALIDATOR_ADDRESS,
    timestamp,
    agentId:         payload.agentId,
    verifierResults,
  });

  // 7. Post response on-chain
  await writeValidationResponse(req.requestId, score);
  logger.info(`Response posted on-chain for ${req.requestId} — responseURI: ${responseURI}`);
}
