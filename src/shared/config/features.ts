import { isMockMode } from "./data-mode";

export const conversationAISuspensionEnabled =
  import.meta.env.VITE_CONVERSATION_AI_SUSPENSION_ENABLED !== "false";

export const canonicalIdentityPolicyEnabled =
  import.meta.env.VITE_CANONICAL_IDENTITY_POLICY_ENABLED !== "false";

/**
 * Temporary release switch until the backend publishes a typed,
 * permission-independent project rollout contract.
 */
export const supportWorkspaceShellEnabled =
  isMockMode ||
  import.meta.env.MODE === "test" ||
  import.meta.env.VITE_SUPPORT_WORKSPACE_ENABLED === "true";
