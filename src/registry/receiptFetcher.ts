import { ethers } from "ethers";
import { env } from "../utils/env.js";
import type { Receipt, RawLog } from "../types/index.js";

/**
 * Given a Receipt that may have an empty logs array, fetch the full
 * transaction receipt from the RPC and populate logs.
 * Returns the receipt unchanged if logs are already present.
 * Throws if the tx cannot be found on-chain.
 */
export async function hydrateReceiptLogs(receipt: Receipt): Promise<Receipt> {
  if (receipt.logs.length > 0) return receipt;

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const txReceipt = await provider.getTransactionReceipt(receipt.txHash);

  if (!txReceipt) {
    throw new Error(`Transaction not found on-chain: ${receipt.txHash}`);
  }

  const logs: RawLog[] = txReceipt.logs.map((l) => ({
    address: l.address,
    topics:  [...l.topics],
    data:    l.data,
  }));

  return { ...receipt, logs, blockNumber: txReceipt.blockNumber };
}
