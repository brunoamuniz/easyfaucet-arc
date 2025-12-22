import { BridgeKit } from "@circle-fin/bridge-kit";
import { createAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, createWalletClient, http, parseEventLogs, keccak256, toBytes, decodeAbiParameters, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "@/lib/config/bridge";
import { arcTestnet } from "@/lib/config/chains";
import { USDC_TESTNET_ADDRESS } from "@/lib/config/faucet";
import { checkUSDCBalance } from "@/lib/services/bridge-service";
import { ERC20_ABI } from "@/lib/contracts/ERC20.abi";

/**
 * Bridge Recovery Service
 * 
 * Serviço para recuperar transações de bridge pendentes e fazer claim manual
 */

interface AttestationResponse {
  status: 'pending' | 'complete' | 'failed';
  attestation?: string;
  error?: string;
}

interface RecoveryResult {
  success: boolean;
  messageHash?: string;
  messageBytes?: string;
  attestation?: string;
  mintTxHash?: string;
  error?: string;
  message?: string;
  expirationInfo?: {
    expired: boolean;
    expirationBlock?: string;
    currentBlock?: string;
    canRefund: boolean;
  };
}

/**
 * Extract messageHash from burn transaction receipt
 * Uses MessageSent event from the transaction logs
 */
export async function extractMessageHashFromTransaction(
  burnTxHash: string,
  rpcUrl: string
): Promise<{ messageHash?: string; messageBytes?: string; error?: string }> {
  console.log(`[BRIDGE_RECOVERY] Extracting messageHash from transaction...`);
  console.log(`[BRIDGE_RECOVERY] Burn TX Hash: ${burnTxHash}`);
  console.log(`[BRIDGE_RECOVERY] RPC URL: ${rpcUrl}`);

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl, {
        timeout: 20000,
      }),
    });

    // Step 1: Get transaction receipt
    console.log(`[BRIDGE_RECOVERY] Fetching transaction receipt...`);
    const receipt = await publicClient.getTransactionReceipt({
      hash: burnTxHash as `0x${string}`,
    });

    // Step 2: Compute event topic for MessageSent(bytes)
    // Event signature: MessageSent(bytes)
    const eventSignature = "MessageSent(bytes)";
    const eventTopic = keccak256(toBytes(eventSignature));
    
    console.log(`[BRIDGE_RECOVERY] Looking for MessageSent event...`);
    console.log(`[BRIDGE_RECOVERY] Event topic: ${eventTopic}`);

    // Step 3: Find MessageSent event in logs
    const messageSentLog = receipt.logs.find((log) => log.topics[0] === eventTopic);

    if (!messageSentLog) {
      console.error(`[BRIDGE_RECOVERY] MessageSent event not found in transaction logs`);
      console.error(`[BRIDGE_RECOVERY] Available logs: ${receipt.logs.length}`);
      receipt.logs.forEach((log, index) => {
        console.error(`[BRIDGE_RECOVERY] Log ${index}: topic0=${log.topics[0]}, address=${log.address}`);
      });
      return {
        error: "MessageSent event not found in transaction logs",
      };
    }

    console.log(`[BRIDGE_RECOVERY] ✅ MessageSent event found!`);
    console.log(`[BRIDGE_RECOVERY] Log address: ${messageSentLog.address}`);

    // Step 4: Decode message bytes from log data
    console.log(`[BRIDGE_RECOVERY] Decoding message bytes...`);
    const messageBytes = decodeAbiParameters([{ type: 'bytes' }], messageSentLog.data)[0] as `0x${string}`;
    
    console.log(`[BRIDGE_RECOVERY] Message bytes length: ${messageBytes.length} characters`);

    // Step 5: Compute messageHash by hashing the message bytes
    const messageHash = keccak256(messageBytes);
    
    console.log(`[BRIDGE_RECOVERY] ✅ Message hash computed: ${messageHash}`);
    
    return {
      messageHash: messageHash,
      messageBytes: messageBytes, // Return message bytes for mint
    };
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] ❌ Error extracting messageHash:`, error);
    return {
      error: error.message || "Failed to extract messageHash from transaction",
    };
  }
}

/**
 * Get message and attestation from Circle's API v2
 * This is the recommended way - Circle's API combines message retrieval and attestation
 * 
 * API: GET /v2/messages/{sourceDomainId}?transactionHash={transactionHash}
 * 
 * Source Domain IDs:
 * - Ethereum Sepolia (Testnet): 0
 * - ARC Testnet: Check Circle docs for domain ID
 * 
 * Note: For testnet, the API endpoint is the same but may have different behavior
 */
export async function getMessageAndAttestationFromCircle(
  burnTxHash: string,
  sourceDomainId: string = "0" // Ethereum Sepolia testnet
): Promise<{ messageHash?: string; attestation?: string; message?: any; error?: string }> {
  console.log(`[BRIDGE_RECOVERY] Getting message and attestation from Circle API v2 (TESTNET)...`);
  console.log(`[BRIDGE_RECOVERY] Burn TX Hash: ${burnTxHash}`);
  console.log(`[BRIDGE_RECOVERY] Source Domain ID: ${sourceDomainId} (Ethereum Sepolia Testnet)`);

  try {
    // Circle API v2 endpoint - TESTNET uses sandbox endpoint
    // Testnet: https://iris-api-sandbox.circle.com
    // Mainnet: https://iris-api.circle.com
    const apiBaseUrl = "https://iris-api-sandbox.circle.com"; // TESTNET endpoint
    const apiUrl = `${apiBaseUrl}/v2/messages/${sourceDomainId}?transactionHash=${burnTxHash}`;
    
    console.log(`[BRIDGE_RECOVERY] Using TESTNET API endpoint: ${apiBaseUrl}`);
    console.log(`[BRIDGE_RECOVERY] Calling: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BRIDGE_RECOVERY] API error: ${response.status} - ${errorText}`);
      
      // If API fails, try extracting messageHash directly from transaction
      console.log(`[BRIDGE_RECOVERY] API failed, will try extracting messageHash from transaction...`);
      return {
        error: `Circle API error: ${response.status} - ${errorText}. Will try direct extraction.`,
      };
    }

    const data = await response.json();
    
    console.log(`[BRIDGE_RECOVERY] ✅ Response received from API`);
    console.log(`[BRIDGE_RECOVERY] Response data:`, JSON.stringify(data).substring(0, 500));
    
    // API v2 may return data in different formats
    // Check for messages array or direct messageHash
    if (data.messages && data.messages.length > 0) {
      const message = data.messages[0];
      console.log(`[BRIDGE_RECOVERY] Found message in messages array`);
      
      // API v2 may return message as "0x" when status is pending_confirmations
      // We need to extract messageBytes from transaction in this case
      const messageHash = message.messageHash || message.hash;
      const attestation = message.attestation && message.attestation !== 'PENDING' && message.attestation.startsWith('0x')
        ? message.attestation
        : undefined;
      
      // If message is empty or "0x", we'll need to extract from transaction
      const apiMessage = message.message && message.message !== "0x" ? message.message : undefined;
      
      return {
        messageHash,
        attestation,
        message: message,
        apiMessage, // May be undefined if API returns "0x"
      };
    }
    
    // Direct format
    if (data.messageHash || data.hash) {
      // Check if attestation is actually a valid hex string, not "PENDING"
      const attestation = data.attestation && data.attestation !== 'PENDING' && data.attestation.startsWith('0x') 
        ? data.attestation 
        : undefined;
      
      const apiMessage = data.message && data.message !== "0x" ? data.message : undefined;
      
      return {
        messageHash: data.messageHash || data.hash,
        attestation: attestation,
        message: data.message || data,
        apiMessage,
      };
    }
    
    // If no messageHash found, return error to trigger fallback
    console.warn(`[BRIDGE_RECOVERY] ⚠️ No messageHash found in API response`);
    return {
      error: "No messageHash found in API response",
    };
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] ❌ Error calling Circle API:`, error);
    return {
      error: error.message || "Failed to get message from Circle API",
    };
  }
}

