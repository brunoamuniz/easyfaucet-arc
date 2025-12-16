/**
 * Initializes the projects cache refresh process
 * This module should be imported early in the application lifecycle
 */

import { initializeProjectsCacheRefresh } from "./projects-cache";

// Initialize on module load (runs when server starts)
// In serverless environments, this may run on each cold start
if (typeof window === "undefined") {
  // Only run on server side
  initializeProjectsCacheRefresh();
}

