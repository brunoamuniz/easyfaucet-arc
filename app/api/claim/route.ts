import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "redis";
import { FAUCET_CONTRACT_ADDRESS, ARC_TESTNET_CHAIN_ID, USDC_FAUCET_ADDRESS, EURC_FAUCET_ADDRESS } from "@/lib/config/faucet";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";
import { arcTestnet } from "@/lib/config/chains";

// Initialize Redis client - uses REDIS_URL from Vercel
// Same infrastructure in local and production - no fallback
let redis: ReturnType<typeof createClient> | null = null;
let redisConnectionPromise: Promise<void> | null = null;

if (process.env.REDIS_URL) {
  redis = createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 3000, // 3 seconds timeout (reduced from 5s)
      lazyConnect: false, // Connect immediately
      keepAlive: 30000, // Keep connection alive
      reconnectStrategy: (retries) => {
        if (retries > 2) {
          console.error("Redis: Max reconnection attempts reached");
          return false; // Stop reconnecting
        }
        return Math.min(retries * 50, 1000); // Faster reconnection
      },
    },
  });
  
  redis.on("error", (err) => {
    console.error("Redis Client Error:", err);
  });
  
  redis.on("connect", () => {
    console.log("✅ Redis connected");
  });
  
  redis.on("ready", () => {
    console.log("✅ Redis ready");
  });
  
  // Pre-connect to Redis immediately (connection is reused in serverless)
  console.log("Connecting to Redis...");
  redisConnectionPromise = redis.connect().then(() => {
    console.log("✅ Redis pre-connected successfully");
  }).catch((err) => {
    console.error("❌ Failed to pre-connect to Redis:", err);
    redisConnectionPromise = null;
  });
} else {
  console.error("⚠️ REDIS_URL not configured. Rate limiting will fail.");
}

// Rate limiting: Vercel KV (Redis) - persistent across all serverless instances
// Shared limit between USDC and EURC: 20 claims per 24 hours per IP
// Uses same infrastructure in local and production - no fallback
const RATE_LIMIT_WINDOW = 24 * 60 * 60; // 24 hours in seconds (for TTL)
const RATE_LIMIT_MAX_REQUESTS = 20; // Max 20 requests per 24 hours per IP (shared between USDC and EURC)

// Check rate limit (read-only, doesn't increment)
// Always uses Redis - same infrastructure as production
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remainingRequests: number; resetTime: number }> {
  if (!redis) {
    throw new Error("Redis not configured. Please set REDIS_URL");
  }

  // Ensure connection is open (wait for initial connection if needed)
  try {
    if (redisConnectionPromise) {
      await Promise.race([
        redisConnectionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout")), 3000))
      ]);
    }
    
    if (!redis.isOpen) {
      await Promise.race([
        redis.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout")), 3000))
      ]);
    }
  } catch (error) {
    console.error("Redis connection error in checkRateLimit:", error);
    // Fail open - allow request if Redis is unavailable (but log the error)
    const resetTime = Date.now() + (RATE_LIMIT_WINDOW * 1000);
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime };
  }

  const key = `rate-limit:${ip}`;
  let recordStr: string | null = null;
  try {
    recordStr = await Promise.race([
      redis.get(key) as Promise<string | null>,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Redis get timeout")), 2000))
    ]) as string | null;
  } catch (error) {
    console.error("Redis get error:", error);
    // Fail open - allow request if Redis read fails
    const resetTime = Date.now() + (RATE_LIMIT_WINDOW * 1000);
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime };
  }
  
  const record = recordStr ? JSON.parse(recordStr) as { count: number; resetTime: number } : null;

  if (!record) {
    // No record - user can make requests
    const resetTime = Date.now() + (RATE_LIMIT_WINDOW * 1000);
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime };
  }

  const now = Date.now();
  if (now > record.resetTime) {
    // Window expired - user can make requests (record will be overwritten on increment)
    const resetTime = now + (RATE_LIMIT_WINDOW * 1000);
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime };
  }

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
}

