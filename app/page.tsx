"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount, useChainId, useSwitchChain, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle, Info, ChevronDown, ExternalLink } from "lucide-react";
import { FAUCET_CONTRACT_ADDRESS, ARC_TESTNET_CHAIN_ID } from "@/lib/config/faucet";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";
import { decodeFaucetError, formatRemainingTime } from "@/lib/utils/errorDecoder";
import { arcTestnet } from "@/lib/config/chains";

// App URL - defaults to production domain
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://easyfaucetarc.xyz";

type FaucetStatus =
  | "idle"
  | "loading"
  | "success"
  | "cooldown"
  | "no_funds"
  | "error"
  | "wrong_network"
  | "no_wallet"
  | "paused";

// Helper function to generate or get device ID
function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const key = "arc-faucet:deviceId";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

// Helper function to check cooldown (localStorage - extra layer)
function checkLocalCooldown(address: string): { isInCooldown: boolean; remainingTime: number } {
  if (typeof window === "undefined") {
    return { isInCooldown: false, remainingTime: 0 };
  }

  const deviceId = getDeviceId();
  const addressKey = `arc-faucet:lastClaim:${address.toLowerCase()}`;
  const deviceKey = `arc-faucet:lastClaimDevice:${deviceId}`;

  const lastClaimAddress = localStorage.getItem(addressKey);
  const lastClaimDevice = localStorage.getItem(deviceKey);

  const now = Date.now();
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  let remainingTime = 0;

  if (lastClaimAddress) {
    const addressCooldown = cooldownPeriod - (now - Number.parseInt(lastClaimAddress));
    if (addressCooldown > 0) {
      remainingTime = Math.max(remainingTime, addressCooldown);
    }
  }

  if (lastClaimDevice) {
    const deviceCooldown = cooldownPeriod - (now - Number.parseInt(lastClaimDevice));
    if (deviceCooldown > 0) {
      remainingTime = Math.max(remainingTime, deviceCooldown);
    }
  }

  return {
    isInCooldown: remainingTime > 0,
    remainingTime,
  };
}

// Store successful claim in localStorage
function storeSuccessfulClaim(address: string) {
  if (typeof window === "undefined") return;
  const deviceId = getDeviceId();
  const now = Date.now().toString();
  localStorage.setItem(`arc-faucet:lastClaim:${address.toLowerCase()}`, now);
  localStorage.setItem(`arc-faucet:lastClaimDevice:${deviceId}`, now);
}

