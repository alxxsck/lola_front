import {
  userMemoryClearFacts,
  userMemoryDeleteFact,
  userMemoryFacts,
  userMemorySettings,
  userMemoryUpdateSettings,
} from "@/shared/api/generated/lola-backend";
import { isMockMode } from "@/shared/config/data-mode";
import type {
  UpdateUserMemorySettings,
  UserMemoryFact,
  UserMemorySettings,
} from "../model/user-memory";

export interface UserMemoryRepository {
  getSettings(projectId: string): Promise<UserMemorySettings>;
  updateSettings(
    projectId: string,
    input: UpdateUserMemorySettings,
  ): Promise<UserMemorySettings>;
  listFacts(
    projectId: string,
    endUserId: string,
  ): Promise<{ items: UserMemoryFact[] }>;
  deleteFact(
    projectId: string,
    endUserId: string,
    factId: string,
  ): Promise<void>;
  clearFacts(projectId: string, endUserId: string): Promise<number>;
}

const apiRepository: UserMemoryRepository = {
  async getSettings(projectId) {
    return userMemorySettings(projectId);
  },
  async updateSettings(projectId, input) {
    return userMemoryUpdateSettings(projectId, input);
  },
  async listFacts(projectId, endUserId) {
    return userMemoryFacts(projectId, endUserId);
  },
  async deleteFact(projectId, endUserId, factId) {
    await userMemoryDeleteFact(projectId, endUserId, factId);
  },
  async clearFacts(projectId, endUserId) {
    return (await userMemoryClearFacts(projectId, endUserId)).deletedCount;
  },
};

let mockFacts: UserMemoryFact[] = [
  {
    id: "memory-demo-1",
    category: "INTEREST",
    key: "favorite_game",
    value: "Любит шахматы",
    sourceMessageId: "demo-message-1",
    sourceObservedAt: "2026-07-20T12:00:00.000Z",
    expiresAt: "2027-07-20T12:00:00.000Z",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
  },
];
let mockSettings: UserMemorySettings = {
  projectVersion: 1,
  enabled: false,
  dailyExtractionCallLimit: 1000,
  factTtlDays: 365,
  limits: {
    dailyExtractionCallLimit: { min: 1, max: 100000 },
    factTtlDays: { min: 1, max: 3650 },
  },
};

const mockRepository: UserMemoryRepository = {
  async getSettings() {
    return structuredClone(mockSettings);
  },
  async updateSettings(_projectId, input) {
    mockSettings = {
      ...mockSettings,
      ...input,
      projectVersion: mockSettings.projectVersion + 1,
    };
    return structuredClone(mockSettings);
  },
  async listFacts() {
    return { items: structuredClone(mockFacts) };
  },
  async deleteFact(_projectId, _endUserId, factId) {
    mockFacts = mockFacts.filter((fact) => fact.id !== factId);
  },
  async clearFacts() {
    const deletedCount = mockFacts.length;
    mockFacts = [];
    return deletedCount;
  },
};

export const userMemoryRepository = isMockMode ? mockRepository : apiRepository;
