import {
  supportQualityCalibrationRead,
  supportQualityCalibrationBootstrap,
  supportQualityCalibrationCandidateList,
  supportQualityCalibrationBaselineSet,
  supportQualityCalibrationParticipantAdd,
  supportQualityCalibrations,
  supportQualityCloseCalibration,
  supportQualityCreateCalibrationReview,
  supportQualityCreateReview,
  supportQualityDisputeList,
  supportQualityCreateScorecardRevision,
  supportQualityOpenDispute,
  supportQualityOperatorReviews,
  supportQualityReplaceDraft,
  supportQualityReviewAcknowledge,
  supportQualityReviewBootstrap,
  supportQualityReviewDetail,
  supportQualityReviewEvidenceExcerpt,
  supportQualityReviewList,
  supportQualityReviewOperatorReply,
  supportQualityResolveDispute,
  supportQualityScorecards,
  supportQualitySubmitReview,
  supportQualityTaskClaim,
  supportQualityTaskRelease,
  supportQualityTaskCancel,
  supportQualityVoidReview,
  supportQualityCreateCalibration,
  supportQualitySamplingPolicyCreate,
  supportQualitySamplingRunCreate,
  supportQualityTaskList,
  supportQualityWithdrawDispute,
} from '@/shared/api/generated/retenive-backend';
import type {
  CreateSupportQualityReviewDto,
  CreateSupportQualityCalibrationDto,
  CreateSupportQualityCalibrationReviewDto,
  CreateSupportQualitySamplingPolicyDto,
  RunSupportQualitySamplingDto,
  ReplaceSupportQualityReviewDraftDto,
  SupportQualityCalibrationDetailResponseDto,
  SupportQualityCalibrationBootstrapResponseDto,
  SupportQualityCalibrationCandidatePageDto,
  SupportQualityCalibrationPageResponseDto,
  SupportQualityCalibrationResponseDto,
  SupportQualityDisputeResponseDto,
  SupportQualityDisputeRegistryPageResponseDto,
  SupportQualityReviewDetailResponseDto,
  SupportQualityReviewPageResponseDto,
  SupportQualityReviewResponseDto,
  SupportQualityScorecardResponseDto,
  SupportQualityTaskPageResponseDto,
  SupportQualityTaskResponseDto,
  SupportQualitySamplingPolicyResponseDto,
  SupportQualitySamplingRunResponseDto,
  SupportQualityDisputeListParams,
  SupportQualityEvidenceExcerptResponseDto,
  SupportQualityReviewBootstrapResponseDto,
} from '@/shared/api/generated/models';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import { isMockMode } from '@/shared/config/data-mode';

export type QualityReviewDraft = ReplaceSupportQualityReviewDraftDto;

