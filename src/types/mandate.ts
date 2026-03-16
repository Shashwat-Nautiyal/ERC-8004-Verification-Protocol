export type MandateCore = {
  kind: string;         // versioned primitive, e.g. "swap@1", "bridge@1"
  chainId: number;
  router: string;       // checksummed address
  deadline: number;     // unix timestamp
};

export type SwapPayload = {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutMin: bigint;
  recipient: string;
};

export type Signatures = {
  user: string;         // EIP-712 signature from the user
  relayer?: string;     // optional relayer co-signature
};

export type MandateBase<P = unknown> = {
  core: MandateCore;
  payload: P;
  signatures: Signatures;
};

export type Mandate = MandateBase<unknown>;
export type SwapMandate = MandateBase<SwapPayload>;
