#!/bin/bash

# Deploy ArcTestnetFaucet contract to ARC Testnet
# 
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Make sure to set PRIVATE_KEY and ARC_TESTNET_RPC_URL in .env file

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    echo "Please create .env file with PRIVATE_KEY and ARC_TESTNET_RPC_URL"
    exit 1
fi

# Check if required variables are set
if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY not set in .env file"
    exit 1
fi

if [ -z "$ARC_TESTNET_RPC_URL" ]; then
    echo "Error: ARC_TESTNET_RPC_URL not set in .env file"
    exit 1
fi

# USDC Testnet address on ARC Testnet
USDC_TOKEN="0x3600000000000000000000000000000000000000"

# Claim amount: 100 USDC (6 decimals)
# 100 * 10^6 = 100,000,000
CLAIM_AMOUNT="100000000"

# Cooldown: 24 hours in seconds
COOLDOWN="86400"

echo "🚀 Deploying ArcTestnetFaucet to ARC Testnet..."
echo ""
echo "Configuration:"
echo "  USDC Token: $USDC_TOKEN"
echo "  Claim Amount: $CLAIM_AMOUNT (100 USDC)"
echo "  Cooldown: $COOLDOWN seconds (24 hours)"
echo "  RPC URL: $ARC_TESTNET_RPC_URL"
echo ""

# Deploy the contract
forge create contracts/ArcTestnetFaucet.sol:ArcTestnetFaucet \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --constructor-args "$USDC_TOKEN" "$CLAIM_AMOUNT" "$COOLDOWN" \
  --broadcast \
  --verify

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Copy the deployed contract address from above"
echo "  2. Update lib/config/faucet.ts with the contract address"
echo "  3. Fund the contract with USDC testnet tokens"
echo ""

