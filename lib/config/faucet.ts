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
// Source: https://testnet.arcscan.app/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
export const EURC_TESTNET_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

// USDC faucet contract address on ARC Testnet
export const USDC_FAUCET_ADDRESS = FAUCET_CONTRACT_ADDRESS;

// EURC faucet contract address on ARC Testnet
// Deployed with claim amount: 50 EURC (6 decimals)
// Source: Deployed via script/DeployEurc.s.sol
export const EURC_FAUCET_ADDRESS = "0x8b14f3Aa7182243e95C8a8BAE843D33EE6f3B539" as const;

// ARC Testnet chain ID (from MetaMask configuration)
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Claim amounts per token (6 decimals for both USDC and EURC)
export const CLAIM_AMOUNT_USDC = BigInt(100 * 10 ** 6); // 100 * 10^6 = 100,000,000 (100 USDC with 6 decimals)
export const CLAIM_AMOUNT_EURC = BigInt(10 * 10 ** 6); // 10 * 10^6 = 10,000,000 (10 EURC with 6 decimals)

// Legacy: Keep CLAIM_AMOUNT for backward compatibility (defaults to USDC)
export const CLAIM_AMOUNT = CLAIM_AMOUNT_USDC;

// Cooldown: 24 hours in seconds
export const COOLDOWN_SECONDS = 24 * 60 * 60; // 86400 seconds

