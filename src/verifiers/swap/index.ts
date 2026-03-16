import type { IVerifier, Mandate, Receipt, VerifierResult } from "../../types/index.js";
import type { SwapMandate } from "../../types/mandate.js";
import { decodeSwapLogs } from "./logDecoder.js";

export class SwapReceiptVerifier implements IVerifier {
  readonly label = "swap-receipt";

  async verify(mandate: Mandate, receipt?: Receipt): Promise<VerifierResult> {
    if (!receipt) {
      return this.fail("No receipt provided for swap verification");
    }

    const swapMandate = mandate as SwapMandate;
    const { payload } = swapMandate;

    if (!payload?.tokenIn || !payload?.tokenOut) {
      return this.fail("Mandate missing swap payload fields");
    }

    // Decode swap events from receipt logs
    const swaps = decodeSwapLogs(receipt.logs);
    if (swaps.length === 0) {
      return this.fail("No Swap events found in transaction logs");
    }

    const swap = swaps[swaps.length - 1]; // last swap = final output

    // Chain match
    if (receipt.chainId !== mandate.core.chainId) {
      return this.fail(
        `Chain mismatch: mandate=${mandate.core.chainId}, receipt=${receipt.chainId}`
      );
    }

    // Amount in at least what was declared
    if (swap.amountIn < payload.amountIn) {
      return this.fail(
        `amountIn too low: got ${swap.amountIn}, expected >= ${payload.amountIn}`
      );
    }

    // Amount out meets minimum
    if (swap.amountOut < payload.amountOutMin) {
      return this.fail(
        `amountOut below minimum: got ${swap.amountOut}, min=${payload.amountOutMin}`
      );
    }

    // Recipient matches
    if (swap.recipient.toLowerCase() !== payload.recipient.toLowerCase()) {
      return this.fail(
        `Recipient mismatch: got ${swap.recipient}, expected ${payload.recipient}`
      );
    }

    return {
      score:  100,
      label:  this.label,
      passed: true,
      detail: `Swap verified: amountIn=${swap.amountIn}, amountOut=${swap.amountOut}`,
    };
  }

  private fail(detail: string): VerifierResult {
    return { score: 0, label: this.label, passed: false, detail };
  }
}