/**
 * Fetch attestation from Circle's Attestation Service
 * API: https://iris-api-sandbox.circle.com/v1/attestations/{messageHash} (TESTNET)
 */
export async function fetchAttestation(
  messageHash: string,
  maxRetries: number = 400, // 400 retries * 3s = 20 minutes (enough for Sepolia's 13-19 min)
  retryDelay: number = 3000 // 3 seconds between retries
): Promise<AttestationResponse> {
  console.log(`[BRIDGE_RECOVERY] Fetching attestation from Circle TESTNET API...`);
  console.log(`[BRIDGE_RECOVERY] Message hash: ${messageHash}`);
  console.log(`[BRIDGE_RECOVERY] Max retries: ${maxRetries} (${(maxRetries * retryDelay / 1000 / 60).toFixed(1)} minutes max wait)`);
  console.log(`[BRIDGE_RECOVERY] Retry delay: ${retryDelay}ms`);
  console.log(`[BRIDGE_RECOVERY] ⏳ Note: Sepolia attestation typically takes 13-19 minutes (65 block confirmations)`);

  // Use TESTNET endpoint
  const apiBaseUrl = "https://iris-api-sandbox.circle.com";
  const apiUrl = `${apiBaseUrl}/v1/attestations/${messageHash}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[BRIDGE_RECOVERY] Attempt ${attempt}/${maxRetries}...`);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.error(`[BRIDGE_RECOVERY] API error: ${response.status}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
        return {
          status: 'failed',
          error: `API error: ${response.status}`,
        };
      }
      
      const data = await response.json();
      
      console.log(`[BRIDGE_RECOVERY] Response status: ${data.status || 'N/A'}`);
      console.log(`[BRIDGE_RECOVERY] Response data:`, JSON.stringify(data).substring(0, 300));

      if (data.status === 'complete' || data.attestation) {
        console.log(`[BRIDGE_RECOVERY] ✅ Attestation ready!`);
        return {
          status: 'complete',
          attestation: data.attestation,
        };
      }

      if (data.status === 'failed') {
        console.error(`[BRIDGE_RECOVERY] ❌ Attestation failed`);
        return {
          status: 'failed',
          error: data.error || 'Attestation failed',
        };
      }
      
      // If status is undefined or pending, continue polling

      // Still pending
      if (attempt < maxRetries) {
        console.log(`[BRIDGE_RECOVERY] ⏳ Attestation still pending, waiting ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    } catch (error: any) {
      console.error(`[BRIDGE_RECOVERY] Error fetching attestation (attempt ${attempt}):`, error);
      
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        return {
          status: 'failed',
          error: error.message || 'Failed to fetch attestation after all retries',
        };
      }
    }
  }

  return {
    status: 'pending',
    error: 'Attestation still pending after max retries',
  };
}

/**
 * Decode message bytes to extract nonce, expirationBlock, and other details
 * Message format: version (1 byte) + sourceDomain (4 bytes) + destinationDomain (4 bytes) + nonce (8 bytes) + sender (32 bytes) + recipient (32 bytes) + destinationCaller (32 bytes) + messageBody (variable) + destinationCaller (32 bytes)
 */