// Increment rate limit counter (called after successful claim)
// Always uses Redis - same infrastructure as production
async function incrementRateLimit(ip: string): Promise<void> {
  if (!redis) {
    throw new Error("Redis not configured. Please set REDIS_URL");
  }

  // Ensure connection is open (wait for initial connection if needed)
  try {
    if (redisConnectionPromise) {
      await Promise.race([
        redisConnectionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout")), 3000))
      ]);
    }
    
    if (!redis.isOpen) {
      await Promise.race([
        redis.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout")), 3000))
      ]);
    }
  } catch (error) {
    console.error("Redis connection error in incrementRateLimit:", error);
    return; // Fail silently - don't break the claim if Redis is unavailable
  }

  const key = `rate-limit:${ip}`;
  let recordStr: string | null = null;
  try {
    recordStr = await Promise.race([
      redis.get(key) as Promise<string | null>,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Redis get timeout")), 2000))
    ]) as string | null;
  } catch (error) {
    console.error("Redis get error in incrementRateLimit:", error);
    return; // Fail silently
  }
  
  const record = recordStr ? JSON.parse(recordStr) as { count: number; resetTime: number } : null;
  const now = Date.now();

  try {
    if (!record || now > record.resetTime) {
      // Reset window - new 24h period
      const resetTime = now + (RATE_LIMIT_WINDOW * 1000);
      await Promise.race([
        redis.setEx(key, RATE_LIMIT_WINDOW, JSON.stringify({ count: 1, resetTime })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis setEx timeout")), 2000))
      ]);
      return;
    }

    // Increment count
    record.count++;
    await Promise.race([
      redis.setEx(key, RATE_LIMIT_WINDOW, JSON.stringify(record)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Redis setEx timeout")), 2000))
    ]);
  } catch (error) {
    console.error("Redis setEx error in incrementRateLimit:", error);
    // Fail silently - don't break the claim
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[CLAIM] Request started at ${new Date().toISOString()}`);
  
  try {
    // Get IP address for rate limiting
    // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2), take the first one
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor 
      ? forwardedFor.split(",")[0].trim() 
      : request.headers.get("x-real-ip") || 
        request.ip || 
        "unknown";

    console.log(`[CLAIM] IP: ${ip}, checking rate limit...`);
    const rateLimitStart = Date.now();
    
    // Check rate limit (shared between USDC and EURC) - PRIMARY VALIDATION
    // This is the main security check - cannot be bypassed by changing browser
    // Uses Vercel KV (Redis) for persistent storage across all serverless instances
    const rateLimitResult = await checkRateLimit(ip);
    
    console.log(`[CLAIM] Rate limit check completed in ${Date.now() - rateLimitStart}ms, allowed: ${rateLimitResult.allowed}`);
    if (!rateLimitResult.allowed) {
      const resetTime = new Date(rateLimitResult.resetTime);
      const hoursUntilReset = Math.ceil((rateLimitResult.resetTime - Date.now()) / (1000 * 60 * 60));
      console.warn(`Rate limit exceeded for IP: ${ip} - ${rateLimitResult.remainingRequests} requests remaining`);
      return NextResponse.json(
        { 
          error: "Rate limit exceeded. Maximum 20 claims per 24 hours per IP (shared between USDC and EURC).",
          remainingRequests: 0,
          resetTime: rateLimitResult.resetTime,
          hoursUntilReset
        },
        { status: 429 }
      );
    }

    // Parse request body
    console.log(`[CLAIM] Parsing request body...`);
    const body = await request.json();
    const { address, token } = body;
    console.log(`[CLAIM] Address: ${address}, Token: ${token}`);
    
    // Validate and select faucet contract based on token
    const selectedToken = (token === "EURC" ? "EURC" : "USDC") as "USDC" | "EURC";
    const faucetAddress = selectedToken === "EURC" ? EURC_FAUCET_ADDRESS : USDC_FAUCET_ADDRESS;
    
    // Validate that the selected contract is not a placeholder
    if (faucetAddress === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json(
        { error: `Faucet contract for ${selectedToken} is not configured` },
        { status: 500 }
      );
    }

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
    console.log(`[CLAIM] Checking canClaim on contract...`);
    const canClaimStart = Date.now();
    try {
      const canClaimResult = await publicClient.readContract({
        address: faucetAddress,
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
      console.log(`[CLAIM] canClaim check completed in ${Date.now() - canClaimStart}ms`);
    } catch (error) {
      console.error(`[CLAIM] Error checking canClaim (took ${Date.now() - canClaimStart}ms):`, error);
      return NextResponse.json(
        { error: "Failed to verify claim eligibility" },
        { status: 500 }
      );
    }

    // Execute claimFor transaction
    console.log(`[CLAIM] Executing claimFor transaction...`);
    const txStart = Date.now();
    try {
      const hash = await walletClient.writeContract({
        address: faucetAddress,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "claimFor",
        args: [address as `0x${string}`],
      });
      console.log(`[CLAIM] Transaction sent: ${hash} (took ${Date.now() - txStart}ms)`);

      // Wait for transaction receipt
      console.log(`[CLAIM] Waiting for transaction receipt...`);
      const receiptStart = Date.now();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[CLAIM] Transaction receipt received (took ${Date.now() - receiptStart}ms)`);

      if (receipt.status === "success") {
        console.log(`[CLAIM] Transaction successful, updating rate limit...`);
        const rateLimitUpdateStart = Date.now();
        
        // Increment rate limit counter AFTER successful claim
        await incrementRateLimit(ip);
        console.log(`[CLAIM] Rate limit incremented (took ${Date.now() - rateLimitUpdateStart}ms)`);
        
        // Get updated rate limit info
        const updatedRateLimit = await checkRateLimit(ip);
        console.log(`[CLAIM] Updated rate limit retrieved (took ${Date.now() - rateLimitUpdateStart}ms total)`);
        
        // Log successful claim for monitoring
        const totalTime = Date.now() - startTime;
        console.log(`[CLAIM] ✅ SUCCESS - Total time: ${totalTime}ms - Address: ${address} (${selectedToken}) from IP: ${ip} - Remaining: ${updatedRateLimit.remainingRequests}`);
        
        // Prepare success response with rate limit info
        const response = NextResponse.json({
          success: true,
          transactionHash: hash,
          address,
          remainingRequests: updatedRateLimit.remainingRequests,
          resetTime: updatedRateLimit.resetTime,
        });

        // [ASSÍNCRONO] Check balance and send alert if needed
        // Fire-and-forget: don't await, don't block response
        import('@/lib/services/balance-checker').then(({ checkBalanceAndNotify }) => {
          checkBalanceAndNotify(selectedToken).catch((error) => {
            // Log error but don't throw - this is a background task
            console.error(`Background balance check/alert error for ${selectedToken}:`, error);
          });
        });

        return response;
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
