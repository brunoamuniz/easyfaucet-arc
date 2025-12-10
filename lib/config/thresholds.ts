/**
 * Threshold Configuration for Telegram Alerts
 * 
 * These thresholds determine when alerts should be sent
 * after a successful claim.
 */

export const THRESHOLDS = {
  USDC: {
    alert: 2000, // Alert if balance < 2000 USDC
    claimAmount: 100, // Amount per claim
    minClaimsBeforeAlert: 5, // Alert if < 5 claims remaining
  },
  EURC: {
    alert: 1000, // Alert if balance < 1000 EURC (updated for production testing)
    claimAmount: 50, // Amount per claim
    minClaimsBeforeAlert: 5, // Alert if < 5 claims remaining
  },
} as const;

export type TokenType = keyof typeof THRESHOLDS;