export function decodeMessageBytes(messageBytes: string): {
  nonce?: bigint;
  expirationBlock?: bigint;
  sourceDomain?: number;
  destinationDomain?: number;
  sender?: string;
  recipient?: string;
  amount?: bigint;
  error?: string;
} {
  try {
    console.log(`[BRIDGE_RECOVERY] Decoding message bytes to extract details...`);
    
    // Remove 0x prefix if present
    const bytes = messageBytes.startsWith('0x') ? messageBytes.slice(2) : messageBytes;
    const buffer = Buffer.from(bytes, 'hex');
    
    if (buffer.length < 100) {
      return {
        error: "Message bytes too short",
      };
    }
    
    let offset = 0;
    
    // ===== MESSAGE HEADER =====
    // Version (4 bytes) - CCTP V2 uses uint32
    const version = buffer.readUInt32BE(offset);
    offset += 4;
    
    // Source Domain (4 bytes)
    const sourceDomain = buffer.readUInt32BE(offset);
    offset += 4;
    
    // Destination Domain (4 bytes)
    const destinationDomain = buffer.readUInt32BE(offset);
    offset += 4;
    
    // Nonce (32 bytes) - bytes32 in CCTP V2
    const nonceBytes = buffer.slice(offset, offset + 32);
    // Nonce is bytes32, but we can read as bigint from last 8 bytes for display
    const nonce = buffer.readBigUInt64BE(offset + 24); // Last 8 bytes
    offset += 32;
    
    // Sender (32 bytes) - bytes32, extract last 20 bytes for address
    const senderBytes = buffer.slice(offset, offset + 32);
    const sender = '0x' + senderBytes.slice(12).toString('hex'); // Last 20 bytes
    offset += 32;
    
    // Recipient (32 bytes) - bytes32 in header (not mintRecipient yet)
    offset += 32;
    
    // Destination Caller (32 bytes)
    offset += 32;
    
    // Min Finality Threshold (4 bytes)
    offset += 4;
    
    // Finality Threshold Executed (4 bytes)
    offset += 4;
    
    // ===== MESSAGE BODY (BurnMessageV2) =====
    // messageBody starts at offset 148 (after header)
    const messageBodyStart = offset; // Should be 148
    
    // BurnMessageV2 Version (4 bytes) - offset 0 in messageBody
    const burnMessageVersion = buffer.readUInt32BE(offset);
    offset += 4;
    
    // BurnToken (32 bytes) - offset 4 in messageBody
    offset += 32;
    
    // Mint Recipient (32 bytes) - offset 36 in messageBody (148 + 36 = 184 total)
    const mintRecipientBytes = buffer.slice(offset, offset + 32);
    // Address is right-aligned (last 20 bytes of 32-byte slot)
    const recipient = '0x' + mintRecipientBytes.slice(12).toString('hex'); // Last 20 bytes
    offset += 32;
    
    // Amount (32 bytes) - offset 68 in messageBody (148 + 68 = 216 total)
    const amountBytes = buffer.slice(offset, offset + 32);
    // Read as uint256 (big-endian, all 32 bytes)
    const amount = BigInt('0x' + amountBytes.toString('hex'));
    offset += 32;
    
    // Message Body starts here, but we need to find expirationBlock
    // ExpirationBlock is typically in the messageBody
    // For now, let's try to find it - it might be at a specific offset
    
    console.log(`[BRIDGE_RECOVERY] Decoded message:`);
    console.log(`[BRIDGE_RECOVERY]   Source Domain: ${sourceDomain}`);
    console.log(`[BRIDGE_RECOVERY]   Destination Domain: ${destinationDomain}`);
    console.log(`[BRIDGE_RECOVERY]   Nonce: ${nonce.toString()}`);
    console.log(`[BRIDGE_RECOVERY]   Sender: ${sender}`);
    console.log(`[BRIDGE_RECOVERY]   Amount: ${amount.toString()} (${(Number(amount) / 1_000_000).toFixed(2)} USDC)`);
    console.log(`[BRIDGE_RECOVERY]   Recipient: ${recipient}`);
    
    // Continue reading BurnMessageV2 fields
    // MessageSender (32 bytes)
    offset += 32;
    
    // MaxFee (32 bytes)
    offset += 32;
    
    // FeeExecuted (32 bytes)
    offset += 32;
    
    // ExpirationBlock (32 bytes) - THIS IS WHAT WE NEED
    let expirationBlock: bigint | undefined;
    if (buffer.length >= offset + 32) {
      const expirationBytes = buffer.slice(offset, offset + 32);
      expirationBlock = BigInt('0x' + expirationBytes.toString('hex'));
      console.log(`[BRIDGE_RECOVERY]   Expiration Block: ${expirationBlock.toString()}`);
      offset += 32;
    } else {
      console.log(`[BRIDGE_RECOVERY]   ⚠️ Buffer too short to read expirationBlock (need ${offset + 32}, have ${buffer.length})`);
    }
    
  return {
    nonce,
    expirationBlock,
    sourceDomain,
    destinationDomain,
    sender,
    recipient,
    amount,
  };
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] Error decoding message bytes:`, error);
    return {
      error: error.message || "Failed to decode message bytes",
    };
  }
}

/**
 * Check if a burn message has expired and if funds can be recovered
 * Note: CCTP doesn't have a direct refund mechanism, but expired messages cannot be minted
 */
export async function checkBurnExpirationAndRefund(
  burnTxHash: string,
  messageBytes: string,
  rpcUrl: string
): Promise<{
  expired: boolean;
  canRefund: boolean;
  expirationBlock?: bigint;
  currentBlock?: bigint;
  message?: string;
  error?: string;
}> {
  console.log(`[BRIDGE_RECOVERY] ========================================`);
  console.log(`[BRIDGE_RECOVERY] Checking burn expiration and refund possibility...`);
  console.log(`[BRIDGE_RECOVERY] Burn TX: ${burnTxHash}`);
  console.log(`[BRIDGE_RECOVERY] ========================================`);
  
  try {
    // Decode message to get expirationBlock
    const decoded = decodeMessageBytes(messageBytes);
    
    if (decoded.error || !decoded.expirationBlock) {
      console.log(`[BRIDGE_RECOVERY] ⚠️ Could not decode expirationBlock from message`);
      return {
        expired: false,
        canRefund: false,
        message: "Could not determine expiration block. Message format may be different.",
        error: decoded.error,
      };
    }
    
    const expirationBlock = decoded.expirationBlock;
    
    // Get current block number
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl, {
        timeout: 20000,
      }),
    });
    
    const currentBlock = await publicClient.getBlockNumber();
    
    console.log(`[BRIDGE_RECOVERY] Expiration Block: ${expirationBlock.toString()}`);
    console.log(`[BRIDGE_RECOVERY] Current Block: ${currentBlock.toString()}`);
    
    const expired = currentBlock > expirationBlock;
    
    if (expired) {
      console.log(`[BRIDGE_RECOVERY] ⚠️ Message has EXPIRED!`);
      console.log(`[BRIDGE_RECOVERY] Current block (${currentBlock}) > Expiration block (${expirationBlock})`);
      console.log(`[BRIDGE_RECOVERY] Blocks expired: ${currentBlock - expirationBlock}`);
      
      // Check if mint was already done (if not, message is invalid and cannot be minted)
      // However, CCTP doesn't have a direct refund mechanism
      // The funds are permanently burned on the source chain
      // Note: There's no way to recover burned funds in CCTP
      
      return {
        expired: true,
        canRefund: false, // CCTP doesn't support refunds - funds are permanently burned
        expirationBlock,
        currentBlock,
        message: "⚠️ CRITICAL: Message has expired and mint cannot be completed. CCTP does NOT support refunds - the funds were permanently burned on Sepolia. The only option is to contact Circle support for assistance, as there is no on-chain mechanism to recover expired burns.",
      };
    } else {
      const blocksRemaining = expirationBlock - currentBlock;
      const estimatedTimeRemaining = Number(blocksRemaining) * 12; // ~12 seconds per block on Ethereum
      const hoursRemaining = estimatedTimeRemaining / 3600;
      
      console.log(`[BRIDGE_RECOVERY] ✅ Message is still valid`);
      console.log(`[BRIDGE_RECOVERY] Blocks remaining: ${blocksRemaining.toString()}`);
      console.log(`[BRIDGE_RECOVERY] Estimated time remaining: ~${hoursRemaining.toFixed(2)} hours`);
      
      return {
        expired: false,
        canRefund: false, // Even if not expired, CCTP doesn't support refunds
        expirationBlock,
        currentBlock,
        message: `Message is still valid. ${blocksRemaining.toString()} blocks remaining (~${hoursRemaining.toFixed(2)} hours). Complete the mint before expiration.`,
      };
    }
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] ❌ Error checking expiration:`, error);
    return {
      expired: false,
      canRefund: false,
      error: error.message || "Failed to check expiration",
    };
  }
}

