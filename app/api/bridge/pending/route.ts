import { NextRequest, NextResponse } from "next/server";
import { getPendingBridges } from "@/lib/services/pending-bridges";

/**
 * GET /api/bridge/pending
 * List all pending bridges that are waiting for attestation or mint completion
 */
export async function GET(request: NextRequest) {
  try {
    const pendingBridges = getPendingBridges();
    
    return NextResponse.json({
      success: true,
      count: pendingBridges.length,
      bridges: pendingBridges.map(bridge => ({
        burnTxHash: bridge.burnTxHash,
        recipient: bridge.recipient,
        amount: bridge.amount,
        status: bridge.status,
        messageHash: bridge.messageHash,
        mintTxHash: bridge.mintTxHash,
        createdAt: new Date(bridge.createdAt).toISOString(),
        lastChecked: new Date(bridge.lastChecked).toISOString(),
        ageMinutes: Math.floor((Date.now() - bridge.createdAt) / 1000 / 60),
      })),
      note: "These bridges are automatically checked every 10 minutes. Mint will be executed automatically when attestation is ready.",
    });
  } catch (error: any) {
    console.error(`[BRIDGE_PENDING] Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
