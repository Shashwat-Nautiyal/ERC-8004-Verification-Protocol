# ERC-8004 Verification Node

A minimal validation protocol built on top of the ERC-8004 Validation Registry.

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

## Prerequisites

- Node.js ≥ 20
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (provides `anvil` + `forge`)

Install Foundry once:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The `.env` is pre-filled with Anvil's default account #0. The only value that changes is `REGISTRY_ADDRESS` — handled automatically by `npm run setup` (see below).

### 3. Start Anvil

```bash
anvil
```

Anvil prints 10 pre-funded accounts on startup. The `.env` uses **account #0** as the validator.

> **Every time you restart Anvil**, run `npm run setup` before `npm run dev` — it redeploys the contract and rewrites `REGISTRY_ADDRESS` in `.env` automatically.

### 4. Deploy the contract and update `.env`

```bash
npm run setup
```

This runs `forge create` against the local Anvil node, parses the deployed address, and writes it into `.env`. No manual copy-paste.

### 5. Start the validator node

```bash
npm run dev
```

Starts both the HTTP server (port 3000) and the 15 s poll loop in one process. Expected output:

```
[INFO] ERC-8004 Verification Node starting...
[INFO]   Registry  : 0x5FbDB...
[INFO]   Router    : 0xf39F...
[INFO]   Validator : 0xf39F...
[INFO] Server listening on port 3000
[INFO] Starting poll loop for router 0xf39F...
```

### 6. Seed a test request

Two options:

**Mock seed** (placeholder signature — scores 0, tests pipeline wiring):
```bash
npm run seed
```

**Signed seed** (real EIP-712 sig + synthetic Uniswap V2 log — scores 100):
```bash
npm run seed:signed
```

`seed:signed` uses Anvil account #1 as the agent. The EIP-712 mandate is signed with a real private key. The Uniswap V2 Swap log is ABI-encoded synthetically — the verifier cannot distinguish it from a real on-chain swap.

### 7. Watch the validator process it

Within 15 s, Terminal 2 prints:

```
[INFO] Processing request 0xabc...
[INFO]   [integrity]    passed=true  score=100 — Signer recovered: 0x7099...
[INFO]   [swap-receipt] passed=true  score=100 — Swap verified: amountIn=1000, amountOut=950
[INFO] Aggregated score for 0xabc...: 100
[INFO] Response posted on-chain — responseURI: http://localhost:3000/responses/0xabc...
```

### 8. Check reputation

```bash
# Via HTTP
curl http://localhost:3000/reputation/0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Via CLI
npm run reputation -- 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Query on-chain events directly (slower)
npm run reputation -- 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --onchain
```

---

## Full Session Workflow

