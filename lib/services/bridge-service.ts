import { BridgeKit } from "@circle-fin/bridge-kit";
import { createAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, http } from "viem";
import { sepolia } from "@/lib/config/bridge";
import { arcTestnet } from "@/lib/config/chains";
import { USDC_TESTNET_ADDRESS } from "@/lib/config/faucet";
import { ERC20_ABI } from "@/lib/contracts/ERC20.abi";

/**
 * Bridge Service
 * 
 * Serviço para executar bridge automático de USDC entre chains
 * usando Circle Bridge Kit
 */

interface BridgeResult {
  success: boolean;
  transactionHash?: string;
  amount?: string;
  fromChain?: string;
  toChain?: string;
  error?: string;
  message?: string;
}

interface BalanceCheckResult {
  balance: bigint;
  balanceFormatted: string;
  hasEnough: boolean;
}

/**
 * Check USDC balance on a specific chain
 * Includes retry logic and fallback RPC URLs for reliability
 */
export async function checkUSDCBalance(
  chainId: number,
  address: string,
  rpcUrl: string
): Promise<BalanceCheckResult> {
  // Fallback RPC URLs for Sepolia (public RPCs)
  const sepoliaFallbackRPCs = [
    rpcUrl, // Primary RPC (from env or default)
    "https://rpc.sepolia.org",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.gateway.tenderly.co",
    "https://rpc2.sepolia.org",
  ];

  // Fallback RPC URLs for ARC Testnet
  const arcFallbackRPCs = [
    rpcUrl, // Primary RPC (from env or default)
    "https://rpc.testnet.arc.network",
  ];

  const rpcUrls = chainId === 11155111 ? sepoliaFallbackRPCs : arcFallbackRPCs;
  const usdcAddress =
    chainId === 11155111
      ? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" // Sepolia USDC
      : USDC_TESTNET_ADDRESS; // ARC Testnet USDC

  let lastError: any = null;

  // Try each RPC URL with retry logic
  for (let i = 0; i < rpcUrls.length; i++) {
    const currentRpcUrl = rpcUrls[i];
    try {
      console.log(`[BRIDGE] Attempting balance check (${i + 1}/${rpcUrls.length}) with RPC: ${currentRpcUrl.substring(0, 50)}...`);
      
      const publicClient = createPublicClient({
        chain: chainId === 11155111 ? sepolia : arcTestnet,
        transport: http(currentRpcUrl, {
          timeout: 10000, // 10 seconds timeout per request
          retryCount: 1, // Retry once per RPC
          retryDelay: 500, // 500ms between retries
        }),
      });

      const balance = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      const balanceFormatted = (Number(balance) / 1_000_000).toFixed(2);
      console.log(`[BRIDGE] ✅ Balance check successful with RPC: ${currentRpcUrl.substring(0, 50)}...`);
      console.log(`[BRIDGE] Balance: ${balanceFormatted} USDC (raw: ${balance.toString()})`);

      return {
        balance: balance as bigint,
        balanceFormatted,
        hasEnough: balance > BigInt(0),
      };
    } catch (error: any) {
      const errorMsg = error?.message || error?.shortMessage || String(error);
      console.error(`[BRIDGE] ❌ RPC failed (${i + 1}/${rpcUrls.length}): ${currentRpcUrl.substring(0, 50)}...`);
      console.error(`[BRIDGE] Error: ${errorMsg.substring(0, 100)}`);
      lastError = error;
      
      // If it's the last RPC URL, return error result instead of throwing
      if (i === rpcUrls.length - 1) {
        console.error(`[BRIDGE] ❌ All ${rpcUrls.length} RPC URLs failed for chain ${chainId}`);
        console.error(`[BRIDGE] Last error: ${errorMsg.substring(0, 200)}`);
        // Return zero balance instead of throwing to allow the process to continue
        // The bridge will be skipped but won't crash the cron job
        return {
          balance: BigInt(0),
          balanceFormatted: "0",
          hasEnough: false,
        };
      }
      
      // Try next RPC URL
      console.log(`[BRIDGE] Retrying with next RPC URL...`);
    }
  }

  // Fallback: return zero balance if all RPCs failed
  console.error(`[BRIDGE] ❌ All RPC attempts exhausted. Returning zero balance.`);
  return {
    balance: BigInt(0),
    balanceFormatted: "0",
    hasEnough: false,
  };
}

/**
 * Execute bridge from Sepolia to ARC Testnet
 */