/**
 * Check if message was already received (mint already completed)
 * Also checks USDC balance to detect silent mints (when UI hangs but funds arrive)
 */
export async function checkMessageReceived(
  messageHash: string,
  rpcUrl: string,
  expectedAmount?: bigint,
  recipientAddress?: string
): Promise<{ received: boolean; txHash?: string; balanceCheck?: { currentBalance: string; expectedAmount: string; match: boolean }; error?: string }> {
  console.log(`[BRIDGE_RECOVERY] Checking if message was already received...`);
  console.log(`[BRIDGE_RECOVERY] MessageHash: ${messageHash}`);
  if (expectedAmount) {
    console.log(`[BRIDGE_RECOVERY] Expected amount: ${(Number(expectedAmount) / 1_000_000).toFixed(2)} USDC`);
  }

  try {
    // MessageTransmitterV2 contract address on ARC Testnet
    // Source: https://docs.arc.network/arc/references/contract-addresses
    const MESSAGE_TRANSMITTER_ADDRESS = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
    
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl, {
        timeout: 30000,
      }),
    });

    // Check MessageReceived events for this messageHash
    // RPC limits to 10,000 blocks, so check recent blocks first
    // Then do balance check for silent mint detection (more reliable)
    const currentBlock = await publicClient.getBlockNumber();
    const maxBlockRange = BigInt(10000); // RPC limit
    const fromBlock = currentBlock > maxBlockRange ? currentBlock - maxBlockRange : BigInt(0);
    
    console.log(`[BRIDGE_RECOVERY] Checking blocks ${fromBlock} to ${currentBlock} for MessageReceived events (RPC limit: 10k blocks)...`);
    
    // FIRST: Check for specific USDC transfer (more reliable than just balance check)
    // This catches cases where mint completed but UI hung or event wasn't indexed
    if (expectedAmount && recipientAddress) {
      console.log(`[BRIDGE_RECOVERY] Checking for specific USDC transfer to detect silent mint...`);
      try {
        const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
        const transferEvent = parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 value)"
        );
        
        // Check recent blocks for Transfer events to this recipient
        const logs = await publicClient.getLogs({
          address: USDC_ADDRESS,
          event: transferEvent,
          args: {
            to: recipientAddress as `0x${string}`,
          },
          fromBlock: fromBlock,
          toBlock: currentBlock,
        });
        
        console.log(`[BRIDGE_RECOVERY] Found ${logs.length} USDC transfers to recipient in recent blocks`);
        
        // Filter for transfers matching expected amount (with 10% tolerance)
        const tolerance = expectedAmount / BigInt(10); // 10% tolerance
        const matchingTransfers = logs.filter((log) => {
          const transferAmount = log.args.value;
          const diff = transferAmount > expectedAmount 
            ? transferAmount - expectedAmount 
            : expectedAmount - transferAmount;
          return diff <= tolerance;
        });
        
        if (matchingTransfers.length > 0) {
          const tx = matchingTransfers[0];
          const transferAmount = Number(tx.args.value) / 1_000_000;
          const expectedAmountFormatted = (Number(expectedAmount) / 1_000_000).toFixed(2);
          
          console.log(`[BRIDGE_RECOVERY] ✅ SILENT MINT DETECTED! Found matching USDC transfer!`);
          console.log(`[BRIDGE_RECOVERY] Transfer TX: ${tx.transactionHash}`);
          console.log(`[BRIDGE_RECOVERY] Transfer Amount: ${transferAmount.toFixed(2)} USDC`);
          console.log(`[BRIDGE_RECOVERY] Expected Amount: ${expectedAmountFormatted} USDC`);
          console.log(`[BRIDGE_RECOVERY] This indicates a silent mint (UI may have hung but funds arrived)`);
          
          return {
            received: true,
            txHash: tx.transactionHash,
            balanceCheck: {
              currentBalance: transferAmount.toFixed(2),
              expectedAmount: expectedAmountFormatted,
              match: true,
            },
          };
        } else {
          // Also check current balance for informational purposes
          const arcBalance = await checkUSDCBalance(5042002, recipientAddress, rpcUrl);
          const expectedAmountFormatted = (Number(expectedAmount) / 1_000_000).toFixed(2);
          
          console.log(`[BRIDGE_RECOVERY] No matching transfer found in recent blocks`);
          console.log(`[BRIDGE_RECOVERY] Current balance: ${arcBalance.balanceFormatted} USDC`);
          console.log(`[BRIDGE_RECOVERY] Expected amount: ${expectedAmountFormatted} USDC`);
          console.log(`[BRIDGE_RECOVERY] Mint not completed yet (no matching transfer found)`);
        }
      } catch (balanceError: any) {
        console.error(`[BRIDGE_RECOVERY] Error checking transfers:`, balanceError);
        // Continue with event check
      }
    }
    
    // SECOND: Check events in recent blocks (if balance check didn't find it)
    try {
      const logs = await publicClient.getLogs({
        address: MESSAGE_TRANSMITTER_ADDRESS,
        event: parseAbiItem("event MessageReceived(uint256 sourceDomain, uint64 nonce, bytes32 sender, bytes messageBody, bytes32 messageHash)"),
        fromBlock: fromBlock,
        toBlock: currentBlock,
      });

      console.log(`[BRIDGE_RECOVERY] Found ${logs.length} MessageReceived events in recent blocks, filtering by messageHash...`);

      // Filter logs by messageHash
      const matchingLogs = logs.filter((log: any) => {
        const logMessageHash = log.args?.messageHash;
        if (logMessageHash) {
          const matches = logMessageHash.toLowerCase() === messageHash.toLowerCase();
          if (matches) {
            console.log(`[BRIDGE_RECOVERY] ✅ Found matching MessageReceived event!`);
          }
          return matches;
        }
        return false;
      });

      if (matchingLogs.length > 0) {
        console.log(`[BRIDGE_RECOVERY] ✅ Message already received! Found ${matchingLogs.length} event(s)`);
        return {
          received: true,
          txHash: matchingLogs[0].transactionHash,
        };
      }

      console.log(`[BRIDGE_RECOVERY] Message not yet received (checked events and balance)`);
      return {
        received: false,
      };
    } catch (error: any) {
      console.error(`[BRIDGE_RECOVERY] Error checking message received:`, error);
      // Don't fail completely - just return not received
      return {
        received: false,
        error: error.message,
      };
    }
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] Error in checkMessageReceived:`, error);
    return {
      received: false,
      error: error.message,
    };
  }
}

/**
 * Try to complete mint without attestation (if message was already processed)
 * Sometimes Circle processes the message but API doesn't return attestation
 */
export async function tryMintWithoutAttestation(
  messageBytes: string,
  privateKey: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  console.log(`[BRIDGE_RECOVERY] Attempting mint without attestation (message may already be processed)...`);
  
  try {
    const MESSAGE_TRANSMITTER_ADDRESS = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
    const MESSAGE_TRANSMITTER_ABI = [
      {
        inputs: [
          { internalType: "bytes", name: "message", type: "bytes" },
          { internalType: "bytes", name: "attestation", type: "bytes" },
        ],
        name: "receiveMessage",
        outputs: [{ internalType: "bool", name: "success", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
      },
    ] as const;

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
    
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(arcRpcUrl, {
        timeout: 30000,
      }),
    });

    // Try with empty attestation - sometimes the contract accepts it if message was already processed
    // This is a last resort attempt
    console.log(`[BRIDGE_RECOVERY] Trying receiveMessage with empty attestation...`);
    try {
      const txHash = await walletClient.writeContract({
        address: MESSAGE_TRANSMITTER_ADDRESS,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: "receiveMessage",
        args: [messageBytes as `0x${string}`, "0x" as `0x${string}`],
      });
      
      console.log(`[BRIDGE_RECOVERY] ✅ Transaction sent without attestation! TX: ${txHash}`);
      return {
        success: true,
        txHash: txHash,
      };
    } catch (error: any) {
      console.log(`[BRIDGE_RECOVERY] ⚠️ Mint without attestation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Complete mint on destination chain using message bytes and attestation
 * This function directly calls receiveMessage on MessageTransmitter contract
 */
