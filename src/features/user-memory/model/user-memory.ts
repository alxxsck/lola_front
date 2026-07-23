export type UserMemoryCategory =
  | "PREFERENCE"
  | "LOCATION"
  | "COMMUNICATION_PREFERENCE"
  | "INTEREST"
  | "PERSONAL_CONTEXT";

export interface UserMemorySettings {
  projectVersion: number;
  enabled: boolean;
  dailyExtractionCallLimit: number;
  factTtlDays: number;
  limits: {
    dailyExtractionCallLimit: { min: number; max: number };
    factTtlDays: { min: number; max: number };
  };
}

export interface UpdateUserMemorySettings {
  expectedVersion: number;
  enabled: boolean;
  dailyExtractionCallLimit: number;
  factTtlDays: number;
}

export interface UserMemoryFact {
  id: string;
  category: UserMemoryCategory;
  key: string;
  value: string;
  sourceMessageId: string;
  sourceObservedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
