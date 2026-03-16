import { ethers } from "ethers";
import abi from "../../abis/ValidationRegistry.json" with { type: "json" };
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";
import type { ValidationRequest } from "../types/index.js";

export async function pollValidationRequests(
  routerAddress: string,
  fromBlock: number,
  toBlock: number | "latest" = "latest"
): Promise<ValidationRequest[]> {
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const contract = new ethers.Contract(env.REGISTRY_ADDRESS, abi, provider);

  const filter = contract.filters.ValidationRequest(routerAddress);
  const events = await contract.queryFilter(filter, fromBlock, toBlock);

  logger.info(`Found ${events.length} ValidationRequest event(s) for router ${routerAddress}`);

  return events.map((e) => {
    const log = e as ethers.EventLog;
    return {
      router:      log.args[0] as string,
      requestId:   log.args[1] as string,
      requestURI:  log.args[2] as string,
      requestHash: log.args[3] as string,
      deadline:    Number(log.args[4]),
    };
  });
}