export async function completeMint(
  messageBytes: string,
  attestation: string,
  privateKey: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  console.log(`[BRIDGE_RECOVERY] ========================================`);
  console.log(`[BRIDGE_RECOVERY] Completing mint on ARC Testnet...`);
  console.log(`[BRIDGE_RECOVERY] Message bytes length: ${messageBytes.length}`);
  console.log(`[BRIDGE_RECOVERY] Attestation length: ${attestation.length}`);
  console.log(`[BRIDGE_RECOVERY] ========================================`);

  try {
    // MessageTransmitterV2 contract address on ARC Testnet
    // Source: https://docs.arc.network/arc/references/contract-addresses
    // TokenMessengerV2: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA (domain ID 26)
    // MessageTransmitterV2: 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275
    const MESSAGE_TRANSMITTER_ADDRESS = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
    
    // MessageTransmitter ABI - receiveMessage function
    const MESSAGE_TRANSMITTER_ABI = [
      {
        inputs: [
          { internalType: "bytes", name: "message", type: "bytes" },
          { internalType: "bytes", name: "attestation", type: "bytes" },
        ],
        name: "receiveMessage",
        outputs: [{ internalType: "bool", name: "success", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
      },
    ] as const;

    // Create wallet and client for ARC Testnet
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
    
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(arcRpcUrl, {
        timeout: 30000,
      }),
    });

    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(arcRpcUrl, {
        timeout: 30000,
      }),
    });

    console.log(`[BRIDGE_RECOVERY] Calling receiveMessage on MessageTransmitter...`);
    console.log(`[BRIDGE_RECOVERY] Contract: ${MESSAGE_TRANSMITTER_ADDRESS}`);
    
    // Call receiveMessage function
    const txHash = await walletClient.writeContract({
      address: MESSAGE_TRANSMITTER_ADDRESS,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: "receiveMessage",
      args: [messageBytes as `0x${string}`, attestation as `0x${string}`],
    });

    console.log(`[BRIDGE_RECOVERY] ✅ Transaction sent! TX Hash: ${txHash}`);
    
    // Wait for transaction receipt
    console.log(`[BRIDGE_RECOVERY] Waiting for transaction confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120000, // 2 minutes
    });

    if (receipt.status === 'success') {
      console.log(`[BRIDGE_RECOVERY] ✅ Mint completed successfully!`);
      return {
        success: true,
        txHash: txHash,
      };
    } else {
      console.error(`[BRIDGE_RECOVERY] ❌ Transaction failed`);
      return {
        success: false,
        error: "Transaction failed",
      };
    }
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] ❌ Error completing mint:`, error);
    return {
      success: false,
      error: error.message || "Failed to complete mint",
    };
  }
}

