/**
 * Faucet Contract Configuration
 * 
 * TODO: Replace placeholder values after deployment:
 * - FAUCET_CONTRACT_ADDRESS: Deployed faucet contract address
 * - USDC_TESTNET_ADDRESS: USDC testnet token address on ARC Testnet
 * - ARC_TESTNET_CHAIN_ID: Actual ARC Testnet chain ID
 */

// TODO: Replace with deployed faucet contract address
export const FAUCET_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// TODO: Replace with USDC testnet token address on ARC Testnet
export const USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ARC Testnet chain ID (from MetaMask configuration)
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Claim amount: 100 USDC (assuming 6 decimals like standard USDC)
export const CLAIM_AMOUNT = BigInt(100 * 10 ** 6); // 100 * 10^6 = 100,000,000 (100 USDC with 6 decimals)

// Cooldown: 24 hours in seconds
export const COOLDOWN_SECONDS = 24 * 60 * 60; // 86400 seconds

