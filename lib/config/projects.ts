/**
 * ARC Ecosystem Projects Configuration
 * 
 * Projects are now fetched from the Arc Index API (https://v0-arc-index.vercel.app/api/public/projects)
 * The API route at /api/projects handles caching and data transformation.
 */

export type ProjectCategory = "Tools" | "DeFi" | "Explorer" | "NFT" | "Bridge" | "Gaming" | "Other";

export interface Project {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  imageUrl: string;
  projectUrl: string;
  creator?: string; // Optional: creator or team name
  twitter?: string; // Optional: Twitter handle or URL
  discord?: string; // Optional: Discord username
  github?: string; // Optional: GitHub repository URL
  contract?: string; // Optional: Smart contract address
}

/**
 * Legacy: Manually curated list (kept for fallback/backward compatibility)
 * Projects are now fetched from the Arc Index API via /api/projects
 */
export const ARC_PROJECTS: Project[] = [];