export interface SupportQualitySource {
  listTasks(
    projectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityTaskPageResponseDto>;
  claimTask(
    projectId: string,
    task: SupportQualityTaskResponseDto,
  ): Promise<SupportQualityTaskResponseDto>;
  releaseTask(
    projectId: string,
    task: SupportQualityTaskResponseDto,
  ): Promise<SupportQualityTaskResponseDto>;
  cancelTask(
    projectId: string,
    task: SupportQualityTaskResponseDto,
  ): Promise<SupportQualityTaskResponseDto>;
  listReviews(
    projectId: string,
    ownOperatorId?: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityReviewPageResponseDto>;
  readReview(
    projectId: string,
    reviewId: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityReviewDetailResponseDto>;
  readReviewBootstrap(
    projectId: string,
    reviewId: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityReviewBootstrapResponseDto>;
  readEvidenceExcerpt(
    projectId: string,
    reviewId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityEvidenceExcerptResponseDto>;
  createReview(
    projectId: string,
    input: CreateSupportQualityReviewDto,
  ): Promise<SupportQualityReviewResponseDto>;
  saveDraft(
    projectId: string,
    reviewId: string,
    version: number,
    draft: QualityReviewDraft,
  ): Promise<SupportQualityReviewResponseDto>;
  submit(
    projectId: string,
    reviewId: string,
    version: number,
  ): Promise<SupportQualityReviewResponseDto>;
  voidReview(
    projectId: string,
    reviewId: string,
    version: number,
    reason: string,
  ): Promise<SupportQualityReviewResponseDto>;
  acknowledge(
    projectId: string,
    reviewId: string,
    version: number,
  ): Promise<SupportQualityReviewResponseDto>;
  reply(
    projectId: string,
    reviewId: string,
    version: number,
    reply: string,
  ): Promise<SupportQualityReviewResponseDto>;
  dispute(
    projectId: string,
    reviewId: string,
    version: number,
    reason: string,
  ): Promise<SupportQualityDisputeResponseDto>;
  listDisputes(
    projectId: string,
    query?: Omit<SupportQualityDisputeListParams, 'limit'>,
    signal?: AbortSignal,
  ): Promise<SupportQualityDisputeRegistryPageResponseDto>;
  listScorecards(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityScorecardResponseDto[]>;
  listCalibrations(
    projectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityCalibrationPageResponseDto>;
  listCalibrationCandidates(
    projectId: string,
    search?: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityCalibrationCandidatePageDto>;
  readCalibrationBootstrap(
    projectId: string,
    calibrationId: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityCalibrationBootstrapResponseDto>;
  createCalibration(
    projectId: string,
    input: CreateSupportQualityCalibrationDto,
  ): Promise<SupportQualityCalibrationResponseDto>;
  createCalibrationReview(
    projectId: string,
    calibrationId: string,
    input: CreateSupportQualityCalibrationReviewDto,
  ): Promise<SupportQualityReviewResponseDto>;
  createSamplingPolicy(
    projectId: string,
    input: CreateSupportQualitySamplingPolicyDto,
  ): Promise<SupportQualitySamplingPolicyResponseDto>;
  runSampling(
    projectId: string,
    input: RunSupportQualitySamplingDto,
  ): Promise<SupportQualitySamplingRunResponseDto>;
  readCalibration(
    projectId: string,
    calibrationId: string,
    signal?: AbortSignal,
  ): Promise<SupportQualityCalibrationDetailResponseDto>;
  addCalibrationParticipant(
    projectId: string,
    calibrationId: string,
    version: number,
    cmsUserId: string,
  ): Promise<void>;
  setCalibrationBaseline(
    projectId: string,
    calibrationId: string,
    version: number,
    reviewId: string,
  ): Promise<void>;
  closeCalibration(
    projectId: string,
    calibrationId: string,
    version: number,
    consensusScore: number,
  ): Promise<void>;
  createScorecardRevision(
    projectId: string,
    scorecard: SupportQualityScorecardResponseDto,
  ): Promise<SupportQualityScorecardResponseDto>;
  resolveDispute(
    projectId: string,
    dispute: SupportQualityDisputeResponseDto,
    note: string,
  ): Promise<SupportQualityDisputeResponseDto>;
  withdrawDispute(
    projectId: string,
    dispute: SupportQualityDisputeResponseDto,
  ): Promise<SupportQualityDisputeResponseDto>;
}

const pendingAttempts = new Map<string, string>();

function attemptSignature(operation: string, intent: unknown): string {
  return `${operation}:${JSON.stringify(intent)}`;
}

function requestOptions(
  operation: string,
  intent: unknown,
  version?: number,
  signal?: AbortSignal,
) {
  const signature = attemptSignature(operation, intent);
  const idempotencyKey = pendingAttempts.get(signature) ?? crypto.randomUUID();
  pendingAttempts.set(signature, idempotencyKey);
  return {
    ...noAuthRetryRequestOptions(),
    ...(signal ? { signal } : {}),
    headers: {
      'Idempotency-Key': idempotencyKey,
      ...(version ? { 'If-Match': `"${version}"` } : {}),
    },
  };
}

async function executeAttempt<T>(
  operation: string,
  intent: unknown,
  version: number | undefined,
  scopeId: string,
  run: (options: ReturnType<typeof requestOptions>) => Promise<T>,
): Promise<T> {
  const scopedOperation = `${scopeId}:${operation}`;
  const signature = attemptSignature(scopedOperation, intent);
  try {
    const result = await run(requestOptions(scopedOperation, intent, version));
    pendingAttempts.delete(signature);
    return result;
  } catch (cause) {
    const error = normalizeApiError(cause);
    if (error.status > 0 && error.status < 500 && ![408, 425, 429].includes(error.status)) {
      pendingAttempts.delete(signature);
    }
    throw error;
  }
}

export const supportQualityApiSource: SupportQualitySource = {
  async listTasks(projectId, cursor, signal) {
    try {
      return await supportQualityTaskList(
        projectId,
        { limit: 50, ...(cursor ? { cursor } : {}) },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async claimTask(projectId, task) {
    const intent = { taskId: task.id, version: task.version };
    return executeAttempt('task-claim', intent, task.version, projectId, (options) =>
      supportQualityTaskClaim(projectId, task.id, options),
    );
  },
  async releaseTask(projectId, task) {
    const intent = { taskId: task.id, version: task.version };
    return executeAttempt('task-release', intent, task.version, projectId, (options) =>
      supportQualityTaskRelease(projectId, task.id, options),
    );
  },
  async cancelTask(projectId, task) {
    const intent = { taskId: task.id, version: task.version };
    return executeAttempt('task-cancel', intent, task.version, projectId, (options) =>
      supportQualityTaskCancel(projectId, task.id, options),
    );
  },
  async listReviews(projectId, ownOperatorId, cursor, signal) {
    try {
      return ownOperatorId
        ? await supportQualityOperatorReviews(
            projectId,
            ownOperatorId,
            { limit: 50, ...(cursor ? { cursor } : {}) },
            signal ? { signal } : undefined,
          )
        : await supportQualityReviewList(
            projectId,
            { limit: 50, ...(cursor ? { cursor } : {}) },
            signal ? { signal } : undefined,
          );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readReview(projectId, reviewId, signal) {
    try {
      return await supportQualityReviewDetail(projectId, reviewId, signal ? { signal } : undefined);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readReviewBootstrap(projectId, reviewId, signal) {
    try {
      return await supportQualityReviewBootstrap(
        projectId,
        reviewId,
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readEvidenceExcerpt(projectId, reviewId, messageId, signal) {
    try {
      return await supportQualityReviewEvidenceExcerpt(
        projectId,
        reviewId,
        messageId,
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createReview(projectId, input) {
    return executeAttempt('review-create', input, undefined, projectId, (options) =>
      supportQualityCreateReview(projectId, input, options),
    );
  },
  async saveDraft(projectId, reviewId, version, draft) {
    const intent = { reviewId, version, draft };
    return executeAttempt('draft-replace', intent, version, projectId, (options) =>
      supportQualityReplaceDraft(projectId, reviewId, draft, options),
    );
  },
  async submit(projectId, reviewId, version) {
    const intent = { reviewId, version };
    return executeAttempt('review-submit', intent, version, projectId, (options) =>
      supportQualitySubmitReview(projectId, reviewId, options),
    );
  },
  async voidReview(projectId, reviewId, version, reason) {
    const intent = { reviewId, version, reason };
    return executeAttempt('review-void', intent, version, projectId, (options) =>
      supportQualityVoidReview(projectId, reviewId, { reason }, options),
    );
  },
  async acknowledge(projectId, reviewId, version) {
    const intent = { reviewId, version };
    return executeAttempt('review-acknowledge', intent, version, projectId, (options) =>
      supportQualityReviewAcknowledge(projectId, reviewId, options),
    );
  },
  async reply(projectId, reviewId, version, reply) {
    const intent = { reviewId, version, reply };
    return executeAttempt('review-reply', intent, version, projectId, (options) =>
      supportQualityReviewOperatorReply(projectId, reviewId, { reply }, options),
    );
  },
  async dispute(projectId, reviewId, version, reason) {
    const intent = { reviewId, version, reason };
    return executeAttempt('dispute-open', intent, version, projectId, (options) =>
      supportQualityOpenDispute(projectId, reviewId, { reason }, options),
    );
  },
  async listDisputes(projectId, query, signal) {
    try {
      return await supportQualityDisputeList(
        projectId,
        { limit: 50, ...query },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async listScorecards(projectId, signal) {
    try {
      return await supportQualityScorecards(projectId, signal ? { signal } : undefined);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async listCalibrations(projectId, cursor, signal) {
    try {
      return await supportQualityCalibrations(
        projectId,
        { limit: 50, ...(cursor ? { cursor } : {}) },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async listCalibrationCandidates(projectId, search, cursor, signal) {
    try {
      return await supportQualityCalibrationCandidateList(
        projectId,
        { limit: 100, ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readCalibrationBootstrap(projectId, calibrationId, signal) {
    try {
      return await supportQualityCalibrationBootstrap(
        projectId,
        calibrationId,
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createCalibration(projectId, input) {
    return executeAttempt('calibration-create', input, undefined, projectId, (options) =>
      supportQualityCreateCalibration(projectId, input, options),
    );
  },
  async createCalibrationReview(projectId, calibrationId, input) {
    return executeAttempt(
      'calibration-review-create',
      { calibrationId, input },
      undefined,
      projectId,
      (options) => supportQualityCreateCalibrationReview(projectId, calibrationId, input, options),
    );
  },
  async createSamplingPolicy(projectId, input) {
    return executeAttempt('sampling-policy-create', input, undefined, projectId, (options) =>
      supportQualitySamplingPolicyCreate(projectId, input, options),
    );
  },
  async runSampling(projectId, input) {
    return executeAttempt('sampling-run', input, undefined, projectId, (options) =>
      supportQualitySamplingRunCreate(projectId, input, options),
    );
  },
  async readCalibration(projectId, calibrationId, signal) {
    try {
      return await supportQualityCalibrationRead(
        projectId,
        calibrationId,
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async addCalibrationParticipant(projectId, calibrationId, version, cmsUserId) {
    const intent = { calibrationId, version, cmsUserId };
    await executeAttempt('calibration-participant', intent, version, projectId, (options) =>
      supportQualityCalibrationParticipantAdd(
        projectId,
        calibrationId,
        { reviewerCmsUserIds: [cmsUserId] },
        options,
      ),
    );
  },
  async setCalibrationBaseline(projectId, calibrationId, version, reviewId) {
    const intent = { calibrationId, version, reviewId };
    await executeAttempt('calibration-baseline', intent, version, projectId, (options) =>
      supportQualityCalibrationBaselineSet(projectId, calibrationId, { reviewId }, options),
    );
  },
  async closeCalibration(projectId, calibrationId, version, consensusScore) {
    const intent = { calibrationId, version, consensusScore };
    await executeAttempt('calibration-close', intent, version, projectId, (options) =>
      supportQualityCloseCalibration(projectId, calibrationId, { consensusScore }, options),
    );
  },
  async createScorecardRevision(projectId, scorecard) {
    const body = {
      criticalFailureOutcome: scorecard.criticalFailureOutcome,
      sections: scorecard.sections,
    };
    const intent = {
      scorecardId: scorecard.id,
      revision: scorecard.currentRevisionNumber,
      sections: scorecard.sections,
    };
    return executeAttempt('scorecard-revision', intent, undefined, projectId, (options) =>
      supportQualityCreateScorecardRevision(projectId, scorecard.id, body, options),
    );
  },
  async resolveDispute(projectId, dispute, note) {
    const intent = { disputeId: dispute.id, version: dispute.version, note };
    return executeAttempt('dispute-resolve', intent, dispute.version, projectId, (options) =>
      supportQualityResolveDispute(
        projectId,
        dispute.id,
        { outcome: 'RESOLVED', resolutionNote: note },
        options,
      ),
    );
  },
  async withdrawDispute(projectId, dispute) {
    const intent = { disputeId: dispute.id, version: dispute.version };
    return executeAttempt('dispute-withdraw', intent, dispute.version, projectId, (options) =>
      supportQualityWithdrawDispute(projectId, dispute.id, options),
    );
  },
};

const now = new Date();
const mockTasks: SupportQualityTaskResponseDto[] = [
  {
    id: 'task-001',
    projectId: 'project-1',
    caseId: 'case-4821',
    conversationId: 'conversation-4821',
    operatorCmsUserId: 'operator-anna',
    assignedReviewerCmsUserId: null,
    scorecardRevisionId: 'scorecard-rev-3',
    scorecardId: 'scorecard-main',
    scorecardRevisionNumber: 3,
    defaultEvidenceMessageId: 'message-4821',
    defaultScores: [{ itemCode: 'EMPATHY', applicable: true }],
    samplingPolicyRevisionId: 'policy-weekly',
    populationReceiptId: 'population-42',
    selectionReasonCode: 'RANDOM_SAMPLE',
    state: 'READY',
    version: 1,
    dueAt: new Date(now.getTime() + 3_600_000).toISOString(),
  },
  {
    id: 'task-002',
    projectId: 'project-1',
    caseId: 'case-4790',
    conversationId: 'conversation-4790',
    operatorCmsUserId: 'operator-mikhail',
    assignedReviewerCmsUserId: 'reviewer-current',
    scorecardRevisionId: 'scorecard-rev-3',
    scorecardId: 'scorecard-main',
    scorecardRevisionNumber: 3,
    defaultEvidenceMessageId: 'message-4790',
    defaultScores: [{ itemCode: 'EMPATHY', applicable: true }],
    samplingPolicyRevisionId: 'policy-risk',
    populationReceiptId: 'population-41',
    selectionReasonCode: 'SLA_BREACH_SAMPLE',
    state: 'CLAIMED',
    version: 2,
    dueAt: new Date(now.getTime() - 1_800_000).toISOString(),
  },
];

const scorecard: SupportQualityScorecardResponseDto = {
  id: 'scorecard-main',
  code: 'SUPPORT_CORE',
  name: 'Основная оценка поддержки',
  state: 'ACTIVE',
  currentRevisionId: 'scorecard-rev-3',
  currentRevisionNumber: 3,
  criticalFailureOutcome: 'FAIL_REVIEW',
  sections: [
    {
      code: 'COMMUNICATION',
      name: 'Коммуникация',
      description: 'Тон и ясность ответа',
      weightBasisPoints: 5000,
      items: [
        {
          code: 'GREETING',
          name: 'Приветствие и тон',
          guidance: 'Проверьте уместность и эмпатию',
          applicability: 'REVIEWER_DECIDES',
          maximumScore: 5,
          ratingScale: 'NUMERIC',
          criticalFailure: false,
        },
        {
          code: 'CLARITY',
          name: 'Ясность решения',
          guidance: 'Следующий шаг должен быть однозначным',
          applicability: 'ALWAYS',
          maximumScore: 10,
          ratingScale: 'NUMERIC',
          criticalFailure: false,
        },
      ],
    },
    {
      code: 'RESOLUTION',
      name: 'Решение',
      description: 'Точность и полнота решения',
      weightBasisPoints: 5000,
      items: [
        {
          code: 'ACCURACY',
          name: 'Точность ответа',
          guidance: 'Факты и сроки должны быть проверены',
          applicability: 'ALWAYS',
          maximumScore: 10,
          ratingScale: 'NUMERIC',
          criticalFailure: true,
        },
      ],
    },
  ],
};

const mockReviews: SupportQualityReviewDetailResponseDto[] = [
  {
    id: 'review-001',
    taskId: 'task-002',
    caseId: 'case-4790',
    conversationId: 'conversation-4790',
    operatorCmsUserId: 'operator-mikhail',
    reviewerCmsUserId: 'reviewer-current',
    kind: 'STANDARD',
    state: 'DRAFT',
    version: 2,
    selectionReasonCode: 'SLA_BREACH_SAMPLE',
    summary: 'Проверить точность обещанного срока.',
    totalScore: 16,
    maximumScore: 25,
    criticalFailureOutcome: 'NONE',
    acknowledgmentState: 'PENDING',
    submittedAt: null,
    scores: [
      {
        itemCode: 'GREETING',
        itemLabel: 'Приветствие и тон',
        applicable: true,
        score: 4,
        maximumScore: 5,
        rating: null,
        feedback: 'Спокойный тон',
        coachingTheme: null,
        rootCause: null,
      },
      {
        itemCode: 'CLARITY',
        itemLabel: 'Ясность решения',
        applicable: true,
        score: 6,
        maximumScore: 10,
        rating: null,
        feedback: 'Не обозначен следующий шаг',
        coachingTheme: 'EXPECTATION_SETTING',
        rootCause: 'PROCESS_GAP',
      },
      {
        itemCode: 'ACCURACY',
        itemLabel: 'Точность ответа',
        applicable: true,
        score: 6,
        maximumScore: 10,
        rating: null,
        feedback: 'Срок указан без проверки',
        coachingTheme: null,
        rootCause: null,
      },
    ],
    evidence: [
      {
        messageId: 'message-871',
        messageRevisionNumber: 1,
        messageContentVersion: 1,
        rationale: 'Здесь оператор обещает срок',
      },
    ],
    disputes: [],
  },
  {
    id: 'review-002',
    taskId: null,
    caseId: 'case-4652',
    conversationId: 'conversation-4652',
    operatorCmsUserId: 'operator-anna',
    reviewerCmsUserId: 'reviewer-current',
    kind: 'STANDARD',
    state: 'SUBMITTED',
    version: 4,
    selectionReasonCode: 'RANDOM_SAMPLE',
    summary: 'Сильная работа: точное решение и понятное объяснение.',
    totalScore: 23,
    maximumScore: 25,
    criticalFailureOutcome: 'NONE',
    acknowledgmentState: 'PENDING',
    submittedAt: new Date(now.getTime() - 86_400_000).toISOString(),
    scores: [
      {
        itemCode: 'GREETING',
        itemLabel: 'Приветствие и тон',
        applicable: true,
        score: 5,
        maximumScore: 5,
        rating: null,
        feedback: '',
        coachingTheme: null,
        rootCause: null,
      },
      {
        itemCode: 'CLARITY',
        itemLabel: 'Ясность решения',
        applicable: true,
        score: 9,
        maximumScore: 10,
        rating: null,
        feedback: '',
        coachingTheme: null,
        rootCause: null,
      },
      {
        itemCode: 'ACCURACY',
        itemLabel: 'Точность ответа',
        applicable: true,
        score: 9,
        maximumScore: 10,
        rating: null,
        feedback: '',
        coachingTheme: null,
        rootCause: null,
      },
    ],
    evidence: [
      {
        messageId: 'message-762',
        messageRevisionNumber: 2,
        messageContentVersion: 2,
        rationale: 'Финальное объяснение решения',
      },
    ],
    disputes: [],
  },
];

const mockCalibrationDetail: SupportQualityCalibrationDetailResponseDto = {
  id: 'calibration-01',
  operatorCmsUserId: 'operator-anna',
  scorecardRevisionId: 'scorecard-rev-3',
  state: 'OPEN',
  version: 2,
  minimumReviews: 2,
  peerVisibility: 'AFTER_OWN_SUBMISSION',
  peerReviewsVisible: false,
  baselineReviewId: null,
  consensusScore: null,
  agreementBasisPoints: null,
  criterionVariance: [],
  participants: [
    {
      reviewerCmsUserId: 'cms_1',
      state: 'INVITED',
      reviewId: null,
    },
    {
      reviewerCmsUserId: 'reviewer-second',
      state: 'SUBMITTED',
      reviewId: null,
    },
  ],
};

function summary(review: SupportQualityReviewDetailResponseDto): SupportQualityReviewResponseDto {
  return {
    id: review.id,
    taskId: review.taskId,
    caseId: review.caseId,
    conversationId: review.conversationId,
    operatorCmsUserId: review.operatorCmsUserId,
    reviewerCmsUserId: review.reviewerCmsUserId,
    kind: review.kind,
    state: review.state,
    version: review.version,
    selectionReasonCode: review.selectionReasonCode,
    summary: review.summary,
    totalScore: review.totalScore,
    maximumScore: review.maximumScore,
    criticalFailureOutcome: review.criticalFailureOutcome,
    acknowledgmentState: review.acknowledgmentState,
    submittedAt: review.submittedAt,
  };
}
function requireMockReview(id: string): SupportQualityReviewDetailResponseDto {
  const value = mockReviews.find((review) => review.id === id);
  if (!value) throw new Error('Оценка не найдена');
  return value;
}

const mockSource: SupportQualitySource = {
  async listTasks() {
    return structuredClone({ items: mockTasks, nextCursor: null });
  },
  async claimTask(_projectId, task) {
    const value = mockTasks.find(({ id }) => id === task.id) ?? task;
    value.state = 'CLAIMED';
    value.version += 1;
    value.assignedReviewerCmsUserId = 'reviewer-current';
    return structuredClone(value);
  },
  async releaseTask(_projectId, task) {
    return structuredClone({
      ...task,
      state: 'READY' as const,
      version: task.version + 1,
      assignedReviewerCmsUserId: null,
    });
  },
  async cancelTask(_projectId, task) {
    return structuredClone({
      ...task,
      state: 'CANCELLED' as const,
      version: task.version + 1,
    });
  },
  async listReviews(_projectId, ownOperatorId) {
    const items = mockReviews
      .filter((review) => !ownOperatorId || review.operatorCmsUserId === ownOperatorId)
      .map(summary);
    return structuredClone({ items, nextCursor: null });
  },
  async readReview(_projectId, id) {
    return structuredClone(requireMockReview(id));
  },
  async readReviewBootstrap(_projectId, id) {
    const review = structuredClone(requireMockReview(id));
    return {
      review,
      scorecard: {
        scorecardId: scorecard.id,
        scorecardCode: scorecard.code,
        scorecardName: scorecard.name,
        revisionId: scorecard.currentRevisionId,
        revisionNumber: scorecard.currentRevisionNumber,
        criticalFailureOutcome: scorecard.criticalFailureOutcome as
          'FAIL_REVIEW' | 'CAP_SCORE_AT_SECTION' | 'FLAG_ONLY',
        sections: scorecard.sections.map((section) => ({
          code: section.code,
          name: section.name,
          description: section.description,
          sectionWeightBasisPoints: section.weightBasisPoints,
          criteria: section.items.map((item) => ({
            code: item.code,
            label: item.name,
            guidance: item.guidance,
            ratingScale: item.ratingScale as 'BINARY' | 'THREE_POINT' | 'FIVE_POINT' | 'NUMERIC',
            criticalFailure: item.criticalFailure,
            applicability: item.applicability as 'ALWAYS' | 'CONDITIONAL' | 'REVIEWER_DECIDES',
            allowNotApplicable: item.applicability === 'REVIEWER_DECIDES',
            maximumScore: item.maximumScore,
          })),
        })),
      },
      rootCauseOptions: [
        { code: 'KNOWLEDGE_GAP', label: 'Пробел в знаниях' },
        { code: 'PROCESS_GAP', label: 'Пробел в процессе' },
      ],
      coachingThemeOptions: [
        { code: 'ACCURACY', label: 'Точность ответа' },
        { code: 'EXPECTATION_SETTING', label: 'Управление ожиданиями' },
      ],
      evidenceOptions: review.evidence.map((evidence, ordinal) => ({
        messageId: evidence.messageId,
        ordinal: ordinal + 1,
        role: 'ADMIN' as const,
        createdAt: new Date(now.getTime() - ordinal * 60_000).toISOString(),
        messageContentVersion: evidence.messageContentVersion,
        messageRevisionNumber: evidence.messageRevisionNumber,
        selected: true,
      })),
      evidenceWindowTruncated: false,
      submissionErrors: review.scores
        .filter(({ applicable, score }) => applicable && score === null)
        .map(({ itemCode }) => ({
          field: `scores.${itemCode}.score`,
          code: 'REQUIRED' as const,
        })),
    };
  },
  async readEvidenceExcerpt(_projectId, id, messageId) {
    const evidence = requireMockReview(id).evidence.find((item) => item.messageId === messageId);
    if (!evidence) throw new Error('Закреплённое сообщение не найдено');
    return {
      messageId,
      messageContentVersion: evidence.messageContentVersion,
      messageRevisionNumber: evidence.messageRevisionNumber,
      excerpt: 'Закреплённый фрагмент ответа оператора.',
      truncated: false,
    };
  },
  async createReview(_projectId, input) {
    const review: SupportQualityReviewDetailResponseDto = {
      id: `review-${Date.now()}`,
      taskId: input.taskId ?? null,
      caseId: input.caseId,
      conversationId: input.conversationId,
      operatorCmsUserId: input.operatorCmsUserId,
      reviewerCmsUserId: 'reviewer-current',
      kind: 'STANDARD',
      state: 'DRAFT',
      version: 1,
      selectionReasonCode: input.selectionReasonCode ?? null,
      summary: input.summary ?? null,
      totalScore: 0,
      maximumScore: 25,
      criticalFailureOutcome: 'NONE',
      acknowledgmentState: 'PENDING',
      submittedAt: null,
      scores: input.scores.map((score) => ({
        ...score,
        itemLabel: score.itemCode,
        maximumScore: 10,
        score: score.score ?? null,
        rating: score.rating ?? null,
        feedback: score.feedback ?? null,
        coachingTheme: score.coachingTheme ?? null,
        rootCause: score.rootCause ?? null,
      })),
      evidence: input.evidence.map((evidence) => ({
        ...evidence,
        messageRevisionNumber: 1,
        messageContentVersion: 1,
        rationale: evidence.rationale ?? null,
      })),
      disputes: [],
    };
    mockReviews.unshift(review);
    return structuredClone(summary(review));
  },
  async saveDraft(_projectId, id, version, draft) {
    const review = requireMockReview(id);
    if (review.version !== version) throw new Error('Оценка уже изменена в другой вкладке');
    review.summary = draft.summary ?? null;
    review.scores = draft.scores.map((score, index) => ({
      ...review.scores[index]!,
      ...score,
      score: score.score ?? null,
      rating: score.rating ?? null,
      feedback: score.feedback ?? null,
      coachingTheme: score.coachingTheme ?? null,
      rootCause: score.rootCause ?? null,
    }));
    review.evidence = draft.evidence.map((evidence) => ({
      ...evidence,
      messageRevisionNumber: 1,
      messageContentVersion: 1,
      rationale: evidence.rationale ?? null,
    }));
    review.totalScore = review.scores.reduce((sum, item) => sum + (item.score ?? 0), 0);
    review.version += 1;
    return structuredClone(summary(review));
  },
  async submit(_projectId, id, version) {
    const review = requireMockReview(id);
    if (review.version !== version) throw new Error('Версия оценки устарела');
    review.state = 'SUBMITTED';
    review.submittedAt = new Date().toISOString();
    review.version += 1;
    if (review.kind === 'CALIBRATION') {
      const participant = mockCalibrationDetail.participants.find(
        ({ reviewerCmsUserId }) => reviewerCmsUserId === review.reviewerCmsUserId,
      );
      if (participant) participant.state = 'SUBMITTED';
      mockCalibrationDetail.peerReviewsVisible = true;
      const peer = mockCalibrationDetail.participants.find(
        ({ reviewerCmsUserId }) => reviewerCmsUserId === 'reviewer-second',
      );
      if (peer) peer.reviewId = 'review-cal-2';
    }
    return structuredClone(summary(review));
  },
  async voidReview(_projectId, id, version) {
    const review = requireMockReview(id);
    if (review.version !== version) throw new Error('Версия оценки устарела');
    review.state = 'VOID';
    review.version += 1;
    return structuredClone(summary(review));
  },
  async acknowledge(_projectId, id) {
    const review = requireMockReview(id);
    review.acknowledgmentState = 'ACKNOWLEDGED';
    review.version += 1;
    return structuredClone(summary(review));
  },
  async reply(_projectId, id) {
    const review = requireMockReview(id);
    review.acknowledgmentState = 'REPLIED';
    review.version += 1;
    return structuredClone(summary(review));
  },
  async dispute(_projectId, id, _version, reason) {
    const review = requireMockReview(id);
    const value: SupportQualityDisputeResponseDto = {
      id: `dispute-${Date.now()}`,
      reviewId: id,
      openedByCmsUserId: review.operatorCmsUserId,
      reason,
      state: 'OPEN',
      version: 1,
      resolutionNote: null,
    };
    review.disputes.push(value);
    return structuredClone(value);
  },
  async listDisputes() {
    return structuredClone({
      items: mockReviews.flatMap((review) =>
        review.disputes
          .filter(({ state }) => state === 'OPEN')
          .map((dispute) => ({
            ...dispute,
            operatorCmsUserId: review.operatorCmsUserId,
            updatedAt: review.submittedAt ?? new Date(0).toISOString(),
          })),
      ),
      nextCursor: null,
    });
  },
  async listScorecards() {
    return structuredClone([scorecard]);
  },
  async listCalibrations() {
    return {
      items: [
        {
          id: 'calibration-01',
          operatorCmsUserId: 'operator-anna',
          scorecardRevisionId: 'scorecard-rev-3',
          state: 'OPEN',
          version: 2,
          minimumReviews: 3,
          peerVisibility: 'AFTER_OWN_SUBMISSION',
          baselineReviewId: null,
          consensusScore: null,
          agreementBasisPoints: null,
          criterionVariance: [],
        },
      ],
      nextCursor: null,
    };
  },
  async listCalibrationCandidates() {
    return {
      items: [
        {
          caseId: 'case-calibration-01',
          caseTitle: 'Задержка ответа по доставке',
          conversationId: 'conversation-calibration-01',
          conversationTitle: 'Доставка заказа',
          operatorCmsUserId: 'operator-anna',
          resolvedAt: new Date(now.getTime() - 86_400_000).toISOString(),
        },
      ],
      nextCursor: null,
    };
  },
  async readCalibrationBootstrap(_projectId, id) {
    if (id !== mockCalibrationDetail.id) throw new Error('Калибровочная сессия не найдена');
    return {
      calibration: structuredClone(mockCalibrationDetail),
      scorecard: {
        scorecardId: scorecard.id,
        scorecardCode: scorecard.code,
        scorecardName: scorecard.name,
        revisionId: scorecard.currentRevisionId,
        revisionNumber: scorecard.currentRevisionNumber,
        criticalFailureOutcome: scorecard.criticalFailureOutcome,
        sections: scorecard.sections.map((section) => ({
          code: section.code,
          name: section.name,
          description: section.description,
          sectionWeightBasisPoints: section.weightBasisPoints,
          criteria: section.items.map((item) => ({
            code: item.code,
            label: item.name,
            guidance: item.guidance,
            ratingScale: item.ratingScale,
            criticalFailure: item.criticalFailure,
            applicability: item.applicability,
            allowNotApplicable: item.applicability === 'REVIEWER_DECIDES',
            maximumScore: item.maximumScore,
          })),
        })),
      },
      initialScores: scorecard.sections.flatMap((section) =>
        section.items.map((item) => ({
          itemCode: item.code,
          applicable: item.applicability === 'ALWAYS',
        })),
      ),
      evidenceOptions: [
        {
          messageId: 'message-calibration-01',
          ordinal: 12,
          role: 'ADMIN',
          createdAt: now.toISOString(),
          messageContentVersion: 1,
          messageRevisionNumber: 1,
          selected: false,
        },
      ],
      evidenceWindowTruncated: false,
      coachingThemeOptions: [],
      rootCauseOptions: [],
    };
  },
  async createCalibration(_projectId, input) {
    return {
      id: `calibration-${Date.now()}`,
      operatorCmsUserId: input.operatorCmsUserId,
      scorecardRevisionId: `${input.scorecardId}-r${input.scorecardRevisionNumber}`,
      state: 'OPEN',
      version: 1,
      minimumReviews: 2,
      peerVisibility: 'AFTER_OWN_SUBMISSION',
      baselineReviewId: null,
      consensusScore: null,
      agreementBasisPoints: null,
      criterionVariance: [],
    };
  },
  async createCalibrationReview(_projectId, calibrationId, input) {
    if (calibrationId !== mockCalibrationDetail.id)
      throw new Error('Калибровочная сессия не найдена');
    const participant = mockCalibrationDetail.participants.find(
      ({ reviewerCmsUserId }) => reviewerCmsUserId === 'cms_1',
    );
    if (!participant || participant.state !== 'INVITED')
      throw new Error('Независимая оценка уже начата');
    const items = new Map(
      scorecard.sections.flatMap((section) =>
        section.items.map((item) => [item.code, item] as const),
      ),
    );
    const review: SupportQualityReviewDetailResponseDto = {
      id: `review-cal-${Date.now()}`,
      taskId: null,
      caseId: 'case-calibration-01',
      conversationId: 'conversation-calibration-01',
      operatorCmsUserId: mockCalibrationDetail.operatorCmsUserId,
      reviewerCmsUserId: participant.reviewerCmsUserId,
      kind: 'CALIBRATION',
      state: 'DRAFT',
      version: 1,
      selectionReasonCode: null,
      summary: null,
      totalScore: input.scores.reduce(
        (sum, item) => sum + (item.applicable ? (item.score ?? 0) : 0),
        0,
      ),
      maximumScore: [...items.values()].reduce((sum, item) => sum + item.maximumScore, 0),
      criticalFailureOutcome: 'NONE',
      acknowledgmentState: 'PENDING',
      submittedAt: null,
      scores: input.scores.map((score) => {
        const item = items.get(score.itemCode);
        if (!item) throw new Error('Критерий не найден в закреплённой ревизии');
        return {
          ...score,
          itemLabel: item.name,
          maximumScore: item.maximumScore,
          score: score.score ?? null,
          rating: score.rating ?? null,
          feedback: score.feedback ?? null,
          coachingTheme: score.coachingTheme ?? null,
          rootCause: score.rootCause ?? null,
        };
      }),
      evidence: input.evidence.map((evidence) => ({
        ...evidence,
        messageRevisionNumber: 1,
        messageContentVersion: 1,
        rationale: evidence.rationale ?? null,
      })),
      disputes: [],
    };
    mockReviews.unshift(review);
    (participant as { state: string }).state = 'DRAFT';
    participant.reviewId = review.id;
    return structuredClone(summary(review));
  },
  async createSamplingPolicy(_projectId, input) {
    return {
      ...input,
      id: `policy-${Date.now()}`,
      currentRevisionId: `policy-revision-${Date.now()}`,
      revisionNumber: 1,
      state: 'ACTIVE',
    };
  },
  async runSampling(_projectId, input) {
    return {
      samplingPolicyRevisionId: input.samplingPolicyId,
      populationFrom: input.populationFrom,
      populationUntil: input.populationUntil,
      populationReceiptId: `population-${Date.now()}`,
      populationDigest: 'a'.repeat(64),
      eligibleCount: 100,
      selectedCount: 10,
    };
  },
  async readCalibration(_projectId, id) {
    if (id !== mockCalibrationDetail.id) throw new Error('Калибровочная сессия не найдена');
    return structuredClone(mockCalibrationDetail);
  },
  async addCalibrationParticipant() {},
  async setCalibrationBaseline() {},
  async closeCalibration() {},
  async createScorecardRevision(_projectId, card) {
    card.currentRevisionNumber += 1;
    return structuredClone(card);
  },
  async resolveDispute(_projectId, dispute, note) {
    return {
      ...dispute,
      state: 'RESOLVED',
      version: dispute.version + 1,
      resolutionNote: note,
    };
  },
  async withdrawDispute(_projectId, dispute) {
    return { ...dispute, state: 'WITHDRAWN', version: dispute.version + 1 };
  },
};

export const supportQualitySource: SupportQualitySource =
  isMockMode || import.meta.env.MODE === 'test' ? mockSource : supportQualityApiSource;
