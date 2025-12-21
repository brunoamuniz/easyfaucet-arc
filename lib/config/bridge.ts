import { defineChain } from "viem";
import { arcTestnet } from "./chains";

/**
 * Bridge Configuration
 * 
 * Configuração para bridge automático usando Circle Bridge Kit
 */

// Sepolia Testnet Chain Configuration
export const sepolia = defineChain({
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://sepolia.etherscan.io",
    },
  },
  testnet: true,
});

// Chain configurations for Bridge Kit
export const BRIDGE_CHAINS = {
  sepolia: {
    chain: sepolia,
    name: "Sepolia" as const,
  },
  arc: {
    chain: arcTestnet,
    name: "Arc" as const, // Bridge Kit uses "Arc" for ARC Testnet
  },
} as const;

// Bridge configuration
export const BRIDGE_CONFIG = {
  enabled: process.env.BRIDGE_ENABLED === "true",
  sourceChain: process.env.BRIDGE_SOURCE_CHAIN || "Ethereum_Sepolia",
  targetChain: process.env.BRIDGE_TARGET_CHAIN || "Arc_Testnet",
  minAmount: process.env.BRIDGE_MIN_AMOUNT || "1000", // Minimum USDC to bridge
  timeout: parseInt(process.env.BRIDGE_TIMEOUT || "900000"), // 15 minutes default
} as const;
