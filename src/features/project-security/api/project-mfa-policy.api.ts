import {
  projectMfaPolicyGet,
  projectMfaPolicyUpdate,
} from '@/shared/api/generated/lola-backend'
import type { UpdateProjectMfaPolicyDto } from '@/shared/api/generated/models'

export const projectMfaPolicyApi = {
  get(projectId: string) {
    return projectMfaPolicyGet(projectId)
  },

  update(projectId: string, input: UpdateProjectMfaPolicyDto) {
    return projectMfaPolicyUpdate(projectId, input)
  },
}
