import { isMockMode } from "@/shared/config/data-mode";
import { apiIntegrationActivityRepository } from "./integration-activity.api";
import { mockIntegrationActivityRepository } from "./mock-integration-activity.api";

export const integrationActivityRepository = isMockMode
  ? mockIntegrationActivityRepository
  : apiIntegrationActivityRepository;

export type { IntegrationActivityRepository } from "../model/integration-activity";
