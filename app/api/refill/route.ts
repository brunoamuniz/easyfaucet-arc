import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/config/chains";
import {
  USDC_FAUCET_ADDRESS,
  EURC_FAUCET_ADDRESS,
  USDC_TESTNET_ADDRESS,
  EURC_TESTNET_ADDRESS,
} from "@/lib/config/faucet";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";
import { ERC20_ABI } from "@/lib/contracts/ERC20.abi";

// Thresholds (configuráveis via env, defaults do script Python)
const USDC_THRESHOLD = BigInt(process.env.USDC_THRESHOLD || "4000") * BigInt(1_000_000);
const EURC_THRESHOLD = BigInt(process.env.EURC_THRESHOLD || "2000") * BigInt(1_000_000);
const USDC_REFILL_AMOUNT = BigInt(process.env.USDC_REFILL_AMOUNT || "2000") * BigInt(1_000_000);
const EURC_REFILL_AMOUNT = BigInt(process.env.EURC_REFILL_AMOUNT || "1000") * BigInt(1_000_000);

interface RefillResult {
  checked: boolean;
  refilled: boolean;
  balance: string;
  balanceFormatted: string;
  threshold: string;
  thresholdFormatted: string;
  walletBalance?: string;
  walletBalanceFormatted?: string;
  txHash?: string;
  error?: string;
}

interface RefillResponse {
  success: boolean;
  timestamp: string;
  duration: string;
  usdc: RefillResult;
  eurc: RefillResult;
  errors: string[];
}