export default function FaucetPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus>("idle");
  const [txHash, setTxHash] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [remainingCooldownSeconds, setRemainingCooldownSeconds] = useState<number>(0);
  const [isTutorialExpanded, setIsTutorialExpanded] = useState<boolean>(false);

  // Check if on correct network
  const isWrongNetwork = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;

  // Read contract state
  const { data: canClaimData, refetch: refetchCanClaim } = useReadContract({
    address: FAUCET_CONTRACT_ADDRESS,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "canClaim",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !isWrongNetwork && !!address,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  const { data: paused } = useReadContract({
    address: FAUCET_CONTRACT_ADDRESS,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "paused",
    query: {
      enabled: isConnected && !isWrongNetwork,
    },
  });

  const { data: faucetBalance } = useReadContract({
    address: FAUCET_CONTRACT_ADDRESS,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "faucetBalance",
    query: {
      enabled: isConnected && !isWrongNetwork,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  });

  // Write contract
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

  // Wait for transaction
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({
    hash,
  });

  // Extract canClaim results
  const canClaimResult = useMemo(() => {
    if (!canClaimData) return null;
    return {
      allowed: canClaimData[0] as boolean,
      remainingSeconds: Number(canClaimData[1] as bigint),
    };
  }, [canClaimData]);

  // Update status based on wallet, network, and contract state
  useEffect(() => {
    // Don't override success status - let user see the success message
    if (faucetStatus === "success") {
      return;
    }

    if (!isConnected || !address) {
      setFaucetStatus("no_wallet");
      return;
    }

    if (isWrongNetwork) {
      setFaucetStatus("wrong_network");
      return;
    }

    if (paused === true) {
      setFaucetStatus("paused");
      return;
    }

    // Check contract cooldown (source of truth)
    if (canClaimResult) {
      if (!canClaimResult.allowed && canClaimResult.remainingSeconds > 0) {
        // Contract has active cooldown - use it
        setFaucetStatus("cooldown");
        setRemainingCooldownSeconds(canClaimResult.remainingSeconds);
        return;
      } else if (canClaimResult.allowed) {
        // Contract says we can claim - clear any stale local cooldown
        if (typeof window !== "undefined" && address) {
          const deviceId = getDeviceId();
          localStorage.removeItem(`arc-faucet:lastClaim:${address.toLowerCase()}`);
          localStorage.removeItem(`arc-faucet:lastClaimDevice:${deviceId}`);
        }
        // Don't check local cooldown if contract allows claim
      } else if (!canClaimResult.allowed && canClaimResult.remainingSeconds === 0) {
        // Contract says can't claim but no cooldown - might be empty faucet or other issue
        // Don't set cooldown status, let other checks handle it
      }
    }

    // Check local cooldown only if contract doesn't have data yet
    // Once contract responds, it becomes the source of truth
    if (!canClaimResult) {
      const localCooldown = checkLocalCooldown(address);
      if (localCooldown.isInCooldown) {
        setFaucetStatus("cooldown");
        setRemainingCooldownSeconds(Math.floor(localCooldown.remainingTime / 1000));
        return;
      }
    }

    // Check faucet balance
    if (faucetBalance !== undefined && faucetBalance === BigInt(0)) {
      setFaucetStatus("no_funds");
      return;
    }

    setFaucetStatus("idle");
  }, [isConnected, address, isWrongNetwork, paused, canClaimResult, faucetBalance, faucetStatus]);

  // Handle transaction states
  useEffect(() => {
    if (isPending) {
      setFaucetStatus("loading");
      setTxHash("");
      setErrorMessage("");
      // Clear success status when starting a new claim
    }
  }, [isPending]);

  useEffect(() => {
    if (hash) {
      setTxHash(hash);
    }
  }, [hash]);

  useEffect(() => {
    if (isConfirming && hash) {
      setFaucetStatus("loading");
      setTxHash(hash);
    }
  }, [isConfirming, hash]);

  useEffect(() => {
    if (isConfirmed && hash) {
      setFaucetStatus("success");
      setTxHash(hash);
      if (address) {
        storeSuccessfulClaim(address);
        // Refetch canClaim to update UI
        setTimeout(() => {
          refetchCanClaim();
        }, 2000);
      }
    }
  }, [isConfirmed, hash, address, refetchCanClaim]);

  // Handle errors
  useEffect(() => {
    if (writeError) {
      const decoded = decodeFaucetError(writeError);
      setErrorMessage(decoded.message);
      setRemainingCooldownSeconds(decoded.remainingSeconds || 0);

      if (decoded.type === "CooldownActive") {
        setFaucetStatus("cooldown");
      } else if (decoded.type === "FaucetEmpty" || decoded.type === "InsufficientFaucetBalance") {
        setFaucetStatus("no_funds");
      } else if (decoded.type === "Paused") {
        setFaucetStatus("paused");
      } else {
        setFaucetStatus("error");
      }
    }
  }, [writeError]);

  useEffect(() => {
    if (receiptError) {
      const decoded = decodeFaucetError(receiptError);
      setErrorMessage(decoded.message);
      setFaucetStatus("error");
    }
  }, [receiptError]);

  const handleClaim = async () => {
    if (!address || isWrongNetwork) return;

    try {
      // Clear previous success/error messages when starting a new claim
      setFaucetStatus("loading");
      setErrorMessage("");
      writeContract({
        address: FAUCET_CONTRACT_ADDRESS,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "claim",
      });
    } catch (error) {
      console.error("Claim error:", error);
      const decoded = decodeFaucetError(error);
      setErrorMessage(decoded.message);
      setFaucetStatus("error");
    }
  };

  const handleSwitchNetwork = () => {
    if (switchChain) {
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID });
    }
  };

  const isClaimDisabled =
    !isConnected ||
    isWrongNetwork ||
    faucetStatus === "loading" ||
    faucetStatus === "cooldown" ||
    faucetStatus === "paused" ||
    paused === true ||
    (canClaimResult !== null && canClaimResult !== undefined && !canClaimResult.allowed);

  const explorerUrl = `${arcTestnet.blockExplorers?.default.url}/tx/${txHash}`;

  // Twitter share URL
  const tweetText = `I'm claiming 100 USDC on ARC testnet using Easy Faucet Arc to power my dApp testing! 🚀

@ARC ${APP_URL}

#ARC #DeFi #Web3 #ARCTestnet`;
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#020617" }}>
      <Card className="w-full max-w-[560px] p-8 shadow-2xl" style={{ background: "#050B18", borderColor: "#1E293B" }}>
        {/* Header */}
        <div className="text-center space-y-4 mb-8">
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-medium"
            style={{ background: "linear-gradient(90deg, #2F2CFF, #C035FF)", color: "#F9FAFB" }}
          >
            ARC Testnet
          </div>
          <h1 className="text-3xl font-bold text-balance" style={{ color: "#F9FAFB" }}>
            Easy Faucet Arc Testnet
          </h1>
          <p className="text-sm leading-relaxed text-balance" style={{ color: "#9CA3AF" }}>
            Get up to 100 USDC (testnet) to develop on the ARC Network. The official faucet only provides 1 USDC per
            hour.
          </p>
        </div>

        {/* Wallet Connection - Centralized and Styled */}
        <div className="mb-6 flex items-center justify-center w-full">
          <div className="w-full max-w-[400px] flex justify-center">
            <ConnectButton showBalance={false} />
          </div>
        </div>

        {/* Faucet Balance - Discreet Info */}
        {faucetBalance !== undefined && (
          <div className="mb-4 text-center">
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Available: {Number(faucetBalance) / 1_000_000} USDC (testnet)
            </p>
          </div>
        )}

        {/* Alerts */}
        <div className="space-y-4 mb-6">
          {faucetStatus === "no_wallet" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#1E293B" }}>
              <Info className="h-4 w-4" style={{ color: "#9CA3AF" }} />
              <AlertDescription style={{ color: "#9CA3AF" }}>
                Connect your wallet to request testnet funds.
              </AlertDescription>
            </Alert>
          )}

          {faucetStatus === "wrong_network" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Wrong network</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                Please switch to the ARC Testnet to use this faucet.
              </AlertDescription>
              <Button
                onClick={handleSwitchNetwork}
                size="sm"
                className="mt-3"
                style={{ background: "#EF4444", color: "#F9FAFB" }}
              >
                Switch Network
              </Button>
            </Alert>
          )}

          {faucetStatus === "paused" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Faucet paused</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                The faucet is temporarily paused for maintenance. Please try again later.
              </AlertDescription>
            </Alert>
          )}

          {faucetStatus === "success" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#22C55E" }}>
              <CheckCircle2 className="h-5 w-5" style={{ color: "#22C55E" }} />
              <AlertTitle style={{ color: "#22C55E", fontSize: "18px", fontWeight: "600" }}>
                ✅ Claim Successful!
              </AlertTitle>
              <AlertDescription style={{ color: "#E5E7EB" }} className="mt-3 space-y-2">
                <p className="text-base">
                  <strong>100 USDC (testnet)</strong> has been sent to your wallet address.
                </p>
                <p className="text-sm" style={{ color: "#9CA3AF" }}>
                  It may take a few moments to appear in your wallet.
                </p>
                {txHash && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: "#1F2937" }}>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:opacity-80"
                      style={{ 
                        background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
                        color: "#FFFFFF",
                        textDecoration: "none"
                      }}
                    >
                      <span>View Transaction</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <p className="mt-2 text-xs font-mono" style={{ color: "#6B7280" }}>
                      {txHash.slice(0, 10)}...{txHash.slice(-8)}
                    </p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {faucetStatus === "cooldown" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Cooldown active</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                You can only request faucet once every 24 hours from this device.
                {remainingCooldownSeconds > 0 && (
                  <span className="block mt-1">
                    Time remaining: {formatRemainingTime(remainingCooldownSeconds)}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {faucetStatus === "no_funds" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Faucet empty</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                The faucet is currently out of funds. Please try again later.
              </AlertDescription>
            </Alert>
          )}

          {faucetStatus === "error" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Something went wrong</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                {errorMessage || "An unexpected error occurred while processing your request. Please try again in a few minutes."}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Claim Button & Twitter Share */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Button
            onClick={handleClaim}
            disabled={isClaimDisabled}
            className="flex-1 font-medium text-base h-14 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isClaimDisabled ? "#1E293B" : "linear-gradient(90deg, #2F2CFF, #C035FF)",
              color: "#F9FAFB",
            }}
          >
            {faucetStatus === "loading" || isPending || isConfirming ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Claiming...
              </>
            ) : (
              "Claim 100 USDC (testnet)"
            )}
          </Button>

          <a
            href={twitterShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Twitter"
            className="inline-flex items-center justify-center gap-2 px-4 h-14 font-medium text-sm rounded-md border transition-colors hover:opacity-90"
            style={{
              background: "#050B18",
              borderColor: "#1E293B",
              color: "#F9FAFB",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1E293B";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#050B18";
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>Share</span>
          </a>
        </div>

        {/* Tutorial Toggle Button */}
        <button
          onClick={() => setIsTutorialExpanded(!isTutorialExpanded)}
          aria-expanded={isTutorialExpanded}
          className="w-full mb-4 text-xs text-center transition-colors hover:opacity-80 flex items-center justify-center gap-2"
          style={{ color: "#9CA3AF" }}
        >
          <span>Do you need more faucets? You should follow this tutorial</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-300 ${isTutorialExpanded ? "rotate-180" : ""}`}
          />
        </button>

        {/* Tutorial Content */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isTutorialExpanded ? "max-h-96 opacity-100 mb-6" : "max-h-0 opacity-0 mb-0"
          }`}
        >
          <div
            className="p-4 rounded-lg border space-y-3"
            style={{ background: "#050B18", borderColor: "#1E293B" }}
          >
            <ol className="space-y-3 text-sm" style={{ color: "#F9FAFB" }}>
              <li className="flex flex-col gap-1">
                <span className="font-medium">
                  1) <span style={{ color: "#9CA3AF" }}>Get assets on Sepolia:</span>
                </span>
                <a
                  href="https://sepolia-faucet.pk910.de/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs break-all hover:underline transition-colors"
                  style={{ color: "#2F2CFF" }}
                >
                  https://sepolia-faucet.pk910.de/
                </a>
              </li>
              <li className="flex flex-col gap-1">
                <span className="font-medium">
                  2) <span style={{ color: "#9CA3AF" }}>Swap the assets using Uniswap (Sepolia):</span>
                </span>
                <a
                  href="https://app.uniswap.org/swap?chain=sepolia&inputCurrency=NATIVE&outputCurrency=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238&value=2.4&field=input"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs break-all hover:underline transition-colors"
                  style={{ color: "#2F2CFF" }}
                >
                  https://app.uniswap.org/swap?chain=sepolia&inputCurrency=NATIVE&outputCurrency=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238&value=2.4&field=input
                </a>
              </li>
              <li className="flex flex-col gap-1">
                <span className="font-medium">
                  3) <span style={{ color: "#9CA3AF" }}>Bridge using Superbridge:</span>
                </span>
                <a
                  href="https://superbridge.app/?fromChainId=11155111&toChainId=5042002"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs break-all hover:underline transition-colors"
                  style={{ color: "#2F2CFF" }}
                >
                  https://superbridge.app/?fromChainId=11155111&toChainId=5042002
                </a>
              </li>
            </ol>
            <p className="text-xs mt-4 pt-3 border-t" style={{ color: "#9CA3AF", borderColor: "#1E293B" }}>
              This process can take up to one hour to complete.
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="space-y-2 p-4 rounded-lg" style={{ background: "#1E293B" }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: "#F9FAFB" }}>
            Faucet Information
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: "#9CA3AF" }}>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>
                The{" "}
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline transition-colors"
                  style={{ color: "#2F2CFF" }}
                >
                  official faucet
                </a>{" "}
                allows only 1 USDC per hour.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>This faucet provides up to 100 USDC per day.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>You can request only once every 24 hours from this device.</span>
            </li>
          </ul>
        </div>
      </Card>

      <footer className="w-full max-w-[560px] mt-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-6">
          <a
            href="https://github.com/brunoamuniz/easyfaucet-arc"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:opacity-80"
            style={{ color: "#9CA3AF" }}
            aria-label="GitHub Repository"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
          <a
            href="https://x.com/yourusername"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:opacity-80"
            style={{ color: "#9CA3AF" }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://linkedin.com/in/yourprofile"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:opacity-80"
            style={{ color: "#9CA3AF" }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
            Easy Faucet Arc Testnet
          </p>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            &copy; {new Date().getFullYear()} Easy Faucet Arc. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
