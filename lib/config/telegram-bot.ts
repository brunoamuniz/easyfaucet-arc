/**
 * Telegram Bot Configuration
 * 
 * Configuration for Telegram Bot API integration.
 * 
 * To set up:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Get the bot token
 * 3. Get your Chat ID (talk to @userinfobot)
 * 4. Add to environment variables:
 *    - TELEGRAM_BOT_TOKEN
 *    - TELEGRAM_CHAT_ID
 */

export const TELEGRAM_CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
} as const;