/**
 * GET /api/refill
 * Auto-refill endpoint for USDC and EURC faucets
 * Called by Vercel Cron Job every 10 minutes
 * 
 * Authentication:
 * - Option 1: Vercel Cron Job automatically adds x-vercel-cron header
 * - Option 2: Authorization header with REFILL_CRON_SECRET (if configured)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log(`[REFILL] Starting auto-refill check at ${timestamp}`);

  // Initialize response structure
  const response: RefillResponse = {
    success: true,
    timestamp,
    duration: "0ms",
    usdc: {
      checked: false,
      refilled: false,
      balance: "0",
      balanceFormatted: "0",
      threshold: USDC_THRESHOLD.toString(),
      thresholdFormatted: (Number(USDC_THRESHOLD) / 1_000_000).toString(),
    },
    eurc: {
      checked: false,
      refilled: false,
      balance: "0",
      balanceFormatted: "0",
      threshold: EURC_THRESHOLD.toString(),
      thresholdFormatted: (Number(EURC_THRESHOLD) / 1_000_000).toString(),
    },
    errors: [],
  };

  try {
    // Optional: Verify authentication
    // Option 1: Check Vercel Cron header (automatically added by Vercel)
    const vercelCron = request.headers.get("x-vercel-cron");
    // Option 2: Check Authorization header (if REFILL_CRON_SECRET is set)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.REFILL_CRON_SECRET;

    // If REFILL_CRON_SECRET is configured, require authentication
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[REFILL] Unauthorized access attempt");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify PRIVATE_KEY is configured
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not configured in environment variables");
    }

    // Initialize blockchain clients
    const rpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    console.log(`[REFILL] Wallet: ${account.address}`);
    console.log(`[REFILL] Thresholds - USDC: ${response.usdc.thresholdFormatted}, EURC: ${response.eurc.thresholdFormatted}`);

    // Check and refill USDC
    try {
      console.log("[REFILL] Checking USDC faucet balance...");
      const usdcBalance = await publicClient.readContract({
        address: USDC_FAUCET_ADDRESS,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "faucetBalance",
      });

      response.usdc.checked = true;
      response.usdc.balance = usdcBalance.toString();
      response.usdc.balanceFormatted = (Number(usdcBalance) / 1_000_000).toFixed(2);

      console.log(`[REFILL] USDC balance: ${response.usdc.balanceFormatted} (threshold: ${response.usdc.thresholdFormatted})`);

      if (usdcBalance < USDC_THRESHOLD) {
        console.log(`[REFILL] USDC balance below threshold! Checking wallet balance...`);

        // Check wallet balance
        const walletBalance = await publicClient.readContract({
          address: USDC_TESTNET_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        });

        response.usdc.walletBalance = walletBalance.toString();
        response.usdc.walletBalanceFormatted = (Number(walletBalance) / 1_000_000).toFixed(2);

        console.log(`[REFILL] Wallet USDC balance: ${response.usdc.walletBalanceFormatted}`);

        if (walletBalance >= USDC_REFILL_AMOUNT) {
          console.log(`[REFILL] Refilling USDC with ${Number(USDC_REFILL_AMOUNT) / 1_000_000} USDC...`);

          // Transfer tokens
          const txHash = await walletClient.writeContract({
            address: USDC_TESTNET_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [USDC_FAUCET_ADDRESS, USDC_REFILL_AMOUNT],
          });

          console.log(`[REFILL] USDC transfer submitted: ${txHash}`);

          // Wait for transaction receipt (with timeout)
          const receipt = await Promise.race([
            publicClient.waitForTransactionReceipt({ hash: txHash }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Transaction timeout")), 60000)
            ),
          ]) as any;

          if (receipt.status === "success") {
            response.usdc.refilled = true;
            response.usdc.txHash = txHash;
            console.log(`[REFILL] ✅ USDC refill successful! TX: ${txHash}`);

            // Verify new balance
            const newBalance = await publicClient.readContract({
              address: USDC_FAUCET_ADDRESS,
              abi: ARCTESTNET_FAUCET_ABI,
              functionName: "faucetBalance",
            });
            response.usdc.balance = newBalance.toString();
            response.usdc.balanceFormatted = (Number(newBalance) / 1_000_000).toFixed(2);
            console.log(`[REFILL] New USDC balance: ${response.usdc.balanceFormatted}`);
          } else {
            throw new Error("Transaction failed");
          }
        } else {
          const error = `Insufficient wallet balance. Need ${Number(USDC_REFILL_AMOUNT) / 1_000_000} USDC, have ${response.usdc.walletBalanceFormatted}`;
          response.usdc.error = error;
          response.errors.push(`USDC: ${error}`);
          console.error(`[REFILL] ❌ ${error}`);
        }
      } else {
        console.log(`[REFILL] USDC balance above threshold, no refill needed`);
      }
    } catch (error: any) {
      const errorMsg = `USDC error: ${error.message}`;
      response.usdc.error = errorMsg;
      response.errors.push(errorMsg);
      console.error(`[REFILL] ❌ ${errorMsg}`, error);
    }

    // Check and refill EURC
    try {
      console.log("[REFILL] Checking EURC faucet balance...");
      const eurcBalance = await publicClient.readContract({
        address: EURC_FAUCET_ADDRESS,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "faucetBalance",
      });

      response.eurc.checked = true;
      response.eurc.balance = eurcBalance.toString();
      response.eurc.balanceFormatted = (Number(eurcBalance) / 1_000_000).toFixed(2);

      console.log(`[REFILL] EURC balance: ${response.eurc.balanceFormatted} (threshold: ${response.eurc.thresholdFormatted})`);

      if (eurcBalance < EURC_THRESHOLD) {
        console.log(`[REFILL] EURC balance below threshold! Checking wallet balance...`);

        // Check wallet balance
        const walletBalance = await publicClient.readContract({
          address: EURC_TESTNET_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        });

        response.eurc.walletBalance = walletBalance.toString();
        response.eurc.walletBalanceFormatted = (Number(walletBalance) / 1_000_000).toFixed(2);

        console.log(`[REFILL] Wallet EURC balance: ${response.eurc.walletBalanceFormatted}`);

        if (walletBalance >= EURC_REFILL_AMOUNT) {
          console.log(`[REFILL] Refilling EURC with ${Number(EURC_REFILL_AMOUNT) / 1_000_000} EURC...`);

          // Transfer tokens (nonce is handled automatically by viem)
          const txHash = await walletClient.writeContract({
            address: EURC_TESTNET_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [EURC_FAUCET_ADDRESS, EURC_REFILL_AMOUNT],
          });

          console.log(`[REFILL] EURC transfer submitted: ${txHash}`);

          // Wait for transaction receipt (with timeout)
          const receipt = await Promise.race([
            publicClient.waitForTransactionReceipt({ hash: txHash }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Transaction timeout")), 60000)
            ),
          ]) as any;

          if (receipt.status === "success") {
            response.eurc.refilled = true;
            response.eurc.txHash = txHash;
            console.log(`[REFILL] ✅ EURC refill successful! TX: ${txHash}`);

            // Verify new balance
            const newBalance = await publicClient.readContract({
              address: EURC_FAUCET_ADDRESS,
              abi: ARCTESTNET_FAUCET_ABI,
              functionName: "faucetBalance",
            });
            response.eurc.balance = newBalance.toString();
            response.eurc.balanceFormatted = (Number(newBalance) / 1_000_000).toFixed(2);
            console.log(`[REFILL] New EURC balance: ${response.eurc.balanceFormatted}`);
          } else {
            throw new Error("Transaction failed");
          }
        } else {
          const error = `Insufficient wallet balance. Need ${Number(EURC_REFILL_AMOUNT) / 1_000_000} EURC, have ${response.eurc.walletBalanceFormatted}`;
          response.eurc.error = error;
          response.errors.push(`EURC: ${error}`);
          console.error(`[REFILL] ❌ ${error}`);
        }
      } else {
        console.log(`[REFILL] EURC balance above threshold, no refill needed`);
      }
    } catch (error: any) {
      const errorMsg = `EURC error: ${error.message}`;
      response.eurc.error = errorMsg;
      response.errors.push(errorMsg);
      console.error(`[REFILL] ❌ ${errorMsg}`, error);
    }

    const duration = Date.now() - startTime;
    response.duration = `${duration}ms`;
    response.success = response.errors.length === 0;

    console.log(`[REFILL] Completed in ${duration}ms. Success: ${response.success}`);

    return NextResponse.json(response, {
      status: response.success ? 200 : 500,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    response.success = false;
    response.duration = `${duration}ms`;
    response.errors.push(`Fatal error: ${error.message}`);

    console.error(`[REFILL] ❌ Fatal error: ${error.message}`, error);

    return NextResponse.json(response, { status: 500 });
  }
}
