"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, createStorage } from "wagmi";
import { RainbowKitProvider, getDefaultWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "@/lib/config/chains";

// Import RainbowKit styles
import "@rainbow-me/rainbowkit/styles.css";

// Create a query client with persistence
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// Configure wallets using RainbowKit's getDefaultWallets
// This automatically includes MetaMask, WalletConnect, Coinbase Wallet, etc.
// Note: chains are configured in createConfig below, not here
const { connectors } = getDefaultWallets({
  appName: "Easy Faucet Arc Testnet",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID", // Optional but recommended for WalletConnect
});

// Create storage for persistence
const storage = createStorage({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
});

// Configure wagmi with ARC Testnet
const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true, // Enable SSR for Next.js
  storage, // Persist connection state
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#2F2CFF",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

