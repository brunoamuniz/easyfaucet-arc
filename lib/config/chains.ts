import { defineChain } from "viem";

/**
 * ARC Testnet Chain Configuration
 * 
 * Based on: https://docs.arc.network/arc/tutorials/deploy-on-arc
 * 
 * Chain ID: 5042002 (from MetaMask network configuration)
 * RPC URL: https://rpc.testnet.arc.network
 * Block Explorer: https://testnet.arcscan.app
 */
export const arcTestnet = defineChain({
  id: 5042002, // ARC Testnet chain ID (from MetaMask configuration)
  name: "ARC Testnet",
  nativeCurrency: {
    decimals: 18, // MetaMask requires 18 decimals for native currency
    name: "USD Coin",
    symbol: "USDC", // ARC uses USDC as native gas token
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"], // From Arc documentation
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app", // ARC Testnet Explorer
    },
  },
  testnet: true,
});

