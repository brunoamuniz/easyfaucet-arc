import { NextResponse } from "next/server";
import { refreshProjectsCache, getCacheStats } from "@/lib/services/projects-cache";

/**
 * POST /api/projects/refresh
 * Manually triggers a cache refresh
 * Can be called by external cron jobs or for testing
 */
export async function POST(request: Request) {
  try {
    // Optional: Add authentication check here if needed
    // const authHeader = request.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.REFRESH_SECRET}`) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const projects = await refreshProjectsCache();
    const stats = getCacheStats();

    return NextResponse.json({
      success: true,
      message: "Cache refreshed successfully",
      data: projects,
      stats: {
        projectCount: stats.projectCount,
        cacheAge: stats.cacheAge,
      },
    });
  } catch (error) {
    console.error("Error refreshing projects cache:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh cache",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/refresh
 * Returns cache statistics
 */
export async function GET() {
  const stats = getCacheStats();
  return NextResponse.json({
    success: true,
    stats,
  });
}

