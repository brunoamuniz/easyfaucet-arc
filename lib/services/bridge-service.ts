import { BridgeKit } from "@circle-fin/bridge-kit";
import { createAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, http } from "viem";
import { sepolia } from "@/lib/config/bridge";
import { arcTestnet } from "@/lib/config/chains";
import { USDC_TESTNET_ADDRESS } from "@/lib/config/faucet";
import { ERC20_ABI } from "@/lib/contracts/ERC20.abi";
import { addPendingBridge } from "@/lib/services/pending-bridges";

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
  state?: string; // 'pending' | 'success' | 'error'
  steps?: Array<{
    name: string;
    state: string;
    txHash?: string;
    error?: string;
  }>;
  needsRetry?: boolean;
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
  // Using multiple public RPCs for better reliability
  // Order: Try faster/more reliable RPCs first
  // Remove duplicates and prioritize working RPCs
  const sepoliaFallbackRPCs = [
    rpcUrl, // Primary RPC (from env or default)
    "https://ethereum-sepolia-rpc.publicnode.com", // PublicNode - usually faster
    "https://sepolia.gateway.tenderly.co", // Tenderly - reliable
    "https://rpc2.sepolia.org", // Sepolia official RPC #2
    "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Public Infura endpoint
    "https://eth-sepolia.g.alchemy.com/v2/demo", // Alchemy public endpoint
    "https://sepolia.drpc.org", // dRPC - additional fallback
    "https://rpc.sepolia.org", // Sepolia official RPC #1 (often slow, try last)
  ].filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates

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

  // Log initial parameters for debugging
  console.log(`[BRIDGE] ========================================`);
  console.log(`[BRIDGE] Starting USDC balance check`);
  console.log(`[BRIDGE] Chain ID: ${chainId}`);
  console.log(`[BRIDGE] Wallet address: ${address}`);
  console.log(`[BRIDGE] USDC contract address: ${usdcAddress}`);
  console.log(`[BRIDGE] Primary RPC URL: ${rpcUrl}`);
  console.log(`[BRIDGE] Total fallback RPCs available: ${rpcUrls.length}`);
  console.log(`[BRIDGE] RPC list: ${rpcUrls.map((url, idx) => `${idx + 1}. ${url}`).join(', ')}`);
  console.log(`[BRIDGE] ========================================`);

  let lastError: any = null;
  let successfulRpc: string | null = null;

  // Try each RPC URL with retry logic
  for (let i = 0; i < rpcUrls.length; i++) {
    const currentRpcUrl = rpcUrls[i];
    const attemptStartTime = Date.now();
    
    try {
      console.log(`[BRIDGE] ┌───────────────────────────────────────`);
      console.log(`[BRIDGE] │ Attempt ${i + 1}/${rpcUrls.length}`);
      console.log(`[BRIDGE] │ RPC: ${currentRpcUrl}`);
      console.log(`[BRIDGE] │ Chain ID: ${chainId}`);
      console.log(`[BRIDGE] │ Contract: ${usdcAddress}`);
      console.log(`[BRIDGE] │ Wallet: ${address}`);
      console.log(`[BRIDGE] │ Starting request...`);
      
      const publicClient = createPublicClient({
        chain: chainId === 11155111 ? sepolia : arcTestnet,
        transport: http(currentRpcUrl, {
          timeout: 20000, // 20 seconds timeout per request (increased for slow RPCs)
          retryCount: 1, // Retry once per RPC (reduced to avoid long waits)
          retryDelay: 500, // 500ms between retries
        }),
      });

      console.log(`[BRIDGE] │ Calling readContract (balanceOf)...`);
      const balance = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      const attemptDuration = Date.now() - attemptStartTime;
      const balanceFormatted = (Number(balance) / 1_000_000).toFixed(2);
      successfulRpc = currentRpcUrl;
      
      console.log(`[BRIDGE] │ ✅ SUCCESS!`);
      console.log(`[BRIDGE] │ Duration: ${attemptDuration}ms`);
      console.log(`[BRIDGE] │ Raw balance: ${balance.toString()}`);
      console.log(`[BRIDGE] │ Formatted balance: ${balanceFormatted} USDC`);
      console.log(`[BRIDGE] │ Has enough: ${balance > BigInt(0)}`);
      console.log(`[BRIDGE] │ Working RPC: ${currentRpcUrl}`);
      console.log(`[BRIDGE] └───────────────────────────────────────`);
      console.log(`[BRIDGE] Balance check completed successfully using RPC ${i + 1}/${rpcUrls.length}`);

      return {
        balance: balance as bigint,
        balanceFormatted,
        hasEnough: balance > BigInt(0),
      };
    } catch (error: any) {
      const attemptDuration = Date.now() - attemptStartTime;
      const errorMsg = error?.message || error?.shortMessage || String(error);
      const errorType = error?.constructor?.name || "Unknown";
      
      console.error(`[BRIDGE] │ ❌ FAILED`);
      console.error(`[BRIDGE] │ Duration: ${attemptDuration}ms`);
      console.error(`[BRIDGE] │ Error type: ${errorType}`);
      console.error(`[BRIDGE] │ Error message: ${errorMsg.substring(0, 200)}`);
      
      if (error?.cause) {
        const causeMsg = error.cause?.message || String(error.cause);
        console.error(`[BRIDGE] │ Error cause: ${causeMsg.substring(0, 200)}`);
      }
      
      if (error?.url) {
        console.error(`[BRIDGE] │ Failed URL: ${error.url}`);
      }
      
      lastError = error;
      
      // If it's the last RPC URL, return error result instead of throwing
      if (i === rpcUrls.length - 1) {
        console.error(`[BRIDGE] │ This was the last RPC attempt`);
        console.error(`[BRIDGE] └───────────────────────────────────────`);
        console.error(`[BRIDGE] ========================================`);
        console.error(`[BRIDGE] ❌ ALL ${rpcUrls.length} RPC ATTEMPTS FAILED`);
        console.error(`[BRIDGE] Chain ID: ${chainId}`);
        console.error(`[BRIDGE] Wallet: ${address}`);
        console.error(`[BRIDGE] Contract: ${usdcAddress}`);
        console.error(`[BRIDGE] Last error type: ${errorType}`);
        console.error(`[BRIDGE] Last error: ${errorMsg.substring(0, 300)}`);
        console.error(`[BRIDGE] ========================================`);
        console.error(`[BRIDGE] Returning zero balance to allow cron job to continue`);
        console.error(`[BRIDGE] The bridge will be skipped on this run`);
        console.error(`[BRIDGE] Next cron job will retry in 10 minutes`);
        
        // Return zero balance instead of throwing to allow the process to continue
        // The bridge will be skipped but won't crash the cron job
        return {
          balance: BigInt(0),
          balanceFormatted: "0",
          hasEnough: false,
        };
      }
      
      // Try next RPC URL
      console.error(`[BRIDGE] │ Will try next RPC...`);
      console.error(`[BRIDGE] └───────────────────────────────────────`);
      console.log(`[BRIDGE] Moving to next RPC (${i + 2}/${rpcUrls.length})...`);
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

    // Log detailed bridge result
    console.log(`[BRIDGE] ========================================`);
    console.log(`[BRIDGE] Bridge Result Details:`);
    console.log(`[BRIDGE] State: ${result.state || 'unknown'}`);
    console.log(`[BRIDGE] Transaction Hash: ${result.transactionHash || 'N/A'}`);
    
    if (result.steps && result.steps.length > 0) {
      console.log(`[BRIDGE] Steps (${result.steps.length}):`);
      result.steps.forEach((step, index) => {
        console.log(`[BRIDGE]   ${index + 1}. ${step.name}: ${step.state}`);
        if (step.txHash) {
          console.log(`[BRIDGE]      TX Hash: ${step.txHash}`);
        }
        if (step.error) {
          console.error(`[BRIDGE]      Error: ${step.error}`);
        }
      });
    }
    console.log(`[BRIDGE] ========================================`);

    // Check if bridge completed successfully
    if (result.state === 'success') {
      console.log(`[BRIDGE] ✅ Bridge completed successfully!`);
      return {
        success: true,
        transactionHash: result.transactionHash,
        amount,
        fromChain: "Ethereum_Sepolia",
        toChain: "Arc_Testnet",
        message: "Bridge completed successfully",
        state: result.state,
        steps: result.steps?.map(step => ({
          name: step.name,
          state: step.state,
          txHash: step.txHash,
          error: step.error,
        })),
      };
    }

    // Check if bridge is pending
    if (result.state === 'pending') {
      console.log(`[BRIDGE] ⏳ Bridge is pending (may take 5-15 minutes)`);
      
      // Log which steps completed and which are pending
      const completedSteps = result.steps?.filter(step => step.state === 'success') || [];
      const pendingSteps = result.steps?.filter(step => step.state === 'pending') || [];
      
      console.log(`[BRIDGE] Completed steps: ${completedSteps.map(s => s.name).join(', ')}`);
      console.log(`[BRIDGE] Pending steps: ${pendingSteps.map(s => s.name).join(', ')}`);
      
      // If burn completed but mint is pending, add to pending bridges list
      const burnStep = result.steps?.find(step => step.name === 'burn' && step.state === 'success');
      if (burnStep && burnStep.txHash) {
        console.log(`[BRIDGE] ⚠️ Burn completed but mint pending. Adding to pending bridges...`);
        console.log(`[BRIDGE]    Burn TX: ${burnStep.txHash}`);
        console.log(`[BRIDGE]    API Recovery: POST /api/bridge/recover with burnTxHash`);
        console.log(`[BRIDGE]    The system will automatically retry when attestation is ready`);
        
        // Add to pending bridges for automatic recovery
        try {
          addPendingBridge(burnStep.txHash, recipientAddress, amount);
          console.log(`[BRIDGE] ✅ Added to pending bridges list for automatic recovery`);
        } catch (error: any) {
          console.error(`[BRIDGE] ⚠️ Failed to add to pending bridges: ${error.message}`);
          // Don't fail the bridge operation if this fails
        }
      }
      
      return {
        success: true,
        transactionHash: result.transactionHash,
        amount,
        fromChain: "Ethereum_Sepolia",
        toChain: "Arc_Testnet",
        message: "Bridge initiated and pending completion",
        state: result.state,
        steps: result.steps?.map(step => ({
          name: step.name,
          state: step.state,
          txHash: step.txHash,
          error: step.error,
        })),
        recoveryInfo: burnStep?.txHash ? {
          burnTxHash: burnStep.txHash,
          apiRecoveryEndpoint: "/api/bridge/recover",
          note: "The system will automatically retry when attestation is ready",
        } : undefined,
      };
    }

    // Check if bridge failed and needs retry
    if (result.state === 'error') {
      console.error(`[BRIDGE] ❌ Bridge failed with error state`);
      
      // Try to retry the bridge
      console.log(`[BRIDGE] Attempting to retry bridge...`);
      try {
        const retryResult = await kit.retry(result, {
          from: sepoliaAdapter,
          to: arcAdapter,
        });

        console.log(`[BRIDGE] Retry result state: ${retryResult.state || 'unknown'}`);
        
        if (retryResult.state === 'success' || retryResult.state === 'pending') {
          console.log(`[BRIDGE] ✅ Bridge retry successful`);
          return {
            success: true,
            transactionHash: retryResult.transactionHash,
            amount,
            fromChain: "Ethereum_Sepolia",
            toChain: "Arc_Testnet",
            message: "Bridge retry successful",
            state: retryResult.state,
            steps: retryResult.steps?.map(step => ({
              name: step.name,
              state: step.state,
              txHash: step.txHash,
              error: step.error,
            })),
          };
        }

        // Retry also failed
        const failedStep = result.steps?.find(step => step.state === 'error');
        const errorMessage = failedStep?.error || 'Bridge failed and retry also failed';
        
        console.error(`[BRIDGE] ❌ Bridge retry also failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
          message: "Bridge failed and retry also failed",
          state: retryResult.state || 'error',
          steps: retryResult.steps?.map(step => ({
            name: step.name,
            state: step.state,
            txHash: step.txHash,
            error: step.error,
          })),
          needsRetry: true,
        };
      } catch (retryError: any) {
        console.error(`[BRIDGE] ❌ Failed to retry bridge:`, retryError);
        const failedStep = result.steps?.find(step => step.state === 'error');
        const errorMessage = failedStep?.error || retryError.message || 'Bridge failed and retry threw exception';
        
        return {
          success: false,
          error: errorMessage,
          message: "Bridge failed and retry threw exception",
          state: 'error',
          steps: result.steps?.map(step => ({
            name: step.name,
            state: step.state,
            txHash: step.txHash,
            error: step.error,
          })),
          needsRetry: true,
        };
      }
    }

    // Unknown state
    console.warn(`[BRIDGE] ⚠️ Unknown bridge state: ${result.state}`);
    return {
      success: true,
      transactionHash: result.transactionHash,
      amount,
      fromChain: "Ethereum_Sepolia",
      toChain: "Arc_Testnet",
      message: `Bridge initiated with unknown state: ${result.state}`,
      state: result.state,
      steps: result.steps?.map(step => ({
        name: step.name,
        state: step.state,
        txHash: step.txHash,
        error: step.error,
      })),
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
 * Check bridge status by verifying balances
 * This is a workaround since Bridge Kit doesn't provide a direct status check method
 * We check if the USDC arrived on the destination chain
 */
export async function checkBridgeStatus(
  transactionHash: string,
  recipientAddress: string,
  expectedAmount: string,
  privateKey: string
): Promise<{ completed: boolean; error?: string; currentBalance?: string }> {
  console.log(`[BRIDGE] Checking bridge status...`);
  console.log(`[BRIDGE] Transaction hash: ${transactionHash}`);
  console.log(`[BRIDGE] Expected amount: ${expectedAmount} USDC`);
  console.log(`[BRIDGE] Recipient: ${recipientAddress}`);

  try {
    // Check balance on ARC Testnet
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
    const arcBalance = await checkUSDCBalance(5042002, recipientAddress, arcRpcUrl);
    
    console.log(`[BRIDGE] Current ARC balance: ${arcBalance.balanceFormatted} USDC`);
    
    // Note: This is a simple check - we can't definitively know if this specific
    // transaction completed without tracking the balance before the bridge
    // For now, we'll assume if there's USDC on ARC, the bridge may have completed
    // A better solution would be to track the balance before bridge and compare
    
    return {
      completed: arcBalance.hasEnough,
      currentBalance: arcBalance.balanceFormatted,
    };
  } catch (error: any) {
    console.error(`[BRIDGE] Error checking bridge status:`, error);
    return {
      completed: false,
      error: error.message || "Failed to check bridge status",
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
