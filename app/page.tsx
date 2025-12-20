"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount, useChainId, useSwitchChain, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, AlertCircle, Info, ChevronDown, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAddress } from "viem";
import { FAUCET_CONTRACT_ADDRESS, ARC_TESTNET_CHAIN_ID, USDC_FAUCET_ADDRESS, EURC_FAUCET_ADDRESS } from "@/lib/config/faucet";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";
import { decodeFaucetError, formatRemainingTime } from "@/lib/utils/errorDecoder";
import { arcTestnet } from "@/lib/config/chains";
import { ProjectsShowcase } from "@/components/projects-showcase";

// App URL - defaults to production domain
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://easyfaucetarc.xyz";

// Claim amounts per token (6 decimals for both USDC and EURC)
const CLAIM_AMOUNTS = {
  USDC: 100,
  EURC: 50, // Reduced from 100 to 50
} as const;

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

// Rate limiting: Maximum 20 claims per 24 hours per device (shared between USDC and EURC)
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

// Check rate limit in localStorage (read-only, doesn't increment)
// Shared between USDC and EURC - uses device ID
function checkRateLimitLocal(): { allowed: boolean; remainingRequests: number; resetTime: number } {
  if (typeof window === "undefined") {
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime: 0 };
  }

  const deviceId = getDeviceId();
  // Shared key for both tokens
  const key = `arc-faucet:rateLimit:${deviceId}`;
  const stored = localStorage.getItem(key);

  const now = Date.now();

  if (!stored) {
    // No record yet - user hasn't made any claims
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime: 0 };
  }

  try {
    const record = JSON.parse(stored) as { count: number; resetTime: number };

    // Check if window has expired
    if (now > record.resetTime) {
      // Window expired - reset available
      return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime: 0 };
    }

    // Check if limit exceeded
    if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
      return { 
        allowed: false, 
        remainingRequests: 0, 
        resetTime: record.resetTime 
      };
    }

    // Still within limit
    return { 
      allowed: true, 
      remainingRequests: RATE_LIMIT_MAX_REQUESTS - record.count, 
      resetTime: record.resetTime 
    };
  } catch (error) {
    // If parsing fails, treat as no limit
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime: 0 };
  }
}

// Increment rate limit counter (called after successful claim)
// Shared between USDC and EURC
function incrementRateLimit() {
  if (typeof window === "undefined") return;
  const deviceId = getDeviceId();
  // Shared key for both tokens
  const key = `arc-faucet:rateLimit:${deviceId}`;
  const stored = localStorage.getItem(key);

  if (!stored) {
    const resetTime = Date.now() + RATE_LIMIT_WINDOW;
    localStorage.setItem(key, JSON.stringify({ count: 1, resetTime }));
    return;
  }

  try {
    const record = JSON.parse(stored) as { count: number; resetTime: number };
    const now = Date.now();

    if (now > record.resetTime) {
      // Reset window
      const resetTime = now + RATE_LIMIT_WINDOW;
      localStorage.setItem(key, JSON.stringify({ count: 1, resetTime }));
    } else {
      record.count++;
      localStorage.setItem(key, JSON.stringify(record));
    }
  } catch (error) {
    // If parsing fails, reset
    const resetTime = Date.now() + RATE_LIMIT_WINDOW;
    localStorage.setItem(key, JSON.stringify({ count: 1, resetTime }));
  }
}