export async function bridgeUSDC(
  amount: string, // Amount in USDC (e.g., "1000.00")
  recipientAddress: string,
  privateKey: string
): Promise<BridgeResult> {
  console.log(`[BRIDGE] Initiating bridge: ${amount} USDC from Sepolia to ARC Testnet`);
  console.log(`[BRIDGE] Recipient: ${recipientAddress}`);

  try {
    // Create adapters for both chains
    const sepoliaAdapter = createAdapterFromPrivateKey({
      privateKey,
      chainId: 11155111, // Sepolia
    });

    const arcAdapter = createAdapterFromPrivateKey({
      privateKey,
      chainId: 5042002, // ARC Testnet
    });

    // Initialize Bridge Kit
    const kit = new BridgeKit();

    // Execute bridge
    console.log(`[BRIDGE] Executing bridge transaction...`);
    
    // Bridge Kit uses specific chain names from BridgeChain enum
    // Confirmed names: "Ethereum_Sepolia" and "Arc_Testnet"
    console.log(`[BRIDGE] Executing bridge: Ethereum_Sepolia → Arc_Testnet`);
    
    const result = await kit.bridge({
      from: {
        adapter: sepoliaAdapter,
        chain: "Ethereum_Sepolia",
      },
      to: {
        adapter: arcAdapter,
        chain: "Arc_Testnet",
      },
      amount,
      recipient: recipientAddress,
    });

    console.log(`[BRIDGE] ✅ Bridge initiated successfully`);
    console.log(`[BRIDGE] Transaction hash: ${result.transactionHash}`);

    return {
      success: true,
      transactionHash: result.transactionHash,
      amount,
      fromChain: "Ethereum_Sepolia",
      toChain: "Arc_Testnet",
      message: "Bridge initiated successfully",
    };
  } catch (error: any) {
    console.error(`[BRIDGE] ❌ Bridge failed:`, error);
    
    // Check if ARC Testnet is supported
    if (error.message?.includes("not supported") || error.message?.includes("Arc")) {
      return {
        success: false,
        error: "ARC Testnet may not be supported by Circle Bridge Kit",
        message: error.message,
      };
    }

    return {
      success: false,
      error: error.message || "Unknown bridge error",
      message: error.message,
    };
  }
}

/**
 * Wait for bridge confirmation
 * Note: Bridge can take 5-15 minutes to complete
 */
export async function waitForBridgeConfirmation(
  transactionHash: string,
  timeout: number = 900000 // 15 minutes default
): Promise<{ confirmed: boolean; error?: string }> {
  console.log(`[BRIDGE] Waiting for bridge confirmation...`);
  console.log(`[BRIDGE] Transaction hash: ${transactionHash}`);
  console.log(`[BRIDGE] Timeout: ${timeout / 1000 / 60} minutes`);

  const startTime = Date.now();
  const checkInterval = 30000; // Check every 30 seconds

  while (Date.now() - startTime < timeout) {
    try {
      // Note: Bridge Kit may provide a method to check status
      // For now, we'll just wait and log
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[BRIDGE] Still waiting... (${elapsed}s elapsed)`);

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch (error: any) {
      console.error(`[BRIDGE] Error checking confirmation:`, error);
    }
  }

  // After timeout, assume it's still processing (bridge can take time)
  console.log(`[BRIDGE] ⚠️ Timeout reached. Bridge may still be processing.`);
  return {
    confirmed: false,
    error: "Timeout waiting for bridge confirmation",
  };
}

/**
 * Auto-bridge if needed
 * Checks balances and bridges if wallet doesn't have enough on ARC Testnet
 */
export async function autoBridgeIfNeeded(
  requiredAmount: bigint, // Required amount in smallest unit (6 decimals)
  walletAddress: string,
  privateKey: string
): Promise<BridgeResult> {
  console.log(`[BRIDGE] Checking if bridge is needed...`);
  console.log(`[BRIDGE] Required amount: ${Number(requiredAmount) / 1_000_000} USDC`);

  try {
    // Check balance on ARC Testnet
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
    const arcBalance = await checkUSDCBalance(5042002, walletAddress, arcRpcUrl);

    console.log(`[BRIDGE] ARC Testnet balance: ${arcBalance.balanceFormatted} USDC`);

    // If we have enough on ARC, no bridge needed
    if (arcBalance.balance >= requiredAmount) {
      console.log(`[BRIDGE] ✅ Sufficient balance on ARC Testnet, no bridge needed`);
      return {
        success: true,
        message: "Sufficient balance on ARC Testnet",
      };
    }

    // Check balance on Sepolia
    const sepoliaRpcUrl =
      process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
    const sepoliaBalance = await checkUSDCBalance(11155111, walletAddress, sepoliaRpcUrl);

    console.log(`[BRIDGE] Sepolia balance: ${sepoliaBalance.balanceFormatted} USDC`);

    // Calculate amount needed (add 10% buffer)
    const amountNeeded = requiredAmount + (requiredAmount * BigInt(10)) / BigInt(100);
    const amountNeededFormatted = (Number(amountNeeded) / 1_000_000).toFixed(2);

    // Check if we have enough on Sepolia
    if (sepoliaBalance.balance < amountNeeded) {
      console.log(`[BRIDGE] ❌ Insufficient balance on Sepolia`);
      return {
        success: false,
        error: `Insufficient balance on Sepolia. Need ${amountNeededFormatted} USDC, have ${sepoliaBalance.balanceFormatted} USDC`,
      };
    }

    // Execute bridge
    console.log(`[BRIDGE] Executing bridge: ${amountNeededFormatted} USDC from Sepolia to ARC Testnet`);
    const bridgeResult = await bridgeUSDC(amountNeededFormatted, walletAddress, privateKey);

    if (!bridgeResult.success) {
      return bridgeResult;
    }

    // Wait for confirmation (with timeout)
    const timeout = parseInt(process.env.BRIDGE_TIMEOUT || "900000"); // 15 minutes
    const confirmation = await waitForBridgeConfirmation(
      bridgeResult.transactionHash!,
      timeout
    );

    if (!confirmation.confirmed) {
      console.log(`[BRIDGE] ⚠️ Bridge initiated but confirmation timeout reached`);
      return {
        success: true, // Still consider success as bridge was initiated
        transactionHash: bridgeResult.transactionHash,
        amount: amountNeededFormatted,
        fromChain: "Sepolia",
        toChain: "Arc",
        message: "Bridge initiated but confirmation pending",
      };
    }

    return bridgeResult;
  } catch (error: any) {
    console.error(`[BRIDGE] ❌ Auto-bridge error:`, error);
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}
