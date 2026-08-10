import { dataMode } from "@/shared/config/data-mode";
import type { RepositoryMode } from "@/shared/api/repository/contracts";

export function reportingMvpEnabledFromEnv(
  value: string | undefined,
  mode: string,
  repositoryMode: RepositoryMode,
): boolean {
  if (value === "false") return false;
  if (value === "true") return true;
  return mode === "test" || repositoryMode === "mock";
}

export const reportingMvpEnabled = reportingMvpEnabledFromEnv(
  import.meta.env.VITE_REPORTING_MVP_ENABLED,
  import.meta.env.MODE,
  dataMode,
);
