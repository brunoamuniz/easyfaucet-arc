/**
 * Telegram Bot Service
 * 
 * Service for sending messages via Telegram Bot API.
 * Uses fire-and-forget approach to not block the main flow.
 */

import { TELEGRAM_CONFIG } from '@/lib/config/telegram-bot';

const TELEGRAM_API_URL = 'https://api.telegram.org/bot';

export interface TelegramMessage {
  text: string;
  parseMode?: 'Markdown' | 'HTML';
}

/**
 * Send a message to Telegram
 * 
 * @param message - Message to send
 * @param context - Optional context for logging (e.g., "REFILL", "BRIDGE_AUTO")
 * @returns Promise that resolves when message is sent (or fails silently)
 */
export async function sendTelegramMessage(
  message: TelegramMessage,
  context?: string
): Promise<void> {
  const logPrefix = context ? `[${context}]` : '[TELEGRAM]';
  const startTime = Date.now();

  // Check if Telegram is configured
  if (!TELEGRAM_CONFIG.enabled) {
    console.warn(`${logPrefix} Telegram not configured - skipping message`);
    return;
  }

  try {
    const url = `${TELEGRAM_API_URL}${TELEGRAM_CONFIG.botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CONFIG.chatId,
        text: message.text,
        parse_mode: message.parseMode || 'Markdown',
        disable_web_page_preview: false,
      }),
      // Timeout to prevent hanging
      signal: AbortSignal.timeout(5000), // 5 seconds timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Failed to send Telegram message: ${response.status} ${response.statusText} - ${errorText}`);
      return;
    }

    const data = await response.json();
    if (!data.ok) {
      console.error(`${logPrefix} Telegram API error: ${data.error_code || 'N/A'} - ${data.description || 'N/A'}`);
      return;
    }

    const duration = Date.now() - startTime;
    console.log(`${logPrefix} Telegram message sent successfully (${duration}ms, message_id: ${data.result?.message_id || 'N/A'})`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    // Don't throw - this is a background task
    const errorType = error?.name === 'AbortError' || error?.message?.includes('timeout') 
      ? 'timeout' 
      : error?.constructor?.name || 'Unknown';
    console.error(`${logPrefix} Error sending Telegram message (${duration}ms, ${errorType}): ${error?.message || error}`);
  }
}

/**
 * Format alert message for Telegram
 */
export function formatAlertMessage(
  token: 'USDC' | 'EURC',
  balance: number,
  threshold: number,
  remainingClaims: number,
  contractAddress: string
): string {
  const emoji = remainingClaims < 5 ? '🚨' : '⚠️';
  const severity = remainingClaims < 5 ? 'CRÍTICO' : 'Alerta';
  const refillAmount = token === 'USDC' ? '1,000' : '1,000';
  
  return `${emoji} *${severity} - Faucet ${token}*

📉 Saldo atual: ${balance.toFixed(2)} ${token}
⚠️ Threshold: ${threshold} ${token}
📊 Claims restantes: ~${remainingClaims}

🔗 [Ver contrato](https://testnet.arcscan.app/address/${contractAddress})

💡 Ação recomendada: Fazer refill de ${refillAmount} ${token}`;
}

/**
 * Format refill start notification
 */
export function formatRefillStartMessage(
  token: 'USDC' | 'EURC',
  amount: string,
  currentBalance: string,
  threshold: string,
  walletBalance: string
): string {
  return `🔄 *Iniciando Recarga - ${token}*

📊 *Detalhes:*
• Token: ${token}
• Quantidade: ${amount} ${token}
• Saldo atual: ${currentBalance} ${token}
• Threshold: ${threshold} ${token}
• Saldo wallet: ${walletBalance} ${token}

⏳ Processando transação...`;
}

/**
 * Format refill completion notification
 */
export function formatRefillCompleteMessage(
  token: 'USDC' | 'EURC',
  amount: string,
  newBalance: string,
  txHash: string,
  success: boolean,
  error?: string
): string {
  if (!success) {
    return `❌ *Recarga Falhou - ${token}*

📊 *Detalhes:*
• Token: ${token}
• Quantidade tentada: ${amount} ${token}
• Erro: ${error || 'Erro desconhecido'}

⚠️ Verifique os logs para mais detalhes.`;
  }

  return `✅ *Recarga Concluída - ${token}*

📊 *Detalhes:*
• Token: ${token}
• Quantidade: ${amount} ${token}
• Novo saldo: ${newBalance} ${token}
• TX Hash: \`${txHash}\`

🔗 [Ver transação](https://testnet.arcscan.app/tx/${txHash})`;
}

/**
 * Format bridge start notification
 */
export function formatBridgeStartMessage(
  amount: string,
  fromChain: string,
  toChain: string,
  sepoliaBalance: string,
  arcBalance: string,
  recipient: string
): string {
  return `🌉 *Iniciando Bridge*

📊 *Detalhes:*
• Quantidade: ${amount} USDC
• Origem: ${fromChain}
• Destino: ${toChain}
• Saldo Sepolia: ${sepoliaBalance} USDC
• Saldo ARC: ${arcBalance} USDC
• Destinatário: \`${recipient}\`

⏳ Bridge pode levar 5-15 minutos para completar...`;
}

/**
 * Format bridge completion notification
 */
export function formatBridgeCompleteMessage(
  amount: string,
  fromChain: string,
  toChain: string,
  txHash: string,
  success: boolean,
  error?: string,
  newArcBalance?: string
): string {
  if (!success) {
    return `❌ *Bridge Falhou*

📊 *Detalhes:*
• Quantidade: ${amount} USDC
• Origem: ${fromChain}
• Destino: ${toChain}
• Erro: ${error || 'Erro desconhecido'}

⚠️ Verifique os logs para mais detalhes.`;
  }

  const balanceInfo = newArcBalance 
    ? `\n• Novo saldo ARC: ${newArcBalance} USDC`
    : '';

  return `✅ *Bridge Concluído*

📊 *Detalhes:*
• Quantidade: ${amount} USDC
• Origem: ${fromChain}
• Destino: ${toChain}
• TX Hash: \`${txHash}\`${balanceInfo}

🔗 [Ver transação Sepolia](https://sepolia.etherscan.io/tx/${txHash})`;
}

