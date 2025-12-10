/**
 * Alert Cooldown Service
 * 
 * Prevents sending multiple alerts in a short period.
 * Uses in-memory cache (for serverless, consider Vercel KV or database).
 */

// In-memory cache for last alert timestamps
// In production with multiple instances, use Vercel KV or database
const lastAlertSent: Record<'USDC' | 'EURC', number> = {
  USDC: 0,
  EURC: 0,
};

// Cooldown period: 30 minutes
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Check if alert can be sent (not in cooldown)
 */
export function canSendAlert(token: 'USDC' | 'EURC'): boolean {
  const lastSent = lastAlertSent[token];
  const now = Date.now();
  
  return (now - lastSent) > ALERT_COOLDOWN_MS;
}

/**
 * Mark alert as sent (update timestamp)
 */
export function markAlertSent(token: 'USDC' | 'EURC'): void {
  lastAlertSent[token] = Date.now();
}

/**
 * Get time until next alert can be sent (in seconds)
 */
export function getTimeUntilNextAlert(token: 'USDC' | 'EURC'): number {
  const lastSent = lastAlertSent[token];
  const now = Date.now();
  const elapsed = now - lastSent;
  
  if (elapsed >= ALERT_COOLDOWN_MS) {
    return 0;
  }
  
  return Math.ceil((ALERT_COOLDOWN_MS - elapsed) / 1000);
}

