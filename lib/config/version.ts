/**
 * Application Version Configuration
 * 
 * This file is generated/updated during build time.
 * The BUILD_TIMESTAMP is set at build time to distinguish between production and local builds.
 */

// Version from package.json (update this when releasing)
export const APP_VERSION = "0.1.0";

// Build timestamp - set at build time (ISO 8601 format)
// In production, this will be set during the build process
// In development, this will be the current time when the module is loaded
export const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString();

// Build date (formatted for display)
export const BUILD_DATE = new Date(BUILD_TIMESTAMP).toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short'
});

// Full version string for display
export const VERSION_STRING = `v${APP_VERSION}`;
export const BUILD_INFO = `${BUILD_DATE}`;
export const FULL_VERSION = `${VERSION_STRING} | Build: ${BUILD_INFO}`;

