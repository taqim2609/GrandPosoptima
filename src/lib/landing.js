import {
  fetchLandingConfig,
  updateLandingConfig,
  resetLandingConfigService,
  getCachedLandingConfig,
  mergeLandingDefaults
} from "@/services/landingService";

/**
 * Compatibility wrapper for getLandingConfig
 */
export async function getLandingConfig() {
  return await fetchLandingConfig();
}

/**
 * Compatibility wrapper for saveLandingConfig
 */
export async function saveLandingConfig(updatedConfig) {
  const res = await updateLandingConfig(updatedConfig);
  return res.config;
}

/**
 * Compatibility wrapper for resetLandingConfig
 */
export async function resetLandingConfig() {
  return await resetLandingConfigService();
}

export {
  fetchLandingConfig,
  updateLandingConfig,
  resetLandingConfigService,
  getCachedLandingConfig,
  mergeLandingDefaults
};
