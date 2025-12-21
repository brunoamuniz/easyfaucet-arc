import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { checkUSDCBalance, bridgeUSDC } from "@/lib/services/bridge-service";
import { BRIDGE_CONFIG } from "@/lib/config/bridge";
import { sendTelegramMessage, formatBridgeStartMessage, formatBridgeCompleteMessage } from "@/lib/services/telegram-bot";

/**
 * GET /api/bridge/auto
 * Automatic bridge cron job endpoint
 * 
 * Checks if there's USDC on Sepolia and automatically bridges to ARC Testnet
 * Runs every 10 minutes via Vercel Cron Job
 * 
 * Authentication:
 * - Option 1: Vercel Cron Job automatically adds x-vercel-cron header
 * - Option 2: Authorization header with BRIDGE_CRON_SECRET (if configured)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const requestId = `bridge-auto-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log(`[BRIDGE_AUTO:${requestId}] ========================================`);
  console.log(`[BRIDGE_AUTO:${requestId}] Starting automatic bridge check`);
  console.log(`[BRIDGE_AUTO:${requestId}] Timestamp: ${timestamp}`);
  console.log(`[BRIDGE_AUTO:${requestId}] Request ID: ${requestId}`);
  console.log(`[BRIDGE_AUTO:${requestId}] ========================================`);

  try {
    // Optional: Verify authentication
    console.log(`[BRIDGE_AUTO:${requestId}] Checking authentication...`);
    const vercelCron = request.headers.get("x-vercel-cron");
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.BRIDGE_CRON_SECRET;

    console.log(`[BRIDGE_AUTO:${requestId}] Auth check - Vercel Cron: ${!!vercelCron}, Auth Header: ${!!authHeader}, Secret configured: ${!!cronSecret}`);

    // If BRIDGE_CRON_SECRET is configured, require authentication
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
      console.warn(`[BRIDGE_AUTO:${requestId}] ❌ Unauthorized access attempt`);
      console.warn(`[BRIDGE_AUTO:${requestId}] Vercel Cron: ${!!vercelCron}, Auth Header: ${authHeader ? "present" : "missing"}`);
      return NextResponse.json(
        { success: false, error: "Unauthorized", requestId },
        { status: 401 }
      );
    }

    console.log(`[BRIDGE_AUTO:${requestId}] ✅ Authentication passed`);

    // Check if bridge is enabled
    console.log(`[BRIDGE_AUTO:${requestId}] Checking bridge configuration...`);
    console.log(`[BRIDGE_AUTO:${requestId}] BRIDGE_ENABLED: ${BRIDGE_CONFIG.enabled}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Source Chain: ${BRIDGE_CONFIG.sourceChain}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Target Chain: ${BRIDGE_CONFIG.targetChain}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Min Amount: ${BRIDGE_CONFIG.minAmount} USDC`);

    if (!BRIDGE_CONFIG.enabled) {
      console.log(`[BRIDGE_AUTO:${requestId}] ⚠️ Bridge is disabled. Set BRIDGE_ENABLED=true to enable.`);
      return NextResponse.json({
        success: false,
        message: "Bridge is disabled",
        enabled: false,
        requestId,
      });
    }

    console.log(`[BRIDGE_AUTO:${requestId}] ✅ Bridge is enabled`);

    // Verify PRIVATE_KEY is configured
    console.log(`[BRIDGE_AUTO:${requestId}] Verifying environment variables...`);
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error(`[BRIDGE_AUTO:${requestId}] ❌ PRIVATE_KEY not configured`);
      throw new Error("PRIVATE_KEY not configured in environment variables");
    }
    console.log(`[BRIDGE_AUTO:${requestId}] ✅ PRIVATE_KEY configured (length: ${privateKey.length})`);

    // Get wallet address from private key
    console.log(`[BRIDGE_AUTO:${requestId}] Deriving wallet address from private key...`);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletAddress = account.address;

    console.log(`[BRIDGE_AUTO:${requestId}] ✅ Wallet address: ${walletAddress}`);

    // Check balances
    console.log(`[BRIDGE_AUTO:${requestId}] Configuring RPC URLs...`);
    const sepoliaRpcUrl =
      process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
    const arcRpcUrl =
      process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

    console.log(`[BRIDGE_AUTO:${requestId}] Sepolia RPC: ${sepoliaRpcUrl.substring(0, 30)}...`);
    console.log(`[BRIDGE_AUTO:${requestId}] ARC RPC: ${arcRpcUrl.substring(0, 30)}...`);

    console.log(`[BRIDGE_AUTO:${requestId}] Checking USDC balances...`);
    console.log(`[BRIDGE_AUTO:${requestId}] Checking Sepolia balance (chain ID: 11155111)...`);
    
    let sepoliaBalance;
    try {
      sepoliaBalance = await checkUSDCBalance(
        11155111,
        walletAddress,
        sepoliaRpcUrl
      );
      console.log(`[BRIDGE_AUTO:${requestId}] ✅ Sepolia balance check successful`);
      console.log(`[BRIDGE_AUTO:${requestId}] Sepolia balance: ${sepoliaBalance.balanceFormatted} USDC (raw: ${sepoliaBalance.balance.toString()})`);
      console.log(`[BRIDGE_AUTO:${requestId}] Sepolia has enough: ${sepoliaBalance.hasEnough}`);
    } catch (error: any) {
      console.error(`[BRIDGE_AUTO:${requestId}] ❌ Failed to check Sepolia balance:`, error);
      console.error(`[BRIDGE_AUTO:${requestId}] Error message: ${error?.message || error}`);
      console.error(`[BRIDGE_AUTO:${requestId}] Error stack: ${error?.stack || "N/A"}`);
      throw error;
    }

    console.log(`[BRIDGE_AUTO:${requestId}] Checking ARC Testnet balance (chain ID: 5042002)...`);
    
    let arcBalance;
    try {
      arcBalance = await checkUSDCBalance(
        5042002,
        walletAddress,
        arcRpcUrl
      );
      console.log(`[BRIDGE_AUTO:${requestId}] ✅ ARC Testnet balance check successful`);
      console.log(`[BRIDGE_AUTO:${requestId}] ARC Testnet balance: ${arcBalance.balanceFormatted} USDC (raw: ${arcBalance.balance.toString()})`);
      console.log(`[BRIDGE_AUTO:${requestId}] ARC has enough: ${arcBalance.hasEnough}`);
    } catch (error: any) {
      console.error(`[BRIDGE_AUTO:${requestId}] ❌ Failed to check ARC Testnet balance:`, error);
      console.error(`[BRIDGE_AUTO:${requestId}] Error message: ${error?.message || error}`);
      console.error(`[BRIDGE_AUTO:${requestId}] Error stack: ${error?.stack || "N/A"}`);
      throw error;
    }

    // Minimum amount to bridge (from config or default 1000 USDC)
    const minAmount = parseFloat(BRIDGE_CONFIG.minAmount);
    const minAmountBigInt = BigInt(Math.floor(minAmount * 1_000_000)); // 6 decimals

    console.log(`[BRIDGE_AUTO:${requestId}] Evaluating bridge necessity...`);
    console.log(`[BRIDGE_AUTO:${requestId}] Minimum amount required: ${minAmount} USDC (${minAmountBigInt.toString()} raw)`);
    console.log(`[BRIDGE_AUTO:${requestId}] Sepolia balance: ${sepoliaBalance.balance.toString()} (${sepoliaBalance.balanceFormatted} USDC)`);
    console.log(`[BRIDGE_AUTO:${requestId}] Comparison: ${sepoliaBalance.balance.toString()} >= ${minAmountBigInt.toString()} = ${sepoliaBalance.balance >= minAmountBigInt}`);

    // Check if we have USDC on Sepolia
    if (sepoliaBalance.balance < minAmountBigInt) {
      console.log(`[BRIDGE_AUTO:${requestId}] ⚠️ Insufficient balance on Sepolia`);
      console.log(`[BRIDGE_AUTO:${requestId}] Need at least: ${minAmount} USDC`);
      console.log(`[BRIDGE_AUTO:${requestId}] Current balance: ${sepoliaBalance.balanceFormatted} USDC`);
      console.log(`[BRIDGE_AUTO:${requestId}] Action: SKIPPED (insufficient balance)`);
      
      return NextResponse.json({
        success: true,
        message: "No USDC on Sepolia to bridge",
        action: "skipped",
        balances: {
          sepolia: sepoliaBalance.balanceFormatted,
          arc: arcBalance.balanceFormatted,
        },
        minAmount,
        requestId,
      });
    }

    console.log(`[BRIDGE_AUTO:${requestId}] ✅ Sufficient balance on Sepolia, proceeding with bridge`);

    // Calculate bridge amount (use all available balance, but at least minAmount)
    const bridgeAmount = sepoliaBalance.balance >= minAmountBigInt
      ? sepoliaBalance.balance
      : minAmountBigInt;
    const bridgeAmountFormatted = (Number(bridgeAmount) / 1_000_000).toFixed(2);

    console.log(`[BRIDGE_AUTO:${requestId}] Calculating bridge amount...`);
    console.log(`[BRIDGE_AUTO:${requestId}] Available balance: ${sepoliaBalance.balance.toString()}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Minimum required: ${minAmountBigInt.toString()}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Bridge amount: ${bridgeAmount.toString()} (${bridgeAmountFormatted} USDC)`);

    console.log(`[BRIDGE_AUTO:${requestId}] ========================================`);
    console.log(`[BRIDGE_AUTO:${requestId}] Initiating bridge transaction...`);
    console.log(`[BRIDGE_AUTO:${requestId}] Amount: ${bridgeAmountFormatted} USDC`);
    console.log(`[BRIDGE_AUTO:${requestId}] From: Sepolia (Ethereum_Sepolia)`);
    console.log(`[BRIDGE_AUTO:${requestId}] To: ARC Testnet (Arc_Testnet)`);
    console.log(`[BRIDGE_AUTO:${requestId}] Recipient: ${walletAddress}`);
    console.log(`[BRIDGE_AUTO:${requestId}] ========================================`);

    // Send Telegram notification: Bridge starting
    sendTelegramMessage({
      text: formatBridgeStartMessage(
        bridgeAmountFormatted,
        "Ethereum_Sepolia",
        "Arc_Testnet",
        sepoliaBalance.balanceFormatted,
        arcBalance.balanceFormatted,
        walletAddress
      ),
    }, `BRIDGE_AUTO:${requestId}`).catch((err) => {
      console.error(`[BRIDGE_AUTO:${requestId}] Failed to send Telegram notification (bridge start):`, err?.message || err);
    });

    // Execute bridge
    let bridgeResult;
    try {
      const bridgeStartTime = Date.now();
      console.log(`[BRIDGE_AUTO:${requestId}] Calling bridgeUSDC service...`);
      
      bridgeResult = await bridgeUSDC(
        bridgeAmountFormatted,
        walletAddress,
        privateKey
      );

      const bridgeDuration = Date.now() - bridgeStartTime;
      console.log(`[BRIDGE_AUTO:${requestId}] Bridge service call completed in ${bridgeDuration}ms`);
      console.log(`[BRIDGE_AUTO:${requestId}] Bridge result success: ${bridgeResult.success}`);
      
      if (bridgeResult.transactionHash) {
        console.log(`[BRIDGE_AUTO:${requestId}] Transaction hash: ${bridgeResult.transactionHash}`);
      }
      if (bridgeResult.error) {
        console.error(`[BRIDGE_AUTO:${requestId}] Bridge error: ${bridgeResult.error}`);
      }
      if (bridgeResult.message) {
        console.log(`[BRIDGE_AUTO:${requestId}] Bridge message: ${bridgeResult.message}`);
      }
    } catch (error: any) {
      console.error(`[BRIDGE_AUTO:${requestId}] ❌ Exception during bridge execution:`);
      console.error(`[BRIDGE_AUTO:${requestId}] Error type: ${error?.constructor?.name || "Unknown"}`);
      console.error(`[BRIDGE_AUTO:${requestId}] Error message: ${error?.message || error}`);
      console.error(`[BRIDGE_AUTO:${requestId}] Error stack: ${error?.stack || "N/A"}`);
      throw error;
    }

    if (!bridgeResult.success) {
      console.error(`[BRIDGE_AUTO:${requestId}] ❌ Bridge failed`);
      console.error(`[BRIDGE_AUTO:${requestId}] Error: ${bridgeResult.error}`);
      console.error(`[BRIDGE_AUTO:${requestId}] Message: ${bridgeResult.message}`);
      
      // Send Telegram notification: Bridge failed
      sendTelegramMessage({
        text: formatBridgeCompleteMessage(
          bridgeAmountFormatted,
          bridgeResult.fromChain || "Ethereum_Sepolia",
          bridgeResult.toChain || "Arc_Testnet",
          bridgeResult.transactionHash || "N/A",
          false,
          bridgeResult.error || bridgeResult.message
        ),
      }, `BRIDGE_AUTO:${requestId}`).catch((err) => {
        console.error(`[BRIDGE_AUTO:${requestId}] Failed to send Telegram notification (bridge error):`, err?.message || err);
      });
      
      return NextResponse.json(
        {
          success: false,
          error: bridgeResult.error,
          message: bridgeResult.message,
          balances: {
            sepolia: sepoliaBalance.balanceFormatted,
            arc: arcBalance.balanceFormatted,
          },
          requestId,
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;

    console.log(`[BRIDGE_AUTO:${requestId}] ========================================`);
    console.log(`[BRIDGE_AUTO:${requestId}] ✅ Bridge initiated successfully!`);
    console.log(`[BRIDGE_AUTO:${requestId}] Total execution time: ${duration}ms`);
    console.log(`[BRIDGE_AUTO:${requestId}] Transaction hash: ${bridgeResult.transactionHash}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Amount bridged: ${bridgeAmountFormatted} USDC`);
    console.log(`[BRIDGE_AUTO:${requestId}] From: ${bridgeResult.fromChain}`);
    console.log(`[BRIDGE_AUTO:${requestId}] To: ${bridgeResult.toChain}`);
    console.log(`[BRIDGE_AUTO:${requestId}] Note: Bridge can take 5-15 minutes to complete`);
    console.log(`[BRIDGE_AUTO:${requestId}] ========================================`);

    // Send Telegram notification: Bridge completed (initiated successfully)
    // Note: The actual bridge completion on-chain takes 5-15 minutes
    // This notification indicates the bridge transaction was submitted successfully
    sendTelegramMessage({
      text: formatBridgeCompleteMessage(
        bridgeAmountFormatted,
        bridgeResult.fromChain || "Ethereum_Sepolia",
        bridgeResult.toChain || "Arc_Testnet",
        bridgeResult.transactionHash || "N/A",
        true,
        undefined,
        arcBalance.balanceFormatted // Current balance (will update after bridge completes)
      ),
    }, `BRIDGE_AUTO:${requestId}`).catch((err) => {
      console.error(`[BRIDGE_AUTO:${requestId}] Failed to send Telegram notification (bridge complete):`, err?.message || err);
    });

    return NextResponse.json({
      success: true,
      message: "Bridge initiated successfully",
      action: "bridged",
      transactionHash: bridgeResult.transactionHash,
      amount: bridgeAmountFormatted,
      fromChain: bridgeResult.fromChain,
      toChain: bridgeResult.toChain,
      recipient: walletAddress,
      balances: {
        sepolia: sepoliaBalance.balanceFormatted,
        arc: arcBalance.balanceFormatted,
      },
      note: "Bridge can take 5-15 minutes to complete. Check ARC Testnet balance after completion.",
      duration: `${duration}ms`,
      timestamp,
      requestId,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.error(`[BRIDGE_AUTO:${requestId}] ========================================`);
    console.error(`[BRIDGE_AUTO:${requestId}] ❌ FATAL ERROR`);
    console.error(`[BRIDGE_AUTO:${requestId}] Execution time: ${duration}ms`);
    console.error(`[BRIDGE_AUTO:${requestId}] Error type: ${error?.constructor?.name || "Unknown"}`);
    console.error(`[BRIDGE_AUTO:${requestId}] Error message: ${error?.message || error}`);
    console.error(`[BRIDGE_AUTO:${requestId}] Error code: ${error?.code || "N/A"}`);
    console.error(`[BRIDGE_AUTO:${requestId}] Error name: ${error?.name || "N/A"}`);
    
    if (error?.stack) {
      console.error(`[BRIDGE_AUTO:${requestId}] Error stack:`);
      console.error(error.stack);
    }
    
    if (error?.cause) {
      console.error(`[BRIDGE_AUTO:${requestId}] Error cause:`, error.cause);
    }
    
    console.error(`[BRIDGE_AUTO:${requestId}] ========================================`);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
        errorType: error?.constructor?.name || "Unknown",
        errorCode: error?.code || undefined,
        duration: `${duration}ms`,
        timestamp,
        requestId,
      },
      { status: 500 }
    );
  }
}
