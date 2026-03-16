export type Receipt = {
  txHash: string;
  blockNumber: number;
  chainId: number;
  from: string;
  to: string;
  logs: RawLog[];
};

export type RawLog = {
  address: string;
  topics: string[];
  data: string;
};

export type SwapReceipt = Receipt & {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  recipient: string;
};
