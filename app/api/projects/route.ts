import { NextResponse } from "next/server";
import { getCachedProjects, getCacheStats } from "@/lib/services/projects-cache";

/**
 * GET /api/projects
 * Returns cached projects (always fast, no fetch during request)
 * Cache is updated by Vercel Cron Job every 15 minutes
 */
export async function GET() {
  try {
    // Get cached projects (this is always fast, no fetch)
    const projects = await getCachedProjects();
    const stats = getCacheStats();

    // Format cache age for better readability
    const cacheAgeMs = stats.cacheAge || 0;
    const cacheAgeMinutes = Math.floor(cacheAgeMs / 60000);
    const cacheAgeSeconds = Math.floor((cacheAgeMs % 60000) / 1000);
    const isStale = cacheAgeMs > 20 * 60 * 1000; // Consider stale if older than 20 minutes

    return NextResponse.json({
      success: true,
      data: projects,
      cached: true,
      stats: {
        projectCount: stats.projectCount,
        totalProjectsRegistered: stats.totalProjectsRegistered,
        cacheAge: stats.cacheAge,
        cacheAgeFormatted: `${cacheAgeMinutes}m ${cacheAgeSeconds}s`,
        isStale,
        lastRefresh: stats.cacheAge ? new Date(Date.now() - cacheAgeMs).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Error getting cached projects:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get projects",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

