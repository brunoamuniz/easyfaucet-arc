/**
 * Faucet Contract Configuration
 * 
 * TODO: Replace placeholder values after deployment:
 * - FAUCET_CONTRACT_ADDRESS: Deployed faucet contract address
 * - USDC_TESTNET_ADDRESS: USDC testnet token address on ARC Testnet
 * - ARC_TESTNET_CHAIN_ID: Actual ARC Testnet chain ID
 */

// Deployed faucet contract address on ARC Testnet (with claimFor function - gasless + totalClaims counter)
export const FAUCET_CONTRACT_ADDRESS = "0x554F2856926326dE250f0e855654c408E2822430" as const;

// USDC testnet token address on ARC Testnet
// Source: https://testnet.arcscan.app/token/0x3600000000000000000000000000000000000000
export const USDC_TESTNET_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// EURC testnet token address on ARC Testnet
// TODO: Replace with actual EURC testnet token address after deployment
export const EURC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// USDC faucet contract address on ARC Testnet
export const USDC_FAUCET_ADDRESS = FAUCET_CONTRACT_ADDRESS;

// EURC faucet contract address on ARC Testnet
// TODO: Replace with actual EURC faucet contract address after deployment
export const EURC_FAUCET_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ARC Testnet chain ID (from MetaMask configuration)
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Claim amount: 100 USDC (assuming 6 decimals like standard USDC)
export const CLAIM_AMOUNT = BigInt(100 * 10 ** 6); // 100 * 10^6 = 100,000,000 (100 USDC with 6 decimals)

// Cooldown: 24 hours in seconds
export const COOLDOWN_SECONDS = 24 * 60 * 60; // 86400 seconds

