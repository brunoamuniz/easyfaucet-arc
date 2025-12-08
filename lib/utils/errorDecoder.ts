import { decodeErrorResult } from "viem";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";

export type FaucetErrorType =
  | "CooldownActive"
  | "FaucetEmpty"
  | "InsufficientFaucetBalance"
  | "Paused"
  | "Unknown";

export interface DecodedError {
  type: FaucetErrorType;
  message: string;
  remainingSeconds?: number;
  currentBalance?: bigint;
  requiredAmount?: bigint;
}

/**
 * Decode contract custom errors
 */
export function decodeFaucetError(error: unknown): DecodedError {
  try {
    // Check if error has data property (from viem/wagmi)
    const errorData =
      typeof error === "object" &&
      error !== null &&
      "data" in error &&
      error.data
        ? error.data
        : typeof error === "object" &&
          error !== null &&
          "cause" in error &&
          typeof error.cause === "object" &&
          error.cause !== null &&
          "data" in error.cause
        ? error.cause.data
        : null;

    if (!errorData) {
      // Try to extract error message from string
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for common error patterns
      if (errorMessage.includes("CooldownActive") || errorMessage.includes("cooldown")) {
        return {
          type: "CooldownActive",
          message: "You can only request faucet once every 24 hours from this device.",
        };
      }

      if (errorMessage.includes("FaucetEmpty") || errorMessage.includes("out of funds")) {
        return {
          type: "FaucetEmpty",
          message: "The faucet is currently out of funds. Please try again later.",
        };
      }

      if (errorMessage.includes("Paused")) {
        return {
          type: "Paused",
          message: "The faucet is temporarily paused for maintenance. Please try again later.",
        };
      }

      return {
        type: "Unknown",
        message: "An unexpected error occurred while processing your request. Please try again in a few minutes.",
      };
    }

    // Try to decode the error
    try {
      const decoded = decodeErrorResult({
        abi: ARCTESTNET_FAUCET_ABI,
        data: errorData as `0x${string}`,
      });

      switch (decoded.errorName) {
        case "CooldownActive": {
          const remainingSeconds = decoded.args[0] as bigint;
          return {
            type: "CooldownActive",
            message: "You can only request faucet once every 24 hours from this device.",
            remainingSeconds: Number(remainingSeconds),
          };
        }

        case "FaucetEmpty":
          return {
            type: "FaucetEmpty",
            message: "The faucet is currently out of funds. Please try again later.",
          };

        case "InsufficientFaucetBalance": {
          const currentBalance = decoded.args[0] as bigint;
          const requiredAmount = decoded.args[1] as bigint;
          return {
            type: "InsufficientFaucetBalance",
            message: "The faucet is currently out of funds. Please try again later.",
            currentBalance,
            requiredAmount,
          };
        }

        case "Paused":
          return {
            type: "Paused",
            message: "The faucet is temporarily paused for maintenance. Please try again later.",
          };

        default:
          return {
            type: "Unknown",
            message: "An unexpected error occurred while processing your request. Please try again in a few minutes.",
          };
      }
    } catch (decodeError) {
      // If decoding fails, return unknown error
      return {
        type: "Unknown",
        message: "An unexpected error occurred while processing your request. Please try again in a few minutes.",
      };
    }
  } catch {
    return {
      type: "Unknown",
      message: "An unexpected error occurred while processing your request. Please try again in a few minutes.",
    };
  }
}

/**
 * Format remaining seconds to human-readable time
 */
export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

