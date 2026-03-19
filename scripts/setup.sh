#!/usr/bin/env bash
# Deploy ValidationRegistry to a fresh Anvil session and auto-update .env.
# Run this once after every `anvil` restart, before `npm run dev`.
#
# Usage:
#   bash scripts/setup.sh
#   npm run setup          ← same thing via package.json

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
FORGE="$HOME/.foundry/bin/forge"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.example first:"
  echo "  cp .env.example .env"
  exit 1
fi

source "$ENV_FILE"

echo "Deploying ValidationRegistry..."
echo "  RPC : $RPC_URL"
echo "  From: $VALIDATOR_ADDRESS"
echo ""

OUTPUT=$("$FORGE" create \
  "$ROOT/contracts/ValidationRegistry.sol:ValidationRegistry" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast 2>&1)

echo "$OUTPUT"
echo ""

REGISTRY_ADDRESS=$(echo "$OUTPUT" | grep "Deployed to:" | awk '{print $3}')

if [ -z "$REGISTRY_ADDRESS" ]; then
  echo "ERROR: Could not parse deployed address from forge output."
  exit 1
fi

# Update REGISTRY_ADDRESS in .env (works on Linux and macOS)
sed -i "s|^REGISTRY_ADDRESS=.*|REGISTRY_ADDRESS=$REGISTRY_ADDRESS|" "$ENV_FILE"

echo "✓ .env updated:"
echo "  REGISTRY_ADDRESS=$REGISTRY_ADDRESS"
echo ""
echo "Next: npm run dev"