```
# Terminal 1
anvil

# Terminal 2
npm run setup          # deploy contract, auto-update .env
npm run dev            # start validator node

# Terminal 3
npm run seed:signed    # seed a real signed request → score 100
curl http://localhost:3000/reputation/0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

> After every `anvil` restart: run `npm run setup` again before `npm run dev`.

---

## Where `.env` Values Come From

| Variable | Source |
|---|---|
| `RPC_URL` | Anvil's default listen address — always `http://127.0.0.1:8545` |
| `PRIVATE_KEY` | Anvil account #0 private key — printed on Anvil startup |
| `VALIDATOR_ADDRESS` | Public address derived from `PRIVATE_KEY` (account #0) |
| `ROUTER_ADDRESS` | Same as `VALIDATOR_ADDRESS` for MVP — the EOA that filters events |
| `REGISTRY_ADDRESS` | **Set automatically by `npm run setup`** — changes each Anvil session |
| `BASE_URL` | Local Express server — always `http://localhost:3000` |

---

## Running Tests

```bash
# Unit tests — no network, no .env required
npm run test:unit

# Unit tests in watch mode (re-runs on file change)
npm run test:watch

# Integration tests — requires Anvil + deployed contract + validator node running
npm run test:integration
```

Unit tests cover all verifier branches (22 tests), including amounts arriving as strings from JSON.

---

## End-to-End Integration Test

```bash
# Terminal 1
anvil

# Terminal 2
npm run setup && npm run dev

# Terminal 3
npm run test:integration
```

The integration test:
1. Uploads a mock `swap@1` payload to the server
2. Seeds a `ValidationRequest` on-chain
3. Polls up to 45 s for a `ValidationResponse` event
4. Asserts score is in `[0, 100]`
5. Verifies `responseURI` returns a breakdown
6. Verifies `GET /reputation/:agentId` returns a response count ≥ 1

---

## How to Add a New Verifier

**Step 1** — Create `src/verifiers/<name>/index.ts` implementing `IVerifier`:

```typescript
import type { IVerifier, Mandate, Receipt, VerifierResult } from "../../types/index.js";

export class MyVerifier implements IVerifier {
  readonly label = "my-check";

  async verify(mandate: Mandate, receipt?: Receipt): Promise<VerifierResult> {
    const passed = /* check mandate.core or receipt */;
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
  ["swap@1",     [new MandateIntegrityVerifier(), new SwapReceiptVerifier()]],
  ["my-kind@1",  [new MandateIntegrityVerifier(), new MyVerifier()]],
]);
```

**Step 3** — Add unit tests in `tests/unit/verifiers/my-check.test.ts`.

The aggregator automatically includes the new verifier's score in the mean. No other changes needed.

---

## How to Add a New `core.kind`

A `core.kind` is a versioned primitive identifier (`name@version`).

1. Define a payload type in `src/types/mandate.ts`:
   ```typescript
   export type BridgePayload = { fromChain: number; toChain: number; token: string; amount: bigint; };
   export type BridgeMandate = MandateBase<BridgePayload>;
   ```

2. Create a receipt verifier in `src/verifiers/bridge/index.ts`

3. Register in `src/verifiers/registry.ts`:
   ```typescript
   ["bridge@1", [new MandateIntegrityVerifier(), new BridgeReceiptVerifier()]],
   ```

4. The router dispatch is automatic — `getVerifiers(mandate.core.kind)` resolves the pipeline. Unknown kinds fall back to `[MandateIntegrityVerifier]`.

---

## Sybil Resistance

The `MandateIntegrityVerifier` enforces:

> **The recovered EIP-712 signer of the mandate must not equal `VALIDATOR_ADDRESS`.**

This prevents a validator from signing its own mandates and self-scoring them at 100. Any such attempt scores `0`.

The EIP-712 signature covers `mandate.core` **and** a `keccak256` hash of the serialised payload. Swapping the payload after signing is cryptographically impossible.

Additional resistance mechanisms (staking, multi-validator quorum, stake-weighted aggregation) are out of scope for MVP but can be layered on top of the `IVerifier` interface without changing the aggregator.

---

## Scoring Model

| Verifier | What it checks | Score |
|---|---|---|
| `integrity` | Fields present, deadline fresh, EIP-712 sig valid, signer ≠ validator | 0 or 100 |
| `swap-receipt` | Amounts (≥ declared), recipient, chain match on-chain Swap event | 0 or 100 |

Final score: `Math.floor(mean(verifier scores))`, clamped to `[0, 100]`.

| Result | Score |
|---|---|
| Both verifiers pass | 100 |
| One verifier fails | 50 |
| Both verifiers fail | 0 |

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/responses/:requestId` | Full score breakdown (responseURI) |
| `GET` | `/reputation/:agentId` | Average score + history for an agent |
| `GET` | `/responses` | All stored responses |
| `POST` | `/responses` | Internal — router writes here after scoring |
| `POST` | `/mock-payloads` | Dev only — upload a raw payload JSON |
| `GET` | `/mock-payload/:id` | Dev only — serve a stored payload |

---

## npm Scripts Reference

| Script | What it does |
|---|---|
| `npm run setup` | Deploy `ValidationRegistry` to Anvil, update `REGISTRY_ADDRESS` in `.env` |
| `npm run dev` | Start validator node (server + poll loop) |
| `npm run seed` | Seed a mock request (placeholder sig — pipeline test) |
| `npm run seed:signed` | Seed a real EIP-712 signed request (score 100) |
| `npm run reputation -- <addr>` | Print reputation snapshot for an agent |
| `npm run test:unit` | Run all unit tests (22 tests, no network) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:integration` | Run integration test (requires Anvil + node) |
| `npm run build` | Compile TypeScript to `dist/` |
