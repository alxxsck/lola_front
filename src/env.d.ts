/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DATA_MODE?: 'api' | 'mock';
  readonly VITE_SCENARIO_GRAPH_WORKSPACE_ENABLED?: 'true' | 'false';
  readonly VITE_REPORTING_MVP_ENABLED?: 'true' | 'false';
}
