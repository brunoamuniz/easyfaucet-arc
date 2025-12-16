import { Project } from "@/lib/config/projects";

const ARC_INDEX_API_URL = "https://v0-arc-index.vercel.app/api/public/projects";
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds

interface ArcIndexProject {
  id: string;
  name: string;
  description: string;
  category: string;
  website_url: string | null;
  x_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  project_url?: string;
}

interface ArcIndexResponse {
  success: boolean;
  data: ArcIndexProject[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
}

// In-memory cache
let cachedProjects: Project[] | null = null;
let totalProjectsRegistered: number | null = null; // Total projects registered in Arc Index
let cacheTimestamp: number = 0;
let isRefreshing: boolean = false;
let refreshIntervalId: NodeJS.Timeout | null = null;

/**
 * Maps Arc Index API project to our Project interface
 */
function mapArcIndexProject(project: ArcIndexProject): Project {
  // Map category from Arc Index API to our ProjectCategory type
  const categoryMap: Record<string, string> = {
    Tools: "Tools",
    DeFi: "DeFi",
    Explorer: "Explorer",
    NFT: "NFT",
    Bridge: "Bridge",
    Gaming: "Gaming",
    Infrastructure: "Tools", // Infrastructure projects are tools
    Social: "Tools", // Social platforms are tools
    Other: "Other",
  };

  // Get category from map, defaulting to "Other" if not found
  const category = categoryMap[project.category] || "Other";

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    category: category as "Tools" | "DeFi" | "Explorer" | "NFT" | "Bridge" | "Gaming" | "Other",
    imageUrl: project.image_thumb_url || project.image_url || "",
    projectUrl: project.website_url || project.project_url || "",
    twitter: project.x_url || undefined,
    discord: undefined, // Not available in API yet
    github: project.github_url || undefined,
    contract: undefined, // Not available in API yet
  };
}

/**
 * Fetches projects from Arc Index API
 */
async function fetchProjectsFromAPI(): Promise<{ projects: Project[]; total: number }> {
  try {
    const response = await fetch(ARC_INDEX_API_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data: ArcIndexResponse = await response.json();

    if (!data.success || !Array.isArray(data.data)) {
      throw new Error("Invalid response format from Arc Index API");
    }

    const projects = data.data.map(mapArcIndexProject);
    const total = data.pagination?.total || data.data.length;

    return { projects, total };
  } catch (error) {
    console.error("Error fetching projects from Arc Index API:", error);
    throw error;
  }
}

/**
 * Refreshes the cache by fetching fresh data from the API
 */
export async function refreshProjectsCache(): Promise<Project[]> {
  // Prevent concurrent refreshes
  if (isRefreshing) {
    console.log("Projects cache refresh already in progress, skipping...");
    return cachedProjects || [];
  }

  try {
    isRefreshing = true;
    console.log("Refreshing projects cache...");

    const { projects, total } = await fetchProjectsFromAPI();

    // Update cache
    cachedProjects = projects;
    totalProjectsRegistered = total;
    cacheTimestamp = Date.now();

    console.log(`Projects cache refreshed successfully. ${projects.length} projects loaded (${total} total registered).`);
    return projects;
  } catch (error) {
    console.error("Error refreshing projects cache:", error);
    // Return existing cache if available, even if stale
    if (cachedProjects) {
      console.warn("Using stale cache due to refresh error");
      return cachedProjects;
    }
    throw error;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Gets cached projects, initializing cache if needed
 */
export async function getCachedProjects(): Promise<Project[]> {
  // If cache is empty, fetch immediately
  if (!cachedProjects) {
    console.log("Projects cache is empty, fetching initial data...");
    return await refreshProjectsCache();
  }

  // Return cached data (always fast, no fetch)
  return cachedProjects;
}

/**
 * Initializes the background refresh process
 * This should be called once when the application starts
 */
export function initializeProjectsCacheRefresh(): void {
  // Don't initialize if already running
  if (refreshIntervalId) {
    return;
  }

  // Initial fetch if cache is empty
  if (!cachedProjects) {
    refreshProjectsCache().catch((error) => {
      console.error("Failed to initialize projects cache:", error);
    });
  }

  // Set up periodic refresh every 15 minutes
  refreshIntervalId = setInterval(() => {
    refreshProjectsCache().catch((error) => {
      console.error("Background refresh failed:", error);
    });
  }, REFRESH_INTERVAL);

  console.log("Projects cache refresh process initialized (every 15 minutes)");
}

/**
 * Stops the background refresh process (useful for testing or cleanup)
 */
export function stopProjectsCacheRefresh(): void {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
    console.log("Projects cache refresh process stopped");
  }
}

/**
 * Gets cache statistics
 */
export function getCacheStats() {
  return {
    hasCache: cachedProjects !== null,
    projectCount: cachedProjects?.length || 0,
    totalProjectsRegistered: totalProjectsRegistered,
    cacheAge: cachedProjects ? Date.now() - cacheTimestamp : null,
    isRefreshing,
  };
}

