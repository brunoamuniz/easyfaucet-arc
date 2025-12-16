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

    return NextResponse.json({
      success: true,
      data: projects,
      cached: true,
      stats: {
        projectCount: stats.projectCount,
        cacheAge: stats.cacheAge,
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

