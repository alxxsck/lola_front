import {
  productActionsActionTypes,
  productActionsArchiveProjectAction,
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
  configure: productActionsConfigureProjectAction,
  archive: productActionsArchiveProjectAction,
  async preview(projectId, actionId) {
    const preview = await productActionsPreviewProjectAction(projectId, actionId)
    return { ...preview, tool: preview.tool ?? null }
  },
}

export const projectActionsRepository: ProjectActionsRepository = isMockMode
  ? mockProjectActionsRepository
  : apiProjectActionsRepository
