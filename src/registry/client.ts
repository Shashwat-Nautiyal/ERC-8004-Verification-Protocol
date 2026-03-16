import { ethers } from "ethers";
import abi from "../../abis/ValidationRegistry.json" with { type: "json" };
import { env } from "../utils/env.js";
import type { ValidationRequest } from "../types/index.js";

let _contract: ethers.Contract | null = null;

function getContract(): ethers.Contract {
  if (_contract) return _contract;
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);
  _contract = new ethers.Contract(env.REGISTRY_ADDRESS, abi, signer);
  return _contract;
}

export async function readValidationRequest(
  requestId: string
): Promise<ValidationRequest> {
  const contract = getContract();
  const [router, requestURI, requestHash, deadline] =
    await contract.getValidationRequest(requestId);
  return {
    requestId,
    router,
    requestURI,
    requestHash,
    deadline: Number(deadline),
  };
}

export async function writeValidationResponse(
  requestId: string,
  score: number
): Promise<ethers.TransactionReceipt> {
  const contract = getContract();
  const tx = await contract.postValidationResponse(requestId, score);
  return tx.wait();
}
