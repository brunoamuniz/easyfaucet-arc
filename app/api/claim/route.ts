import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FAUCET_CONTRACT_ADDRESS, ARC_TESTNET_CHAIN_ID } from "@/lib/config/faucet";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";
import { arcTestnet } from "@/lib/config/chains";

// Rate limiting: simple in-memory store (for production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Get IP address for rate limiting
    const ip = request.headers.get("x-forwarded-for") || 
               request.headers.get("x-real-ip") || 
               "unknown";

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { address } = body;

    // Validate address
    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    if (!isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Check environment variables
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error("PRIVATE_KEY not set in environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get RPC URL from environment or use default
    const rpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

    // Create wallet client
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    // Create public client for reading contract
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    // Check if address can claim (read from contract)
    try {
      const canClaimResult = await publicClient.readContract({
        address: FAUCET_CONTRACT_ADDRESS,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "canClaim",
        args: [address as `0x${string}`],
      });

      if (!canClaimResult[0]) {
        const remainingSeconds = canClaimResult[1];
        if (remainingSeconds > 0) {
          return NextResponse.json(
            { 
              error: "Cooldown active",
              remainingSeconds: Number(remainingSeconds),
              message: `Please wait ${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}m before claiming again.`
            },
            { status: 400 }
          );
        } else {
          return NextResponse.json(
            { error: "Cannot claim at this time" },
            { status: 400 }
          );
        }
      }
    } catch (error) {
      console.error("Error checking canClaim:", error);
      return NextResponse.json(
        { error: "Failed to verify claim eligibility" },
        { status: 500 }
      );
    }

    // Execute claimFor transaction
    try {
      const hash = await walletClient.writeContract({
        address: FAUCET_CONTRACT_ADDRESS,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "claimFor",
        args: [address as `0x${string}`],
      });

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        return NextResponse.json({
          success: true,
          transactionHash: hash,
          address,
        });
      } else {
        return NextResponse.json(
          { error: "Transaction failed" },
          { status: 500 }
        );
      }
    } catch (error: any) {
      console.error("Error executing claim:", error);

      // Try to decode error message
      let errorMessage = "Failed to execute claim";
      if (error?.message) {
        errorMessage = error.message;
        
        // Check for common errors
        if (errorMessage.includes("CooldownActive")) {
          return NextResponse.json(
            { error: "Cooldown active. Please wait before claiming again." },
            { status: 400 }
          );
        }
        if (errorMessage.includes("FaucetEmpty") || errorMessage.includes("InsufficientFaucetBalance")) {
          return NextResponse.json(
            { error: "Faucet has insufficient balance" },
            { status: 400 }
          );
        }
        if (errorMessage.includes("Paused")) {
          return NextResponse.json(
            { error: "Faucet is currently paused" },
            { status: 400 }
          );
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Unexpected error in claim API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
