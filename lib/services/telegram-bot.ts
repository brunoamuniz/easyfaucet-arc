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
 * @returns Promise that resolves when message is sent (or fails silently)
 */
export async function sendTelegramMessage(
  message: TelegramMessage
): Promise<void> {
  // Check if Telegram is configured
  if (!TELEGRAM_CONFIG.enabled) {
    console.warn('Telegram not configured - skipping message');
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
      console.error('Failed to send Telegram message:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return;
    }

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram API returned error:', data);
      return;
    }

    console.log('Telegram message sent successfully');
  } catch (error) {
    // Don't throw - this is a background task
    console.error('Error sending Telegram message:', error);
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

