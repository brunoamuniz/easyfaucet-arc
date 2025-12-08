"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react"

// ARC Testnet chain configuration (TODO: Update with actual ARC chain details)
const ARC_TESTNET_CHAIN_ID = 999999 // TODO: Replace with actual ARC testnet chain ID

type FaucetStatus = "idle" | "loading" | "success" | "cooldown" | "no_funds" | "error" | "wrong_network" | "no_wallet"

interface ClaimResult {
  status: "success" | "cooldown" | "no_funds" | "error"
  message?: string
  txHash?: string
}

// Helper function to generate or get device ID
function getDeviceId(): string {
  const key = "arc-faucet:deviceId"
  let deviceId = localStorage.getItem(key)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(key, deviceId)
  }
  return deviceId
}

// Helper function to check cooldown
function checkCooldown(address: string): { isInCooldown: boolean; remainingTime: number } {
  const deviceId = getDeviceId()
  const addressKey = `arc-faucet:lastClaim:${address.toLowerCase()}`
  const deviceKey = `arc-faucet:lastClaimDevice:${deviceId}`

  const lastClaimAddress = localStorage.getItem(addressKey)
  const lastClaimDevice = localStorage.getItem(deviceKey)

  const now = Date.now()
  const cooldownPeriod = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

  let remainingTime = 0

  if (lastClaimAddress) {
    const addressCooldown = cooldownPeriod - (now - Number.parseInt(lastClaimAddress))
    if (addressCooldown > 0) {
      remainingTime = Math.max(remainingTime, addressCooldown)
    }
  }

  if (lastClaimDevice) {
    const deviceCooldown = cooldownPeriod - (now - Number.parseInt(lastClaimDevice))
    if (deviceCooldown > 0) {
      remainingTime = Math.max(remainingTime, deviceCooldown)
    }
  }

  return {
    isInCooldown: remainingTime > 0,
    remainingTime,
  }
}

// Simulated faucet claim function
async function simulateFaucetClaim(address: string): Promise<ClaimResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Check cooldown
  const { isInCooldown } = checkCooldown(address)
  if (isInCooldown) {
    return { status: "cooldown" }
  }

  // Simulate different responses (90% success, 5% no funds, 5% error)
  const random = Math.random()
  if (random < 0.9) {
    // Store successful claim
    const deviceId = getDeviceId()
    const now = Date.now().toString()
    localStorage.setItem(`arc-faucet:lastClaim:${address.toLowerCase()}`, now)
    localStorage.setItem(`arc-faucet:lastClaimDevice:${deviceId}`, now)

    return {
      status: "success",
      txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
    }
  } else if (random < 0.95) {
    return { status: "no_funds" }
  } else {
    return { status: "error" }
  }
}

