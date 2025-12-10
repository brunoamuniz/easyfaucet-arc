/**
 * Balance Checker Service
 * 
 * Service for checking contract balances and determining if alerts are needed.
 */

import { createPublicClient, http } from 'viem';
import { USDC_FAUCET_ADDRESS, EURC_FAUCET_ADDRESS } from '@/lib/config/faucet';
import { ARCTESTNET_FAUCET_ABI } from '@/lib/contracts/ArcTestnetFaucet.abi';
import { arcTestnet } from '@/lib/config/chains';
import { THRESHOLDS } from '@/lib/config/thresholds';
import { formatAlertMessage } from './telegram-bot';

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
});

export interface BalanceCheckResult {
  needsAlert: boolean;
  balance: bigint;
  balanceInUnits: number;
  message?: string;
}

/**
 * Check balance and determine if alert is needed
 */
export async function checkBalanceAndAlert(
  token: 'USDC' | 'EURC'
): Promise<BalanceCheckResult> {
  try {
    // Get contract address
    const contractAddress = token === 'USDC' ? USDC_FAUCET_ADDRESS : EURC_FAUCET_ADDRESS;
    
    // Read balance from contract
    const balance = await publicClient.readContract({
      address: contractAddress,
      abi: ARCTESTNET_FAUCET_ABI,
      functionName: 'faucetBalance',
    });

    // Convert to units (6 decimals)
    const balanceInUnits = Number(balance) / 1_000_000;
    const threshold = THRESHOLDS[token].alert;
    const claimAmount = THRESHOLDS[token].claimAmount;

    // Check if balance is below threshold
    if (balanceInUnits < threshold) {
      const remainingClaims = Math.floor(balanceInUnits / claimAmount);
      
      // Format alert message
      const message = formatAlertMessage(
        token,
        balanceInUnits,
        threshold,
        remainingClaims,
        contractAddress
      );

      return {
        needsAlert: true,
        balance,
        balanceInUnits,
        message,
      };
    }

    return {
      needsAlert: false,
      balance,
      balanceInUnits,
    };
  } catch (error) {
    console.error(`Error checking balance for ${token}:`, error);
    // Return no alert on error
    return {
      needsAlert: false,
      balance: BigInt(0),
      balanceInUnits: 0,
    };
  }
}

/**
 * Check balance and send alert if needed (fire-and-forget)
 * 
 * This function is designed to be called asynchronously without await.
 * Includes rate limiting to prevent alert spam.
 */
export async function checkBalanceAndNotify(
  token: 'USDC' | 'EURC'
): Promise<void> {
  try {
    // Import cooldown service
    const { canSendAlert, markAlertSent } = await import('./alert-cooldown');
    
    // Check if we can send alert (not in cooldown)
    if (!canSendAlert(token)) {
      console.log(`Alert for ${token} skipped - in cooldown`);
      return;
    }

    // Check balance
    const result = await checkBalanceAndAlert(token);

    // Send alert if needed
    if (result.needsAlert && result.message) {
      const { sendTelegramMessage } = await import('./telegram-bot');
      await sendTelegramMessage({
        text: result.message,
        parseMode: 'Markdown',
      });
      
      // Mark alert as sent (update cooldown)
      markAlertSent(token);
      console.log(`Alert sent for ${token} - Balance: ${result.balanceInUnits.toFixed(2)}`);
    } else {
      console.log(`No alert needed for ${token} - Balance: ${result.balanceInUnits.toFixed(2)}`);
    }
  } catch (error) {
    // Don't throw - this is a background task
    console.error(`Error in checkBalanceAndNotify for ${token}:`, error);
  }
}

