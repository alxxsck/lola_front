export const conversationAISuspensionEnabled =
  import.meta.env.VITE_CONVERSATION_AI_SUSPENSION_ENABLED !== 'false';

export const canonicalIdentityPolicyEnabled =
  import.meta.env.VITE_CANONICAL_IDENTITY_POLICY_ENABLED !== 'false';

export function scenarioGraphWorkspaceEnabledFromEnv(value?: string) {
  return value !== 'false';
}

/**
 * Presentation-only rollback switch. Disabling it never changes the saved
 * scenario graph or the runtime contract.
 */
export const scenarioGraphWorkspaceEnabled = scenarioGraphWorkspaceEnabledFromEnv(
  import.meta.env.VITE_SCENARIO_GRAPH_WORKSPACE_ENABLED,
);
