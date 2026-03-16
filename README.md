# ERC-8004 Verification Node

A minimal validation protocol built on top of the [ERC-8004 Validation Registry](https://eips.ethereum.org/EIPS/eip-8004).

Given a signed **Mandate** (what an agent was asked to do) and an **action receipt** (what the agent actually did), this node produces a deterministic 0–100 validation score and writes it on-chain.

---

## Architecture

```
ValidationRegistry (on-chain)
        │  ValidationRequest event
        ▼
  ┌─────────────────────────────────────┐
  │           Router (Poll Loop)         │
  │  1. poll events (15 s tick)          │
  │  2. fetch + keccak256 verify payload │
  │  3. hydrate receipt logs from RPC    │
  │  4. dispatch to verifier pipeline    │
  │  5. aggregate → floor(mean) [0,100]  │
  │  6. save breakdown to store          │
  │  7. post validationResponse on-chain │
  └───────────────┬─────────────────────┘
                  │
  ┌───────────────▼─────────────────────┐
  │         Express HTTP Server          │
  │  POST /responses          (internal) │
  │  GET  /responses/:id      responseURI│
  │  GET  /reputation/:agentId  CLI/API  │
  │  POST /mock-payloads        (dev)    │
  │  GET  /mock-payload/:id     (dev)    │
  └─────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- [Anvil](https://book.getfoundry.sh/anvil/) for local testing
- A deployed `ValidationRegistry` contract (ERC-8004)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0x<validator-private-key>
REGISTRY_ADDRESS=0x<deployed-registry>
ROUTER_ADDRESS=0x<this-validator-address>
VALIDATOR_ADDRESS=0x<this-validator-address>   # same as ROUTER_ADDRESS for MVP
BASE_URL=http://localhost:3000
```

> `VALIDATOR_ADDRESS` is used for **sybil resistance** — mandates signed by this address are rejected.

### 3. Run the node (development)

```bash
npm run dev
```

This starts both the HTTP server and the poll loop in one process.

### 4. Seed a test request

```bash
npm run seed
```

This builds a mock `swap@1` payload, uploads it to the server, and calls `validationRequest()` on the registry.

### 5. Watch the validator process it

The poll loop will detect the event within 15 s, verify the mandate, aggregate scores, and post the response on-chain. Logs show per-verifier results:

```
[INFO] Processing request 0xabc...
[INFO]   [integrity]    passed=true  score=100 — Signer recovered: 0x...
[INFO]   [swap-receipt] passed=true  score=100 — Swap verified: amountIn=...
[INFO] Aggregated score for 0xabc...: 100
[INFO] Response posted on-chain — responseURI: http://localhost:3000/responses/0xabc...
```

### 6. Check reputation

```bash
# Via HTTP
curl http://localhost:3000/reputation/0xYourAgentId

# Via CLI
npm run reputation -- 0xYourAgentId

# Query on-chain events directly
npm run reputation -- 0xYourAgentId --onchain
```

---

## Running Tests

```bash
# Unit tests only (no network required)
npm run test:unit

# Integration tests (requires Anvil + validator node running)
npm run test:integration

# All unit tests with watch mode
npm run test:watch
```

---

## End-to-End Flow

```bash
# Terminal 1: start Anvil
anvil

# Terminal 2: deploy registry, then start the validator node
npm run dev

# Terminal 3: run full e2e script
npm run e2e
```

The e2e script:
1. Builds and uploads a mock `swap@1` payload
2. Seeds a `ValidationRequest` on-chain
3. Polls until a `ValidationResponse` appears
4. Asserts score is in `[0, 100]`
5. Verifies the `responseURI` returns a score breakdown

---

## How to Add a New Verifier

**Step 1** — Create `src/verifiers/<name>/index.ts` implementing `IVerifier`:

```typescript
import type { IVerifier, Mandate, Receipt, VerifierResult } from "../../types/index.js";

export class MyVerifier implements IVerifier {
  readonly label = "my-check";

  async verify(mandate: Mandate, receipt?: Receipt): Promise<VerifierResult> {
    // scoring logic tied to mandate.core attributes
    const passed = /* your check */;
    return {
      score:  passed ? 100 : 0,
      label:  this.label,
      passed,
      detail: "explanation",
    };
  }
}
```

**Step 2** — Register it in `src/verifiers/registry.ts`:

```typescript
import { MyVerifier } from "./my-name/index.js";

export const verifierRegistry: Map<string, IVerifier[]> = new Map([
  ["swap@1", [new MandateIntegrityVerifier(), new SwapReceiptVerifier()]],
  ["my-kind@1", [new MandateIntegrityVerifier(), new MyVerifier()]],
]);
```

**Step 3** — Add unit tests in `tests/unit/verifiers/my-check.test.ts`.

The aggregator automatically includes the new verifier's score in the mean.

---

## How to Add a New `core.kind`

A `core.kind` is a versioned primitive identifier (format: `name@version`).

1. Define a payload type in `src/types/mandate.ts`:
   ```typescript
   export type BridgePayload = { fromChain: number; toChain: number; token: string; amount: bigint; };
   export type BridgeMandate = MandateBase<BridgePayload>;
   ```

2. Create a receipt verifier in `src/verifiers/bridge/index.ts`

3. Add the mapping to `src/verifiers/registry.ts`:
   ```typescript
   ["bridge@1", [new MandateIntegrityVerifier(), new BridgeReceiptVerifier()]],
   ```

4. The router's dispatch is automatic — `getVerifiers(mandate.core.kind)` resolves the pipeline.

---

## Sybil Resistance

The `MandateIntegrityVerifier` enforces one hard rule:

> **The recovered EIP-712 signer of the mandate must not equal `VALIDATOR_ADDRESS`.**

This prevents a validator from writing mandates for itself and self-scoring them at 100. Any such attempt is caught during signature recovery and scores `0`.

Additional sybil resistance mechanisms (staking, multi-validator quorum, stake-weighted aggregation) are out of scope for MVP but can be layered on top of the existing `IVerifier` interface without changing the aggregator.

---

## Scoring Model

| Verifier | What it checks | Score |
|---|---|---|
| `integrity` | Fields present, deadline fresh, EIP-712 sig valid, signer ≠ validator | 0 or 100 |
| `swap-receipt` | Token pair, amounts, recipient match on-chain Swap event | 0 or 100 |

Final score: `Math.floor(mean(verifier scores))`, clamped to `[0, 100]`.

With 2 verifiers both passing → `100`. One failing → `50`. Both failing → `0`.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/responses/:requestId` | Full score breakdown (responseURI) |
| `GET` | `/reputation/:agentId` | Average score + history for an agent |
| `GET` | `/responses` | All stored responses |
| `POST` | `/responses` | Internal — router posts here after scoring |
| `POST` | `/mock-payloads` | Dev only — upload a mock payload |
| `GET` | `/mock-payload/:id` | Dev only — serve a mock payload |
