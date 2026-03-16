import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mandate } from "../../../src/types/index.js";

// vi.mock must be at module scope — Vitest hoists it before any imports
vi.mock("../../../src/verifiers/integrity/sigVerifier.js", () => ({
  recoverMandateSigner: vi.fn(() => "0xSignerAddress"),
}));

// env is imported by the verifier; mock VALIDATOR_ADDRESS to a different value
vi.mock("../../../src/utils/env.js", () => ({
  env: {
    VALIDATOR_ADDRESS: "0xValidatorAddress",
    BASE_URL: "http://localhost:3000",
    RPC_URL: "http://localhost:8545",
    PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001",
    REGISTRY_ADDRESS: "0xRegistry",
    ROUTER_ADDRESS: "0xRouter",
    SERVER_PORT: 3000,
  },
}));

// Import AFTER mocks are declared
const { MandateIntegrityVerifier } = await import("../../../src/verifiers/integrity/index.js");
const { recoverMandateSigner } = await import("../../../src/verifiers/integrity/sigVerifier.js");

const verifier = new MandateIntegrityVerifier();

function makeMandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    core: {
      kind:     "swap@1",
      chainId:  1,
      router:   "0xRouterAddress",
      deadline: Math.floor(Date.now() / 1000) + 3600,
    },
    payload: {},
    signatures: {
      user: "0xvalidSignature",
    },
    ...overrides,
  };
}

describe("MandateIntegrityVerifier", () => {
  beforeEach(() => {
    vi.mocked(recoverMandateSigner).mockReturnValue("0xSignerAddress");
  });

  it("passes a valid mandate", async () => {
    const result = await verifier.verify(makeMandate());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.detail).toMatch(/0xSignerAddress/i);
  });

  it("fails when kind is missing", async () => {
    const mandate = makeMandate();
    (mandate.core as any).kind = "";
    const result = await verifier.verify(mandate);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("fails when router is missing", async () => {
    const mandate = makeMandate();
    (mandate.core as any).router = "";
    const result = await verifier.verify(mandate);
    expect(result.passed).toBe(false);
  });

  it("fails when deadline is in the past", async () => {
    const mandate = makeMandate();
    mandate.core.deadline = Math.floor(Date.now() / 1000) - 1;
    const result = await verifier.verify(mandate);
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/expired/i);
  });

  it("fails when user signature is missing", async () => {
    const mandate = makeMandate();
    mandate.signatures.user = "";
    const result = await verifier.verify(mandate);
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/signature/i);
  });

  it("fails when signature recovery throws", async () => {
    vi.mocked(recoverMandateSigner).mockImplementationOnce(() => {
      throw new Error("bad sig");
    });
    const result = await verifier.verify(makeMandate());
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/recovery failed/i);
  });

  it("fails (sybil) when signer equals validator address", async () => {
    vi.mocked(recoverMandateSigner).mockReturnValueOnce("0xValidatorAddress");
    const result = await verifier.verify(makeMandate());
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/sybil/i);
  });
});