/**
 * Recover a pending bridge transaction
 * This function attempts to complete a bridge that got stuck
 * 
 * Uses Circle's API v2 which combines message retrieval and attestation
 */
export async function recoverPendingBridge(
  burnTxHash: string,
  recipientAddress: string,
  privateKey: string
): Promise<RecoveryResult> {
  console.log(`[BRIDGE_RECOVERY] ========================================`);
  console.log(`[BRIDGE_RECOVERY] Starting bridge recovery...`);
  console.log(`[BRIDGE_RECOVERY] Burn TX Hash: ${burnTxHash}`);
  console.log(`[BRIDGE_RECOVERY] Recipient: ${recipientAddress}`);
  console.log(`[BRIDGE_RECOVERY] ========================================`);

  try {
    // Step 1: Try Circle API v2 first
    const sourceDomainId = "0"; // Ethereum Sepolia Testnet
    
    console.log(`[BRIDGE_RECOVERY] Attempting Circle API v2 first...`);
    const circleResult = await getMessageAndAttestationFromCircle(burnTxHash, sourceDomainId);

    let messageHash: string | undefined = circleResult.messageHash;
    let messageBytes: string | undefined;

    // Step 1b: If API fails, extract messageHash directly from transaction
    if (circleResult.error || !messageHash) {
      console.log(`[BRIDGE_RECOVERY] Circle API v2 failed, extracting messageHash from transaction...`);
      
      const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
      const extractionResult = await extractMessageHashFromTransaction(burnTxHash, sepoliaRpcUrl);
      
      if (extractionResult.error || !extractionResult.messageHash) {
        return {
          success: false,
          error: extractionResult.error || circleResult.error || "Failed to get messageHash",
          message: "Could not extract messageHash. You can try recovering manually using Jupiter Exchange's CCTP recovery tool.",
        };
      }
      
      messageHash = extractionResult.messageHash;
      messageBytes = extractionResult.messageBytes; // Get messageBytes from extraction
      console.log(`[BRIDGE_RECOVERY] ✅ MessageHash extracted from transaction: ${messageHash}`);
    } else {
      console.log(`[BRIDGE_RECOVERY] ✅ MessageHash from Circle API: ${messageHash}`);
    }
    
    // Always extract messageBytes from transaction (needed for mint regardless of API result)
    // This is critical - we need messageBytes to call receiveMessage
    console.log(`[BRIDGE_RECOVERY] Extracting messageBytes from transaction (required for mint)...`);
    const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
    const extractionResult = await extractMessageHashFromTransaction(burnTxHash, sepoliaRpcUrl);
    if (extractionResult.messageBytes) {
      messageBytes = extractionResult.messageBytes;
      console.log(`[BRIDGE_RECOVERY] ✅ MessageBytes extracted: ${messageBytes.length} characters`);
    } else {
      console.error(`[BRIDGE_RECOVERY] ❌ Failed to extract messageBytes: ${extractionResult.error}`);
      // This is critical - without messageBytes we cannot do mint
      return {
        success: false,
        messageHash,
        error: `Failed to extract messageBytes: ${extractionResult.error}`,
        message: "Cannot proceed with recovery without messageBytes. Please check the transaction.",
      };
    }

    // messageHash is now set from either API or direct extraction

    // Step 1.5: Decode message to get amount and recipient for balance check
    let expectedAmount: bigint | undefined;
    let decodedRecipient: string | undefined;
    if (messageBytes) {
      const decoded = decodeMessageBytes(messageBytes);
      expectedAmount = decoded.amount;
      decodedRecipient = decoded.recipient;
      if (expectedAmount) {
        console.log(`[BRIDGE_RECOVERY] Decoded expected amount: ${(Number(expectedAmount) / 1_000_000).toFixed(2)} USDC`);
        console.log(`[BRIDGE_RECOVERY] Decoded recipient: ${decodedRecipient}`);
      }
    }
    
    // Step 1.6: Check if message has expired (do this early to avoid unnecessary work)
    if (messageBytes) {
      console.log(`[BRIDGE_RECOVERY] Checking if message has expired (early check)...`);
      const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
      const expirationCheck = await checkBurnExpirationAndRefund(
        burnTxHash,
        messageBytes,
        sepoliaRpcUrl
      );
      
      if (expirationCheck.expired) {
        console.log(`[BRIDGE_RECOVERY] ⚠️ Message has EXPIRED - mint cannot be completed`);
        return {
          success: false,
          messageHash,
          messageBytes,
          error: "Message has expired",
          message: expirationCheck.message || "Message has expired and cannot be minted. CCTP does not support refunds - funds were permanently burned.",
          expirationInfo: {
            expired: true,
            expirationBlock: expirationCheck.expirationBlock?.toString(),
            currentBlock: expirationCheck.currentBlock?.toString(),
            canRefund: expirationCheck.canRefund,
          },
        };
      } else {
        console.log(`[BRIDGE_RECOVERY] ✅ Message is still valid: ${expirationCheck.message}`);
      }
    }

    // Step 2: Check if attestation is ready
    if (!circleResult.attestation) {
      // Attestation not ready yet, try fetching it separately
      console.log(`[BRIDGE_RECOVERY] Attestation not in API response, fetching separately...`);
      const attestationResult = await fetchAttestation(messageHash);

      if (attestationResult.status !== 'complete' || !attestationResult.attestation) {
        // Even if attestation is not ready, try to check if mint was already done
        console.log(`[BRIDGE_RECOVERY] Attestation not ready, but checking if mint was already completed...`);
        const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
        const alreadyReceived = await checkMessageReceived(messageHash!, arcRpcUrl);
        
        if (alreadyReceived.received && alreadyReceived.txHash) {
          console.log(`[BRIDGE_RECOVERY] ✅ Message already received! Mint was already completed.`);
          return {
            success: true,
            messageHash,
            messageBytes,
            mintTxHash: alreadyReceived.txHash,
            message: "Mint was already completed previously! No attestation needed.",
          };
        }
        
        // Last resort: try mint without attestation (sometimes works if message was processed)
        if (messageBytes) {
          console.log(`[BRIDGE_RECOVERY] Attestation not ready, trying mint without attestation as last resort...`);
          const mintResult = await tryMintWithoutAttestation(messageBytes, privateKey);
          
          if (mintResult.success && mintResult.txHash) {
            console.log(`[BRIDGE_RECOVERY] ✅ Mint succeeded without attestation!`);
            return {
              success: true,
              messageHash,
              messageBytes,
              mintTxHash: mintResult.txHash,
              message: "Mint completed successfully without attestation (message was already processed by Circle).",
            };
          }
        }
        
        return {
          success: false,
          messageHash,
          messageBytes,
          error: attestationResult.error || "Attestation not ready yet",
          message: `Attestation status: ${attestationResult.status}. The system will keep trying. You can also check manually.`,
        };
      }

      console.log(`[BRIDGE_RECOVERY] ✅ Attestation received (v1 API)`);
      
      // Step 2.5: Check if message was already received (mint already done)
      // Also check balance for silent mints (when UI hangs but funds arrive)
      const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
      const checkRecipient = decodedRecipient || recipientAddress;
      
      console.log(`[BRIDGE_RECOVERY] Checking if mint was already completed (events + balance check)...`);
      console.log(`[BRIDGE_RECOVERY] Recipient: ${checkRecipient}`);
      console.log(`[BRIDGE_RECOVERY] Expected amount: ${expectedAmount ? (Number(expectedAmount) / 1_000_000).toFixed(2) + ' USDC' : 'N/A'}`);
      
      const alreadyReceived = await checkMessageReceived(
        messageHash!, 
        arcRpcUrl,
        expectedAmount,
        checkRecipient
      );
      
      if (alreadyReceived.received) {
        if (alreadyReceived.txHash) {
          console.log(`[BRIDGE_RECOVERY] ✅ Message already received! Mint was already completed.`);
          return {
            success: true,
            messageHash,
            messageBytes,
            attestation: attestationResult.attestation,
            mintTxHash: alreadyReceived.txHash,
            message: "Mint was already completed previously!",
          };
        } else if (alreadyReceived.balanceCheck?.match) {
          console.log(`[BRIDGE_RECOVERY] ✅ Silent mint detected! Balance check shows funds arrived.`);
          return {
            success: true,
            messageHash,
            messageBytes,
            attestation: attestationResult.attestation,
            message: `Silent mint detected! Funds arrived on ARC Testnet. Current balance: ${alreadyReceived.balanceCheck.currentBalance} USDC (expected: ${alreadyReceived.balanceCheck.expectedAmount} USDC). The mint completed even though the UI may have hung.`,
            balanceCheck: alreadyReceived.balanceCheck,
          };
        }
      }
      
      // Step 2.6: Check if message has expired and if refund is possible
      if (messageBytes) {
        console.log(`[BRIDGE_RECOVERY] Checking if message has expired...`);
        const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
        const expirationCheck = await checkBurnExpirationAndRefund(
          burnTxHash,
          messageBytes,
          sepoliaRpcUrl
        );
        
        if (expirationCheck.expired) {
          console.log(`[BRIDGE_RECOVERY] ⚠️ Message has EXPIRED - mint cannot be completed`);
          return {
            success: false,
            messageHash,
            messageBytes,
            error: "Message has expired",
            message: expirationCheck.message || "Message has expired and cannot be minted. CCTP does not support refunds - funds were permanently burned.",
            expirationInfo: {
              expired: true,
              expirationBlock: expirationCheck.expirationBlock?.toString(),
              currentBlock: expirationCheck.currentBlock?.toString(),
              canRefund: expirationCheck.canRefund,
            },
          };
        } else {
          console.log(`[BRIDGE_RECOVERY] ✅ Message is still valid: ${expirationCheck.message}`);
        }
      }
      
      // Step 3: Try to complete the mint automatically (if we have messageBytes and valid attestation)
      if (messageBytes && attestationResult.attestation && attestationResult.attestation !== 'PENDING') {
        console.log(`[BRIDGE_RECOVERY] Attempting to complete mint automatically...`);
        const mintResult = await completeMint(
          messageBytes,
          attestationResult.attestation,
          privateKey
        );

        if (mintResult.success && mintResult.txHash) {
          console.log(`[BRIDGE_RECOVERY] ✅ Mint completed successfully!`);
          return {
            success: true,
            messageHash,
            messageBytes,
            attestation: attestationResult.attestation,
            mintTxHash: mintResult.txHash,
            message: "Mint completed successfully!",
          };
        } else {
          console.error(`[BRIDGE_RECOVERY] ❌ Mint failed: ${mintResult.error}`);
        }
      } else {
        console.log(`[BRIDGE_RECOVERY] ⚠️ Message bytes not available, cannot complete mint automatically`);
      }

      if (mintResult.success && mintResult.txHash) {
        console.log(`[BRIDGE_RECOVERY] ✅ Mint completed successfully!`);
        return {
          success: true,
          messageHash,
          attestation: attestationResult.attestation,
          mintTxHash: mintResult.txHash,
          message: "Mint completed successfully!",
        };
      }

      // Mint completion failed or messageBytes not available, return attestation for manual recovery
      return {
        success: true,
        messageHash,
        messageBytes,
        attestation: attestationResult.attestation,
        message: messageBytes 
          ? "Attestation fetched successfully. Use Jupiter Exchange to complete the mint manually."
          : "Attestation fetched successfully. Message bytes not available - use Jupiter Exchange to complete the mint manually.",
      };
    }

    console.log(`[BRIDGE_RECOVERY] ✅ Attestation received (v2 API)`);
    
    // Step 2.5: Check if message was already received (mint already done)
    // Also check balance for silent mints (when UI hangs but funds arrive)
    const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
    const checkRecipient = decodedRecipient || recipientAddress;
    
    console.log(`[BRIDGE_RECOVERY] Checking if mint was already completed (events + balance check)...`);
    console.log(`[BRIDGE_RECOVERY] Recipient: ${checkRecipient}`);
    console.log(`[BRIDGE_RECOVERY] Expected amount: ${expectedAmount ? (Number(expectedAmount) / 1_000_000).toFixed(2) + ' USDC' : 'N/A'}`);
    
    const alreadyReceived = await checkMessageReceived(
      messageHash!, 
      arcRpcUrl,
      expectedAmount,
      checkRecipient
    );
    
    if (alreadyReceived.received) {
      if (alreadyReceived.txHash) {
        console.log(`[BRIDGE_RECOVERY] ✅ Message already received! Mint was already completed.`);
        return {
          success: true,
          messageHash,
          messageBytes,
          attestation: circleResult.attestation,
          mintTxHash: alreadyReceived.txHash,
          message: "Mint was already completed previously!",
        };
      } else if (alreadyReceived.balanceCheck?.match) {
        console.log(`[BRIDGE_RECOVERY] ✅ Silent mint detected! Balance check shows funds arrived.`);
        return {
          success: true,
          messageHash,
          messageBytes,
          attestation: circleResult.attestation,
          message: `Silent mint detected! Funds arrived on ARC Testnet. Current balance: ${alreadyReceived.balanceCheck.currentBalance} USDC (expected: ${alreadyReceived.balanceCheck.expectedAmount} USDC). The mint completed even though the UI may have hung.`,
          balanceCheck: alreadyReceived.balanceCheck,
        };
      }
    }
    
    // Step 3: Try to complete the mint automatically (if we have messageBytes and valid attestation)
    console.log(`[BRIDGE_RECOVERY] Checking conditions for mint...`);
    console.log(`[BRIDGE_RECOVERY]   messageBytes available: ${!!messageBytes}`);
    console.log(`[BRIDGE_RECOVERY]   messageBytes length: ${messageBytes?.length || 0}`);
    console.log(`[BRIDGE_RECOVERY]   attestation available: ${!!circleResult.attestation}`);
    console.log(`[BRIDGE_RECOVERY]   attestation value: ${circleResult.attestation?.substring(0, 20) || 'N/A'}...`);
    console.log(`[BRIDGE_RECOVERY]   attestation is PENDING: ${circleResult.attestation === 'PENDING' || !circleResult.attestation?.startsWith('0x')}`);
    
    if (messageBytes && circleResult.attestation && circleResult.attestation !== 'PENDING' && circleResult.attestation.startsWith('0x')) {
      console.log(`[BRIDGE_RECOVERY] ✅ All conditions met! Attempting to complete mint automatically...`);
      const mintResult = await completeMint(
        messageBytes,
        circleResult.attestation,
        privateKey
      );

      if (mintResult.success && mintResult.txHash) {
        console.log(`[BRIDGE_RECOVERY] ✅ Mint completed successfully!`);
        
        // Remove from pending bridges if it was tracked
        try {
          const { markMintCompleted, removePendingBridge } = await import("./pending-bridges");
          markMintCompleted(burnTxHash, mintResult.txHash);
          removePendingBridge(burnTxHash);
        } catch (e) {
          // Ignore if pending-bridges not available
        }
        
        return {
          success: true,
          messageHash,
          messageBytes,
          attestation: circleResult.attestation,
          mintTxHash: mintResult.txHash,
          message: "Mint completed successfully!",
        };
      } else {
        console.error(`[BRIDGE_RECOVERY] ❌ Mint failed: ${mintResult.error}`);
      }
    } else {
      console.log(`[BRIDGE_RECOVERY] ⚠️ Message bytes not available, cannot complete mint automatically`);
    }

    // Mint completion failed or messageBytes not available, return status
    // If attestation is not ready, inform user to wait
    const attestationStatus = circleResult.attestation 
      ? (circleResult.attestation === 'PENDING' || !circleResult.attestation.startsWith('0x') ? 'PENDING' : 'READY')
      : 'PENDING';
    
    return {
      success: attestationStatus === 'READY' ? true : false,
      messageHash,
      messageBytes,
      attestation: circleResult.attestation && circleResult.attestation !== 'PENDING' ? circleResult.attestation : undefined,
      message: attestationStatus === 'PENDING'
        ? "Attestation is still pending. The system will automatically retry when it's ready. You can call this endpoint again later."
        : "Message and attestation fetched successfully. Mint will be attempted automatically when attestation is ready.",
    };
  } catch (error: any) {
    console.error(`[BRIDGE_RECOVERY] ❌ Recovery failed:`, error);
    return {
      success: false,
      error: error.message || "Unknown recovery error",
    };
  }
}

/**
 * Get recovery information
 * Note: Jupiter Exchange is for Solana, not Ethereum/ARC
 * Recovery must be done via API or direct contract interaction
 */
export function getRecoveryInfo(): string {
  return "Use POST /api/bridge/recover with burnTxHash to recover funds automatically";
}


