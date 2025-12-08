# Deployment Scripts

⚠️ **IMPORTANT**: These scripts contain sensitive information. Never commit the actual scripts with private keys to version control.

## Setup

1. Copy the example files:
   ```bash
   cp scripts/deploy-faucet.sh.example scripts/deploy-faucet.sh
   cp scripts/fund-faucet.sh.example scripts/fund-faucet.sh
   ```

2. Add your private key to the scripts or create a `.env` file:
   ```bash
   # Option 1: Add to .env file (recommended)
   echo "PRIVATE_KEY=0x..." >> .env
   
   # Option 2: Export as environment variable
   export PRIVATE_KEY="0x..."
   ```

3. Make scripts executable:
   ```bash
   chmod +x scripts/deploy-faucet.sh scripts/fund-faucet.sh
   ```

## Scripts

### `deploy-faucet.sh`
Deploys the ArcTestnetFaucet contract to ARC Testnet.

**Usage:**
```bash
./scripts/deploy-faucet.sh
```

### `fund-faucet.sh`
Funds the faucet contract with USDC tokens.

**Usage:**
```bash
# Fund with default amount (1000 USDC)
./scripts/fund-faucet.sh

# Fund with custom amount
./scripts/fund-faucet.sh 500  # 500 USDC
```

## Security Notes

- Never commit `.env` files or scripts with hardcoded private keys
- Use environment variables or `.env` files (which are gitignored)
- The example files (`.example`) are safe to commit
- Always verify the contract addresses before deploying

