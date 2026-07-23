import {
  notificationDestinationCreate,
  notificationDestinationList,
  notificationDestinationTest,
  notificationDestinationUpdate,
} from '@/shared/api/generated/lola-backend'
import type {
  CreateSlackNotificationDestinationDto,
  UpdateSlackNotificationDestinationDto,
} from '@/shared/api/generated/models'

const idempotencyOptions = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})

export const notificationDestinationsApi = {
  list(projectId: string) {
    return notificationDestinationList(projectId)
  },

  createSlack(
    projectId: string,
    input: CreateSlackNotificationDestinationDto,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return notificationDestinationCreate(projectId, input, idempotencyOptions(idempotencyKey))
  },

  updateSlack(projectId: string, destinationId: string, input: UpdateSlackNotificationDestinationDto) {
    return notificationDestinationUpdate(projectId, destinationId, input)
  },

  testSlack(
    projectId: string,
    destinationId: string,
    expectedVersion: number,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return notificationDestinationTest(
      projectId,
      destinationId,
      { expectedVersion },
      idempotencyOptions(idempotencyKey),
    )
  },
}