// Helper function to check cooldown (localStorage - extra layer)
// Now includes token to allow independent cooldowns for USDC and EURC
function checkLocalCooldown(address: string, token: "USDC" | "EURC"): { isInCooldown: boolean; remainingTime: number } {
  if (typeof window === "undefined") {
    return { isInCooldown: false, remainingTime: 0 };
  }

  const deviceId = getDeviceId();
  // Include token in keys to allow independent cooldowns per token
  const addressKey = `arc-faucet:lastClaim:${address.toLowerCase()}:${token}`;
  const deviceKey = `arc-faucet:lastClaimDevice:${deviceId}:${token}`;

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
// Now includes token to allow independent cooldowns for USDC and EURC
function storeSuccessfulClaim(address: string, token: "USDC" | "EURC") {
  if (typeof window === "undefined") return;
  const deviceId = getDeviceId();
  const now = Date.now().toString();
  // Include token in keys to allow independent cooldowns per token
  localStorage.setItem(`arc-faucet:lastClaim:${address.toLowerCase()}:${token}`, now);
  localStorage.setItem(`arc-faucet:lastClaimDevice:${deviceId}:${token}`, now);
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
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [addressValidationError, setAddressValidationError] = useState<string>("");
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [errorTimestamp, setErrorTimestamp] = useState<number>(0);
  const [selectedToken, setSelectedToken] = useState<"USDC" | "EURC">("USDC");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remainingRequests: number; resetTime: number } | null>(null);

  // Check if on correct network
  const isWrongNetwork = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;

  // Validate destination address
  const isValidDestinationAddress = useMemo(() => {
    if (!destinationAddress) return false;
    try {
      return isAddress(destinationAddress);
    } catch {
      return false;
    }
  }, [destinationAddress]);

  // Auto-fill destination address when wallet connects
  useEffect(() => {
    if (isConnected && address && !destinationAddress) {
      setDestinationAddress(address);
      setAddressValidationError("");
    }
  }, [isConnected, address, destinationAddress]);

  // Check rate limit on mount and periodically
  useEffect(() => {
    const updateRateLimit = () => {
      try {
        const rateLimit = checkRateLimitLocal();
        setRateLimitInfo({
          remainingRequests: rateLimit.remainingRequests,
          resetTime: rateLimit.resetTime,
        });
      } catch (error) {
        // Silently handle errors - don't break the app
        console.error("Error updating rate limit:", error);
      }
    };

    // Initial check
    updateRateLimit();

    // Update every minute
    const interval = setInterval(updateRateLimit, 60000);

    return () => clearInterval(interval);
  }, []);

  // Clear success status when destination address or wallet changes
  useEffect(() => {
    if (faucetStatus === "success") {
      // Clear success status when address changes
      setFaucetStatus("idle");
      setTxHash("");
      setShowSuccessAnimation(false);
      setShowShareModal(false);
    }
  }, [destinationAddress, address]);

  // Validate address on change
  useEffect(() => {
    if (destinationAddress) {
      try {
        if (!isAddress(destinationAddress)) {
          setAddressValidationError("Please enter a valid ARC-compatible address.");
        } else {
          setAddressValidationError("");
        }
      } catch {
        setAddressValidationError("Please enter a valid ARC-compatible address.");
      }
    } else {
      setAddressValidationError("");
    }
  }, [destinationAddress]);

  // Get contract address based on selected token
  const currentFaucetAddress = useMemo(() => {
    return selectedToken === "USDC" ? USDC_FAUCET_ADDRESS : EURC_FAUCET_ADDRESS;
  }, [selectedToken]);

  // Read contract state - use destinationAddress if available
  const recipientForCheck = (() => {
    if (destinationAddress && isValidDestinationAddress) {
      try {
        return isAddress(destinationAddress) ? (destinationAddress as `0x${string}`) : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  })();
  
  const { data: canClaimData, refetch: refetchCanClaim } = useReadContract({
    address: currentFaucetAddress,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "canClaim",
    args: recipientForCheck ? [recipientForCheck as `0x${string}`] : undefined,
    query: {
      enabled: !!recipientForCheck,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  const { data: paused } = useReadContract({
    address: currentFaucetAddress,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "paused",
    query: {
      enabled: true, // Always enabled - no wallet needed
    },
  });

  const { data: faucetBalance } = useReadContract({
    address: currentFaucetAddress,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "faucetBalance",
    query: {
      enabled: true, // Always enabled - no wallet needed
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  });

  const { data: totalClaims, refetch: refetchTotalClaims } = useReadContract({
    address: currentFaucetAddress,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: "totalClaims",
    query: {
      enabled: true, // Always enabled - no wallet needed
      refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
    },
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
    // Don't override loading status - let user see the loading message
    if (faucetStatus === "loading") {
      return;
    }

    // Auto-clear success status after 10 seconds
    if (faucetStatus === "success") {
      const timeout = setTimeout(() => {
        setFaucetStatus("idle");
        setTxHash("");
        setShowSuccessAnimation(false);
      }, 10000);
      return () => clearTimeout(timeout);
    }

    // For error status, allow override after 5 seconds to check if transaction actually succeeded
    if (faucetStatus === "error") {
      const now = Date.now();
      if (errorTimestamp > 0 && now - errorTimestamp < 5000) {
        // Keep error status for at least 5 seconds
        return;
      }
      // After 5 seconds, check if transaction actually succeeded on-chain
      // If canClaim shows cooldown, it means the claim was successful
      if (canClaimResult && !canClaimResult.allowed && canClaimResult.remainingSeconds > 0) {
        // Transaction succeeded! Update to success
        setFaucetStatus("success");
        setErrorMessage("");
        setErrorTimestamp(0); // Clear error timestamp
        if (destinationAddress) {
          storeSuccessfulClaim(destinationAddress, selectedToken);
        }
        return;
      }
    }

    // Check if destination address is provided and valid
    if (!destinationAddress || !isValidDestinationAddress) {
      setFaucetStatus("idle");
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
        // Contract says we can claim - clear any stale local cooldown for this token
        if (typeof window !== "undefined" && address) {
          const deviceId = getDeviceId();
          localStorage.removeItem(`arc-faucet:lastClaim:${address.toLowerCase()}:${selectedToken}`);
          localStorage.removeItem(`arc-faucet:lastClaimDevice:${deviceId}:${selectedToken}`);
        }
        // Don't check local cooldown if contract allows claim
      } else if (!canClaimResult.allowed && canClaimResult.remainingSeconds === 0) {
        // Contract says can't claim but no cooldown - might be empty faucet or other issue
        // Don't set cooldown status, let other checks handle it
      }
    }

    // Check local cooldown only if contract doesn't have data yet
    // Once contract responds, it becomes the source of truth
    // Use destinationAddress and selectedToken for cooldown check
    if (!canClaimResult && destinationAddress && isValidDestinationAddress) {
      const localCooldown = checkLocalCooldown(destinationAddress, selectedToken);
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
  }, [paused, canClaimResult, faucetBalance, faucetStatus, destinationAddress, isValidDestinationAddress, errorTimestamp, selectedToken, address]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setDestinationAddress(text.trim());
        setAddressValidationError("");
      }
    } catch (error) {
      // Fallback for browsers that don't support clipboard API
      console.error("Failed to read clipboard:", error);
      // Try using a temporary input element as fallback
      const tempInput = document.createElement("input");
      tempInput.style.position = "fixed";
      tempInput.style.opacity = "0";
      document.body.appendChild(tempInput);
      tempInput.focus();
      document.execCommand("paste");
      const pastedText = tempInput.value;
      document.body.removeChild(tempInput);
      if (pastedText) {
        setDestinationAddress(pastedText.trim());
        setAddressValidationError("");
      }
    }
  };

  const handleClaim = async () => {
    // Validate destination address
    if (!destinationAddress || !isValidDestinationAddress) {
      setAddressValidationError("Please enter a valid ARC-compatible address.");
      setFaucetStatus("idle");
      return;
    }

    // Ensure address is valid format
    const recipientAddress = destinationAddress as `0x${string}`;
    if (!isAddress(recipientAddress)) {
      setAddressValidationError("Please enter a valid ARC-compatible address.");
      setFaucetStatus("idle");
      return;
    }

    // Prevent multiple simultaneous requests
    if (faucetStatus === "loading" || isClaiming) {
      return;
    }

    // Check rate limit before making request
    const rateLimitCheck = checkRateLimitLocal();
    if (!rateLimitCheck.allowed) {
      const hoursUntilReset = Math.ceil((rateLimitCheck.resetTime - Date.now()) / (1000 * 60 * 60));
      setErrorMessage(`Rate limit exceeded. Maximum 20 claims per 24 hours (shared between USDC and EURC). Please try again in ${hoursUntilReset} hour(s).`);
      setFaucetStatus("error");
      setRateLimitInfo({
        remainingRequests: 0,
        resetTime: rateLimitCheck.resetTime,
      });
      return;
    }

    try {
      // Set loading state immediately
      setIsClaiming(true);
      setFaucetStatus("loading");
      setErrorMessage("");
      setAddressValidationError("");
      setTxHash("");
      
      // Call API to process claim (gasless)
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          address: recipientAddress,
          token: selectedToken, // Send selected token to API
        }),
      });

      // Check if response is ok before parsing JSON
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        setErrorMessage("Failed to process response. Please try again.");
        setFaucetStatus("error");
        return;
      }

      if (!response.ok) {
        // Handle error response
        setErrorMessage(data.error || data.message || "Failed to claim tokens");
        setFaucetStatus("error");
        setErrorTimestamp(Date.now());
        
        // Handle rate limit error (429)
        if (response.status === 429) {
          const hoursUntilReset = data.hoursUntilReset || Math.ceil((data.resetTime - Date.now()) / (1000 * 60 * 60));
          setErrorMessage(`Rate limit exceeded. Maximum 20 claims per 24 hours (shared between USDC and EURC). Please try again in ${hoursUntilReset} hour(s).`);
          setRateLimitInfo({
            remainingRequests: data.remainingRequests || 0,
            resetTime: data.resetTime || Date.now() + 24 * 60 * 60 * 1000,
          });
          setIsClaiming(false);
          return;
        }
        
        // Handle cooldown specifically
        if (data.remainingSeconds) {
          setRemainingCooldownSeconds(data.remainingSeconds);
          setFaucetStatus("cooldown");
          setErrorTimestamp(0); // Clear error timestamp for cooldown
        }
        
        // Refetch canClaim to check if transaction actually succeeded despite API error
        setTimeout(() => {
          refetchCanClaim();
        }, 3000);
        
        setIsClaiming(false);
        return;
      }

      // Success
      setTxHash(data.transactionHash);
      setFaucetStatus("success");
      setErrorTimestamp(0); // Clear any error timestamp
      setErrorMessage(""); // Clear any error message
      
      // Increment rate limit counter (shared between USDC and EURC)
      incrementRateLimit();
      const updatedRateLimit = checkRateLimitLocal();
      setRateLimitInfo({
        remainingRequests: updatedRateLimit.remainingRequests,
        resetTime: updatedRateLimit.resetTime,
      });
      
      // Trigger success animation
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
      }, 2000);
      
      // Store successful claim in localStorage
      if (recipientAddress) {
        storeSuccessfulClaim(recipientAddress, selectedToken);
      }

      // Show share modal after a short delay
      setTimeout(() => {
        setShowShareModal(true);
      }, 2500);

      // Refetch canClaim and totalClaims to update UI immediately
      setTimeout(() => {
        refetchCanClaim();
        refetchTotalClaims(); // Update claim counter immediately
        setIsClaiming(false);
      }, 2000);
    } catch (error) {
      console.error("Claim error:", error);
      setErrorMessage("Failed to claim tokens. Please try again.");
      setFaucetStatus("error");
      setErrorTimestamp(Date.now());
      
      // Refetch canClaim to check if transaction actually succeeded despite error
      setTimeout(() => {
        refetchCanClaim();
      }, 3000);
      
      setIsClaiming(false);
    }
  };


  const isClaimDisabled =
    !destinationAddress ||
    !isValidDestinationAddress ||
    faucetStatus === "loading" ||
    isClaiming ||
    faucetStatus === "cooldown" ||
    faucetStatus === "paused" ||
    paused === true ||
    (canClaimResult !== null && canClaimResult !== undefined && !canClaimResult.allowed) ||
    !!addressValidationError ||
    (rateLimitInfo !== null && rateLimitInfo.remainingRequests === 0);

  const explorerUrl = `${arcTestnet.blockExplorers?.default.url}/tx/${txHash}`;

  // Twitter share URL
  const tweetText = useMemo(() => 
    `I'm claiming ${CLAIM_AMOUNTS[selectedToken]} ${selectedToken} on ARC testnet using Easy Faucet Arc to power my dApp testing! 🚀

@ARC ${APP_URL}

#ARC #DeFi #Web3 #ARCTestnet`,
    [selectedToken]
  );
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#020617" }}>
      <div className="w-full max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-8 items-start justify-center">
        {/* Projects Showcase Section - Left side on desktop */}
        <div className="w-full lg:w-auto lg:flex-shrink-0 lg:max-w-[560px] order-2 lg:order-1">
          <ProjectsShowcase />
        </div>

        {/* Main Faucet Card - Right side on desktop */}
        <Card className="w-full max-w-[560px] lg:flex-shrink-0 p-8 shadow-2xl order-1 lg:order-2" style={{ background: "#050B18", borderColor: "#1E293B" }}>
        {/* Header */}
        <div className="text-center space-y-4 mb-4">
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
            Get up to {CLAIM_AMOUNTS[selectedToken]} {selectedToken} (testnet) to develop on the ARC Network. The official faucet only provides 1 {selectedToken} per
            hour.
          </p>
        </div>

        {/* Wallet Connection - Centralized and Styled */}
        <div className="flex items-center justify-center w-full mb-2">
          <div className="w-full flex justify-center sm:max-w-[800px] max-w-full">
            <ConnectButton showBalance={false} />
          </div>
        </div>

        {/* Info text about wallet connection */}
        <div className="text-center space-y-1">
          <p className="text-xs" style={{ color: "#6B7280" }}>
            Connect your wallet to auto-fill the address
          </p>
          <p className="text-xs font-medium" style={{ color: "#9CA3AF" }}>
            OR
          </p>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            enter manually below
          </p>
        </div>

        {/* Destination Address Input */}
        <div className="space-y-1">
          <Label htmlFor="destination-address" className="text-sm" style={{ color: "#F9FAFB" }}>
            Destination address
          </Label>
          <div className="flex gap-2">
          <Input
            id="destination-address"
            type="text"
            placeholder="0x1234...ABCD"
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
              className="flex-1"
            style={{
              background: "#1E293B",
              borderColor: addressValidationError ? "#EF4444" : "#1E293B",
              color: "#F9FAFB",
            }}
            aria-invalid={!!addressValidationError}
          />
            <Button
              onClick={handlePaste}
              type="button"
              className="font-medium text-sm px-4 whitespace-nowrap"
              style={{
                background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
                color: "#F9FAFB",
                border: "none",
              }}
            >
              Paste
            </Button>
          </div>
          {addressValidationError ? (
            <p className="text-xs" style={{ color: "#EF4444" }}>
              {addressValidationError}
            </p>
          ) : (
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Paste a valid ARC-compatible (EVM) address. {isConnected && address && "Your connected address has been auto-filled."}
            </p>
          )}

          {/* Success Animation - Money Rain Effect */}
          {showSuccessAnimation && (
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
              {[...Array(30)].map((_, i) => {
                const randomLeft = Math.random() * 100; // Random position across screen width (0-100%)
                const randomDelay = Math.random() * 1.5; // Random delay (0-1.5s)
                const randomDuration = 2 + Math.random() * 1.5; // Random duration (2-3.5s)
                const randomDrift = (Math.random() - 0.5) * 100; // Random horizontal drift (-50px to +50px)
                const randomSize = 1.5 + Math.random() * 1; // Random size (1.5-2.5rem)
                const randomRotation = Math.random() * 360; // Random starting rotation
                return (
                  <div
                    key={i}
                    className="absolute text-4xl"
                    style={{
                      left: `${randomLeft}%`,
                      top: '-10%',
                      '--drift': `${randomDrift}px`,
                      '--rotation': `${randomRotation}deg`,
                      animation: `moneyRain ${randomDuration}s linear forwards`,
                      animationDelay: `${randomDelay}s`,
                      fontSize: `${randomSize}rem`,
                    } as React.CSSProperties & { '--drift': string; '--rotation': string }}
                  >
                    {i % 3 === 0 ? '💰' : i % 3 === 1 ? '🤑' : '💸'}
                  </div>
                );
              })}
            </div>
          )}

          {/* Success/Error Messages */}
          {faucetStatus === "success" && (
            <Alert className="border mt-2 py-3" style={{ background: "#050B18", borderColor: "#22C55E" }}>
              <CheckCircle2 className="h-5 w-5" style={{ color: "#22C55E" }} />
              <AlertTitle style={{ color: "#22C55E", fontSize: "18px", fontWeight: "600" }}>
                ✅ Claim Successful!
              </AlertTitle>
              <AlertDescription style={{ color: "#E5E7EB" }} className="mt-2 space-y-2">
                <p className="text-base">
                  <strong>{CLAIM_AMOUNTS[selectedToken]} {selectedToken} (testnet)</strong> has been sent to the selected address.
                </p>
                {destinationAddress && (
                  <p className="text-xs font-mono" style={{ color: "#9CA3AF" }}>
                    {destinationAddress.slice(0, 6)}...{destinationAddress.slice(-4)}
                  </p>
                )}
                <p className="text-sm" style={{ color: "#9CA3AF" }}>
                  It may take a few moments to appear in the wallet.
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

          {faucetStatus === "error" && (
            <Alert className="border mt-2" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Something went wrong</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                {errorMessage || "An unexpected error occurred while processing your request. Please try again in a few minutes."}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Alerts */}
        <div className="space-y-3">

          {/* Rate Limit Warning */}
          {rateLimitInfo !== null && rateLimitInfo.remainingRequests === 0 && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Rate limit exceeded</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                You have reached the maximum of 20 claims per 24 hours (shared between USDC and EURC).
                {rateLimitInfo.resetTime > Date.now() && (
                  <span className="block mt-1">
                    Please try again in {Math.ceil((rateLimitInfo.resetTime - Date.now()) / (1000 * 60 * 60))} hour(s).
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {rateLimitInfo !== null && rateLimitInfo.remainingRequests > 0 && rateLimitInfo.remainingRequests <= 5 && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#F59E0B" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#F59E0B" }} />
              <AlertTitle style={{ color: "#F59E0B" }}>Rate limit warning</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                You have {rateLimitInfo.remainingRequests} request{rateLimitInfo.remainingRequests === 1 ? "" : "s"} remaining in the next 24 hours (shared between USDC and EURC).
              </AlertDescription>
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


          {faucetStatus === "cooldown" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Cooldown active</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                This address can only request faucet once every 24 hours.
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

        </div>

        {/* Token Selector */}
        <div className="mb-1">
          <Tabs value={selectedToken} onValueChange={(value) => setSelectedToken(value as "USDC" | "EURC")}>
            <TabsList 
              className="w-full h-12 p-1 rounded-lg"
              style={{ background: "#1E293B" }}
            >
              <TabsTrigger
                value="USDC"
                className="flex-1 h-10 rounded-md text-sm font-medium transition-all"
                style={{
                  background: selectedToken === "USDC" ? "linear-gradient(90deg, #2F2CFF, #C035FF)" : "transparent",
                  color: selectedToken === "USDC" ? "#F9FAFB" : "#9CA3AF",
                  border: "none",
                }}
              >
                USDC
              </TabsTrigger>
              <TabsTrigger
                value="EURC"
                className="flex-1 h-10 rounded-md text-sm font-medium transition-all"
                style={{
                  background: selectedToken === "EURC" ? "linear-gradient(90deg, #2F2CFF, #C035FF)" : "transparent",
                  color: selectedToken === "EURC" ? "#F9FAFB" : "#9CA3AF",
                  border: "none",
                }}
              >
                EURC
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Claim Button & Twitter Share */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleClaim}
            disabled={isClaimDisabled}
            className="flex-1 font-medium text-base h-14 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isClaimDisabled ? "#1E293B" : "linear-gradient(90deg, #2F2CFF, #C035FF)",
              color: "#F9FAFB",
            }}
          >
            {(faucetStatus === "loading" || isClaiming) ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Claiming...
              </>
            ) : (
              `Claim ${CLAIM_AMOUNTS[selectedToken]} ${selectedToken} (testnet)`
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

        {/* Faucet Stats Section */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "#F9FAFB" }}>
            Faucet Stats
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1 - Available */}
        {faucetBalance !== undefined && (
              <div className="p-4 rounded-lg border" style={{ background: "#1E293B", borderColor: "#1E293B" }}>
                <p className="text-xs mb-2" style={{ color: "#9CA3AF" }}>
                  Available
                </p>
                <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
                  {Number(faucetBalance) / 1_000_000} {selectedToken} (testnet)
            </p>
          </div>
        )}

            {/* Card 2 - Claims Processed */}
            {totalClaims !== undefined && (
              <div className="p-4 rounded-lg border" style={{ background: "#1E293B", borderColor: "#1E293B" }}>
                <p className="text-xs mb-2 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
                  Claims processed
                </p>
                <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
                  <span style={{ color: "#22C55E", fontWeight: "600" }}>
                    {typeof totalClaims === "bigint" ? totalClaims.toString() : totalClaims || "0"}
                  </span>
                  {(() => {
                    const claims = typeof totalClaims === "bigint" ? Number(totalClaims) : (totalClaims || 0);
                    const claimAmount = CLAIM_AMOUNTS[selectedToken];
                    const totalDistributed = claims * claimAmount;
                    // Format large numbers with commas
                    const formattedTotal = totalDistributed.toLocaleString('en-US');
                    return (
                      <span style={{ color: "#9CA3AF", fontWeight: "400", marginLeft: "4px" }}>
                        ({formattedTotal} {selectedToken})
                      </span>
                    );
                  })()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="space-y-2 p-4 rounded-lg mt-2" style={{ background: "#1E293B" }}>
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
              <span>This faucet provides up to {CLAIM_AMOUNTS[selectedToken]} {selectedToken} per day.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>You can request only once every 24 hours per destination address.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Maximum amount: {CLAIM_AMOUNTS[selectedToken]} {selectedToken} (testnet) per claim.</span>
            </li>
          </ul>
        </div>

        {/* Tutorial Toggle Button */}
        <div className="mb-2">
        <button
          onClick={() => setIsTutorialExpanded(!isTutorialExpanded)}
          aria-expanded={isTutorialExpanded}
            className="w-full text-xs text-center transition-colors hover:opacity-80 flex items-center justify-center gap-2"
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
              isTutorialExpanded ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
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
            </div>
      </Card>
          </div>

      {/* Share on X Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent 
          className="sm:max-w-md"
          style={{
            background: "#050B18",
            borderColor: "#1E293B",
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-xl font-bold text-center"
              style={{ color: "#F9FAFB" }}
            >
              🎉 Claim Successful!
            </DialogTitle>
            <DialogDescription 
              className="text-center mt-2"
              style={{ color: "#9CA3AF" }}
            >
              Share your success and help others discover Easy Faucet Arc!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div 
              className="p-4 rounded-lg border"
              style={{ 
                background: "#1E293B", 
                borderColor: "#1E293B" 
              }}
            >
              <p className="text-sm whitespace-pre-line" style={{ color: "#E5E7EB" }}>
                {tweetText}
              </p>
            </div>
            
                <a
              href={twitterShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
                color: "#F9FAFB",
                textDecoration: "none",
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>Share on X</span>
            </a>
            
            <button
              onClick={() => setShowShareModal(false)}
              className="w-full px-6 py-3 rounded-lg font-medium transition-all hover:opacity-80 border"
              style={{
                background: "transparent",
                borderColor: "#1E293B",
                color: "#9CA3AF",
              }}
            >
              Maybe later
            </button>
        </div>
        </DialogContent>
      </Dialog>

      <footer className="w-full max-w-[1200px] mt-12 text-center space-y-4">
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
            href="https://x.com/0xbrunoamuniz"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:opacity-80"
            style={{ color: "#9CA3AF" }}
            aria-label="Follow on X (Twitter)"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/in/brunoamuniz/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:opacity-80"
            style={{ color: "#9CA3AF" }}
            aria-label="Connect on LinkedIn"
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
