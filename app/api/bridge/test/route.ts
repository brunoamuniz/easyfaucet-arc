import { NextRequest, NextResponse } from "next/server";
import { autoBridgeIfNeeded, bridgeUSDC, checkUSDCBalance } from "@/lib/services/bridge-service";
import { BRIDGE_CONFIG } from "@/lib/config/bridge";

/**
 * POST /api/bridge/test
 * Endpoint de teste para bridge manual
 * 
 * Body:
 * {
 *   amount: "1000.00",  // Quantidade em USDC (opcional, usa BRIDGE_MIN_AMOUNT se não fornecido)
 *   recipient?: "0x..."  // Endereço destinatário (opcional, usa PRIVATE_KEY wallet se não fornecido)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: "PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const amount = body.amount || BRIDGE_CONFIG.minAmount;
    const recipient = body.recipient;
    const force = body.force === true; // Skip balance check for testing

    // Get wallet address from private key
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletAddress = recipient || account.address;

    console.log(`[BRIDGE_TEST] Starting bridge test...`);
    console.log(`[BRIDGE_TEST] Amount: ${amount} USDC`);
    console.log(`[BRIDGE_TEST] From: Sepolia`);
    console.log(`[BRIDGE_TEST] To: ARC Testnet`);
    console.log(`[BRIDGE_TEST] Recipient: ${walletAddress}`);

    // Check balances before bridge
    console.log(`[BRIDGE_TEST] Checking balances...`);
    const sepoliaRpcUrl =
      process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

    const sepoliaBalance = await checkUSDCBalance(11155111, walletAddress, sepoliaRpcUrl);
    const arcBalance = await checkUSDCBalance(5042002, walletAddress, arcRpcUrl);

    console.log(`[BRIDGE_TEST] Sepolia balance: ${sepoliaBalance.balanceFormatted} USDC`);
    console.log(`[BRIDGE_TEST] ARC Testnet balance: ${arcBalance.balanceFormatted} USDC`);

    // Convert amount to BigInt (6 decimals)
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1_000_000));

    // Check if we have enough on Sepolia (unless force is true)
    if (!force && sepoliaBalance.balance < amountBigInt) {
      return NextResponse.json({
        success: false,
        error: `Insufficient balance on Sepolia. Need ${amount} USDC, have ${sepoliaBalance.balanceFormatted} USDC`,
        balances: {
          sepolia: sepoliaBalance.balanceFormatted,
          arc: arcBalance.balanceFormatted,
        },
        note: "Add 'force: true' in request body to skip balance check (for testing only)",
      });
    }

    if (force) {
      console.log(`[BRIDGE_TEST] ⚠️ Force mode enabled - skipping balance check`);
    }

    // Execute bridge
    console.log(`[BRIDGE_TEST] Executing bridge...`);
    const bridgeResult = await bridgeUSDC(amount, walletAddress, privateKey);

    if (!bridgeResult.success) {
      return NextResponse.json({
        success: false,
        error: bridgeResult.error,
        message: bridgeResult.message,
        balances: {
          sepolia: sepoliaBalance.balanceFormatted,
          arc: arcBalance.balanceFormatted,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Bridge initiated successfully",
      transactionHash: bridgeResult.transactionHash,
      amount,
      fromChain: "Sepolia",
      toChain: "ARC Testnet",
      recipient: walletAddress,
      balances: {
        sepolia: sepoliaBalance.balanceFormatted,
        arc: arcBalance.balanceFormatted,
      },
      note: "Bridge can take 5-15 minutes to complete. Check ARC Testnet balance after completion.",
    });
  } catch (error: any) {
    console.error(`[BRIDGE_TEST] Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bridge/test
 * Verifica saldos e status do bridge
 */
export async function GET(request: NextRequest) {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: "PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletAddress = account.address;

    console.log(`[BRIDGE_TEST] Checking balances for ${walletAddress}...`);

    const sepoliaRpcUrl =
      process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

    const sepoliaBalance = await checkUSDCBalance(11155111, walletAddress, sepoliaRpcUrl);
    const arcBalance = await checkUSDCBalance(5042002, walletAddress, arcRpcUrl);

    return NextResponse.json({
      success: true,
      wallet: walletAddress,
      balances: {
        sepolia: {
          balance: sepoliaBalance.balance.toString(),
          balanceFormatted: sepoliaBalance.balanceFormatted,
          hasEnough: sepoliaBalance.hasEnough,
        },
        arc: {
          balance: arcBalance.balance.toString(),
          balanceFormatted: arcBalance.balanceFormatted,
          hasEnough: arcBalance.hasEnough,
        },
      },
      bridgeConfig: {
        enabled: BRIDGE_CONFIG.enabled,
        sourceChain: BRIDGE_CONFIG.sourceChain,
        targetChain: BRIDGE_CONFIG.targetChain,
        minAmount: BRIDGE_CONFIG.minAmount,
      },
    });
  } catch (error: any) {
    console.error(`[BRIDGE_TEST] Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