export default function FaucetPage() {
  const [mockAddress, setMockAddress] = useState<string | undefined>(undefined)
  const [mockChainId, setMockChainId] = useState<number>(ARC_TESTNET_CHAIN_ID)

  const address = mockAddress
  const isConnected = !!mockAddress
  const currentChainId = mockChainId

  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus>("idle")
  const [txHash, setTxHash] = useState<string>("")

  // Check if on correct network
  const isWrongNetwork = isConnected && currentChainId !== ARC_TESTNET_CHAIN_ID

  // Check cooldown on mount and when address changes
  useEffect(() => {
    if (!isConnected || !address) {
      setFaucetStatus("no_wallet")
    } else if (isWrongNetwork) {
      setFaucetStatus("wrong_network")
    } else {
      const { isInCooldown } = checkCooldown(address)
      if (isInCooldown) {
        setFaucetStatus("cooldown")
      } else {
        setFaucetStatus("idle")
      }
    }
  }, [address, isConnected, isWrongNetwork])

  const handleConnect = () => {
    // Generate a random mock address
    const randomAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`
    setMockAddress(randomAddress)
    // Start on wrong network for demo
    setMockChainId(1) // Ethereum mainnet
  }

  const handleDisconnect = () => {
    setMockAddress(undefined)
    setMockChainId(ARC_TESTNET_CHAIN_ID)
  }

  const handleSwitchNetwork = () => {
    setMockChainId(ARC_TESTNET_CHAIN_ID)
  }

  const handleClaim = async () => {
    if (!address) return

    setFaucetStatus("loading")
    setTxHash("")

    try {
      const result = await simulateFaucetClaim(address)

      if (result.status === "success") {
        setFaucetStatus("success")
        setTxHash(result.txHash || "")
      } else {
        setFaucetStatus(result.status)
      }
    } catch (error) {
      console.error("Claim error:", error)
      setFaucetStatus("error")
    }
  }

  const isClaimDisabled = !isConnected || isWrongNetwork || faucetStatus === "loading" || faucetStatus === "cooldown"

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#020617" }}>
      <Card className="w-full max-w-[560px] p-8 shadow-2xl" style={{ background: "#050B18", borderColor: "#1E293B" }}>
        <Alert className="border mb-6" style={{ background: "#1E293B", borderColor: "#2F2CFF" }}>
          <Info className="h-4 w-4" style={{ color: "#2F2CFF" }} />
          <AlertDescription style={{ color: "#9CA3AF" }}>
            <strong style={{ color: "#F9FAFB" }}>Preview Mode:</strong> Wallet connection is simulated. Deploy and add
            wagmi + RainbowKit for real wallet integration.
          </AlertDescription>
        </Alert>

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
            Get up to 50 USDC (testnet) to develop on the ARC Network. The official faucet only provides 1 USDC per
            hour.
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="mb-6">
          {!isConnected ? (
            <Button
              onClick={handleConnect}
              className="w-full font-medium text-base h-12"
              style={{ background: "linear-gradient(90deg, #2F2CFF, #C035FF)", color: "#F9FAFB" }}
            >
              Connect Wallet
            </Button>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#1E293B" }}>
              <span className="text-sm font-mono" style={{ color: "#F9FAFB" }}>
                {shortenAddress(address || "")}
              </span>
              <Button onClick={handleDisconnect} variant="ghost" size="sm" style={{ color: "#9CA3AF" }}>
                Disconnect
              </Button>
            </div>
          )}
        </div>

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

          {faucetStatus === "success" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#22C55E" }}>
              <CheckCircle2 className="h-4 w-4" style={{ color: "#22C55E" }} />
              <AlertTitle style={{ color: "#22C55E" }}>Faucet requested!</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                Up to 50 USDC (testnet) has been sent to your ARC address. It may take a few moments to appear.
              </AlertDescription>
              {txHash && (
                <p className="mt-2 text-xs font-mono break-all" style={{ color: "#9CA3AF" }}>
                  TX: {txHash}
                </p>
              )}
            </Alert>
          )}

          {faucetStatus === "cooldown" && (
            <Alert className="border" style={{ background: "#050B18", borderColor: "#EF4444" }}>
              <AlertCircle className="h-4 w-4" style={{ color: "#EF4444" }} />
              <AlertTitle style={{ color: "#EF4444" }}>Cooldown active</AlertTitle>
              <AlertDescription style={{ color: "#9CA3AF" }} className="mt-2">
                You can only request faucet once every 24 hours from this device.
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
                An unexpected error occurred while processing your request. Please try again in a few minutes.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Claim Button */}
        <Button
          onClick={handleClaim}
          disabled={isClaimDisabled}
          className="w-full font-medium text-base h-14 mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isClaimDisabled ? "#1E293B" : "linear-gradient(90deg, #2F2CFF, #C035FF)",
            color: "#F9FAFB",
          }}
        >
          {faucetStatus === "loading" ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Claiming...
            </>
          ) : (
            "Claim 50 USDC (testnet)"
          )}
        </Button>

        {/* Info Box */}
        <div className="space-y-2 p-4 rounded-lg" style={{ background: "#1E293B" }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: "#F9FAFB" }}>
            Faucet Information
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: "#9CA3AF" }}>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>The official faucet allows only 1 USDC per hour.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>This faucet provides up to 50 USDC per day.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>You can request only once every 24 hours from this device.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Maximum amount: 50 USDC (testnet) per claim.</span>
            </li>
          </ul>
        </div>
      </Card>

      <footer className="w-full max-w-[560px] mt-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-6">
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
  )
}
