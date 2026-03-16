import { ethers } from "ethers";
import type { RawLog } from "../../types/index.js";

// Uniswap V2 Swap(address,uint,uint,uint,uint,address)
const V2_SWAP_TOPIC = ethers.id(
  "Swap(address,uint256,uint256,uint256,uint256,address)"
);

// Uniswap V3 Swap(address,address,int256,int256,uint160,uint128,int24)
const V3_SWAP_TOPIC = ethers.id(
  "Swap(address,address,int256,int256,uint160,uint128,int24)"
);

export type DecodedSwap = {
  version: 2 | 3;
  sender: string;
  recipient: string;
  amountIn: bigint;
  amountOut: bigint;
};

export function decodeSwapLogs(logs: RawLog[]): DecodedSwap[] {
  const results: DecodedSwap[] = [];

  for (const log of logs) {
    if (log.topics[0] === V2_SWAP_TOPIC) {
      results.push(decodeV2(log));
    } else if (log.topics[0] === V3_SWAP_TOPIC) {
      results.push(decodeV3(log));
    }
  }

  return results;
}

function decodeV2(log: RawLog): DecodedSwap {
  const iface = new ethers.Interface([
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  ]);
  const parsed = iface.parseLog({ topics: log.topics, data: log.data })!;
  const amountIn  = (parsed.args.amount0In  as bigint) || (parsed.args.amount1In  as bigint);
  const amountOut = (parsed.args.amount0Out as bigint) || (parsed.args.amount1Out as bigint);
  return {
    version:   2,
    sender:    parsed.args.sender as string,
    recipient: parsed.args.to    as string,
    amountIn,
    amountOut,
  };
}

function decodeV3(log: RawLog): DecodedSwap {
  const iface = new ethers.Interface([
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  ]);
  const parsed = iface.parseLog({ topics: log.topics, data: log.data })!;
  const a0 = parsed.args.amount0 as bigint;
  const a1 = parsed.args.amount1 as bigint;
  return {
    version:   3,
    sender:    parsed.args.sender    as string,
    recipient: parsed.args.recipient as string,
    amountIn:  a0 < 0n ? -a0 : a1 < 0n ? -a1 : a0,
    amountOut: a0 > 0n ?  a0 : a1 > 0n ?  a1 : a1,
  };
}
