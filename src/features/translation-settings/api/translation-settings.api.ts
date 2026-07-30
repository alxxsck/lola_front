import {
  aiModelSettingsCatalog,
  aiModelSettingsSettings,
  aiModelSettingsUpdateSettings,
  projectTranslationSettingsGet,
  projectTranslationSettingsPut,
} from "@/shared/api/generated/lola-backend";
import type {
  UpdateAiModelSettingsDto,
  UpdateProjectTranslationSettingsDto,
} from "@/shared/api/generated/models";

export const translationSettingsApi = {
  aiModels: {
    settings: aiModelSettingsSettings,
    catalog: aiModelSettingsCatalog,
    update(projectId: string, value: UpdateAiModelSettingsDto) {
      return aiModelSettingsUpdateSettings(projectId, value);
    },
  },
  project: {
    get: projectTranslationSettingsGet,
    update(projectId: string, value: UpdateProjectTranslationSettingsDto) {
      return projectTranslationSettingsPut(projectId, value);
    },
  },
};
