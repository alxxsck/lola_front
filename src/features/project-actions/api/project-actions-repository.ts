import {
  productActionsActionTypes,
  productActionsArchiveProjectAction,
  productActionsConfigureAiExposure,
  productActionsConfigureProjectAction,
  productActionsPreviewProjectAction,
  productActionsProjectActions,
} from '@/shared/api/generated/lola-backend'
import type {
  ActionTypeCatalogItem,
  AiCapabilityPreview,
  ConfigureProjectActionInput,
  ProjectAction,
} from '../model/project-action'
import { isMockMode } from '@/shared/config/data-mode'
import { mockProjectActionsRepository } from './mock-project-actions-repository'

export interface ProjectActionsRepository {
  listActionTypes(projectId: string): Promise<ActionTypeCatalogItem[]>
  listProjectActions(projectId: string): Promise<ProjectAction[]>
  configure(projectId: string, actionId: string, input: ConfigureProjectActionInput): Promise<ProjectAction>
  archive(projectId: string, actionId: string): Promise<ProjectAction>
  preview(projectId: string, actionId: string): Promise<AiCapabilityPreview>
}

const apiProjectActionsRepository: ProjectActionsRepository = {
  listActionTypes: productActionsActionTypes,
  listProjectActions: productActionsProjectActions,
  async configure(projectId, actionId, input) {
    const changesAiExposure =
      input.aiEnabled !== undefined || input.aiUsageDescription !== undefined
    if (!changesAiExposure) {
      return productActionsConfigureProjectAction(projectId, actionId, input)
    }

    const { scenarioEnabled, ...aiExposureInput } = input
    const aiExposure = await productActionsConfigureAiExposure(
      projectId,
      actionId,
      aiExposureInput,
    )
    if (scenarioEnabled === undefined) return aiExposure

    return productActionsConfigureProjectAction(projectId, actionId, {
      scenarioEnabled,
    })
  },
  archive: productActionsArchiveProjectAction,
  async preview(projectId, actionId) {
    const preview = await productActionsPreviewProjectAction(projectId, actionId)
    return { ...preview, tool: preview.tool ?? null }
  },
}

export const projectActionsRepository: ProjectActionsRepository = isMockMode
  ? mockProjectActionsRepository
  : apiProjectActionsRepository
