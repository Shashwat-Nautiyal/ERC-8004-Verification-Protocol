import { describe, it, expect, vi } from "vitest";
import { SwapReceiptVerifier } from "../../../src/verifiers/swap/index.js";
import type { Mandate, Receipt } from "../../../src/types/index.js";
import type { SwapMandate } from "../../../src/types/mandate.js";

const verifier = new SwapReceiptVerifier();

function makeMandate(): SwapMandate {
  return {
    core: {
      kind:     "swap@1",
      chainId:  1,
      router:   "0xRouter",
      deadline: Math.floor(Date.now() / 1000) + 3600,
    },
    payload: {
      tokenIn:      "0xTokenIn",
      tokenOut:     "0xTokenOut",
      amountIn:     100n,
      amountOutMin: 90n,
      recipient:    "0xRecipient",
    },
    signatures: { user: "0xsig" },
  };
}

function makeReceipt(): Receipt {
  return {
    txHash:      "0xabc",
    blockNumber: 100,
    chainId:     1,
    from:        "0xFrom",
    to:          "0xRouter",
    logs:        [], // will be mocked
  };
}

vi.mock("../../../src/verifiers/swap/logDecoder.js", () => ({
  decodeSwapLogs: vi.fn(() => [
    {
      version:   2,
      sender:    "0xRouter",
      recipient: "0xRecipient",
      amountIn:  100n,
      amountOut: 95n,
    },
  ]),
}));

describe("SwapReceiptVerifier", () => {
  it("passes a matching swap", async () => {
    const result = await verifier.verify(makeMandate() as Mandate, makeReceipt());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it("fails without a receipt", async () => {
    const result = await verifier.verify(makeMandate() as Mandate);
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/receipt/i);
  });

  it("fails on chain mismatch", async () => {
    const receipt = makeReceipt();
    receipt.chainId = 42;
    const result = await verifier.verify(makeMandate() as Mandate, receipt);
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/chain/i);
  });

  it("fails when amountOut is below minimum", async () => {
    const { decodeSwapLogs } = await import("../../../src/verifiers/swap/logDecoder.js");
    vi.mocked(decodeSwapLogs).mockReturnValueOnce([
      { version: 2, sender: "0x", recipient: "0xRecipient", amountIn: 100n, amountOut: 50n },
    ]);
    const result = await verifier.verify(makeMandate() as Mandate, makeReceipt());
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/minimum/i);
  });

  it("fails on recipient mismatch", async () => {
    const { decodeSwapLogs } = await import("../../../src/verifiers/swap/logDecoder.js");
    vi.mocked(decodeSwapLogs).mockReturnValueOnce([
      { version: 2, sender: "0x", recipient: "0xWrongAddr", amountIn: 100n, amountOut: 95n },
    ]);
    const result = await verifier.verify(makeMandate() as Mandate, makeReceipt());
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/recipient/i);
  });

  it("fails when no swap logs found", async () => {
    const { decodeSwapLogs } = await import("../../../src/verifiers/swap/logDecoder.js");
    vi.mocked(decodeSwapLogs).mockReturnValueOnce([]);
    const result = await verifier.verify(makeMandate() as Mandate, makeReceipt());
    expect(result.passed).toBe(false);
  });

  it("passes when amounts are strings (as received from JSON.parse)", async () => {
    const mandate = makeMandate();
    // Simulate what JSON.parse produces — amounts are strings, not BigInts
    (mandate.payload as unknown as Record<string, unknown>).amountIn     = "100";
    (mandate.payload as unknown as Record<string, unknown>).amountOutMin = "90";
    const result = await verifier.verify(mandate as Mandate, makeReceipt());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
