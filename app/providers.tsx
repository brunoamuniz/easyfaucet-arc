"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { RainbowKitProvider, getDefaultWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "@/lib/config/chains";

// Import RainbowKit styles
import "@rainbow-me/rainbowkit/styles.css";

// Create a query client
const queryClient = new QueryClient();

// Configure wallets using RainbowKit's getDefaultWallets
// This automatically includes MetaMask, WalletConnect, Coinbase Wallet, etc.
const { connectors } = getDefaultWallets({
  appName: "Easy Faucet Arc Testnet",
  projectId: "YOUR_PROJECT_ID", // TODO: Get from https://cloud.walletconnect.com (optional but recommended)
  chains: [arcTestnet],
});

// Configure wagmi with ARC Testnet
const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true, // Enable SSR for Next.js
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

