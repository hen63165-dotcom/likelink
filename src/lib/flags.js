/**
 * Feature Flags for LikeLink Studio Cloud — Safe Rollout Infrastructure.
 *
 * These flags control whether new features are active. They are:
 *   - Hardcoded to false by default (safe rollout)
 *   - Can be overridden via environment variables (VITE_FLAG_*)
 *   - Checked at runtime without making API calls
 *
 * IMPORTANT: A disabled flag must NOT alter existing behavior.
 * The feature must be fully gated and not affect the base application.
 */

const FLAG_PREFIX = "VITE_FLAG_";

function getFlag(name, defaultValue = false) {
  const envKey = FLAG_PREFIX + name.toUpperCase();
  const envValue = import.meta.env[envKey];

  if (envValue === "true" || envValue === "1") return true;
  if (envValue === "false" || envValue === "0") return false;
  return defaultValue;
}

export const Flags = {
  studioCloudEnabled: getFlag("STUDIO_CLOUD", false),

  domainCloudEnabled: getFlag("DOMAIN_CLOUD", false),

  trustEngineEnabled: getFlag("TRUST_ENGINE", false),

  visionSearchEnabled: getFlag("VISION_SEARCH", false),

  socialConnectionsEnabled: getFlag("SOCIAL_CONNECTIONS", false),

  shoppingAssistantEnabled: getFlag("SHOPPING_ASSISTANT", false),

  contentCopilotEnabled: getFlag("CONTENT_COPILOT", false),

  videoTemplatesEnabled: getFlag("VIDEO_TEMPLATES", false),

  brandWorldsEnabled: getFlag("BRAND_WORLDS", false),

  lunaPlatformEnabled: getFlag("LUNA_PLATFORM", false),

  seoCloudEnabled: getFlag("SEO_CLOUD", false),

  analyticsCloudEnabled: getFlag("ANALYTICS_CLOUD", false),

  relationalSchemaEnabled: getFlag("RELATIONAL_SCHEMA", false),

  rlsEnforced: getFlag("RLS_ENFORCED", false),
};

export function isFeatureEnabled(flagName) {
  return Flags[flagName] === true;
}

export function getFlagStatus(flagName) {
  const flag = Flags[flagName];
  return {
    name: flagName,
    enabled: flag === true,
    disabled: flag === false,
    value: flag,
  };
}

export function getAllFlags() {
  return Object.entries(Flags).map(([name, value]) => ({
    name,
    enabled: value === true,
    disabled: value === false,
    value,
  }));
}
