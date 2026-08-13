import {
  supportPresentationsCatalogOperators,
  supportPresentationsResolveOperators,
} from '@/shared/api/generated/retenive-backend';
import type {
  SupportOperatorPresentationCatalogResponseDto,
  SupportOperatorPresentationResolveResponseDto,
} from '@/shared/api/generated/models';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { isMockMode } from '@/shared/config/data-mode';

export interface SupportOperatorPresentationSource {
  catalog(
    projectId: string,
    search?: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportOperatorPresentationCatalogResponseDto>;
  resolve(
    projectId: string,
    cmsUserIds: string[],
    signal?: AbortSignal,
  ): Promise<SupportOperatorPresentationResolveResponseDto>;
}

export const supportOperatorPresentationApiSource: SupportOperatorPresentationSource = {
  async catalog(projectId, search, cursor, signal) {
    try {
      return await supportPresentationsCatalogOperators(
        projectId,
        {
          limit: 100,
          ...(search?.trim() ? { search: search.trim() } : {}),
          ...(cursor ? { cursor } : {}),
        },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async resolve(projectId, cmsUserIds, signal) {
    const bounded = [...new Set(cmsUserIds)].slice(0, 100);
    if (!bounded.length) return { items: [] };
    try {
      return await supportPresentationsResolveOperators(
        projectId,
        { cmsUserIds: bounded },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockItems = [
  {
    cmsUserId: 'cms-user-1',
    displayName: 'Алексей Воронцов',
    membershipState: 'ACTIVE' as const,
    selectable: true,
    presentationVersion: 1,
    avatar: null,
  },
  {
    cmsUserId: 'cms-user-2',
    displayName: 'Марина Соколова',
    membershipState: 'ACTIVE' as const,
    selectable: true,
    presentationVersion: 1,
    avatar: null,
  },
];

export const supportOperatorPresentationMockSource: SupportOperatorPresentationSource = {
  async catalog(_projectId, search) {
    const query = search?.trim().toLocaleLowerCase('ru') ?? '';
    return {
      items: query
        ? mockItems.filter(({ displayName }) => displayName.toLocaleLowerCase('ru').includes(query))
        : mockItems,
      nextCursor: null,
    };
  },
  async resolve(_projectId, cmsUserIds) {
    return {
      items: cmsUserIds.map(
        (cmsUserId) =>
          mockItems.find((item) => item.cmsUserId === cmsUserId) ?? {
            cmsUserId,
            displayName: 'Участник проекта',
            membershipState: 'INACTIVE' as const,
            selectable: false,
            presentationVersion: 0,
            avatar: null,
          },
      ),
    };
  },
};

export const supportOperatorPresentationSource = isMockMode
  ? supportOperatorPresentationMockSource
  : supportOperatorPresentationApiSource;
