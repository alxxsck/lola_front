import { describe, expect, it } from 'vitest';
import {
  hasPlatformPermission,
  hasProjectPermission,
  hasProjectOrPlatformPermission,
  PROJECT_PERMISSION_CODES,
} from './permission-access';

describe('permission access', () => {
  it('registers independent Support content and Lead Control capabilities', () => {
    expect(PROJECT_PERMISSION_CODES).toEqual(
      expect.arrayContaining([
        'project.support.activity.read',
        'project.support.alerts.manage',
        'project.support.quality.read',
        'project.support.quality.review',
        'project.reporting.catalog.read',
        'project.reporting.aggregate.read',
        'project.dashboards.author',
        'project.support.search.read',
        'project.support.saved_views.read',
        'project.support.saved_views.self_manage',
        'project.support.saved_views.manage',
        'project.support.macros.read',
        'project.support.macros.use',
        'project.support.macros.manage',
        'project.support.knowledge.read',
        'project.support.knowledge.manage',
        'project.support.content_retention.manage',
        'project.support.content_legal_hold.manage',
        'project.support.external_work.manage',
        'project.support.external_work.inbox_read',
        'project.support.external_work.read_linked',
        'project.support.external_work.retry',
        'project.support.external_work.resolve_unknown',
      ]),
    );
  });

  it('keeps CMS Agent, Analysis and Operations authority independent', () => {
    const permissions = [
      'project.cms_agent.use',
      'project.ai_analyses.read',
      'project.ai_analyses.run',
      'project.ai_analyses.schedule',
      'project.ai_analyses.manage',
      'project.ai_analysis_cost.read',
      'project.ai_operations.read',
      'project.ai_operations.sensitive.read',
      'project.ai_operations.subjects.read',
      'project.ai_operations.audit.read',
      'project.ai_costs.read',
      'project.end_user_state.sensitive.read',
    ];

    expect(hasProjectPermission(permissions, 'project.cms_agent.use')).toBe(true);
    expect(hasProjectPermission(permissions, 'project.ai_analyses.run')).toBe(true);
    expect(hasProjectPermission(['project.ai_analyses.read'], 'project.ai_operations.read')).toBe(
      false,
    );
    expect(
      hasProjectPermission(['project.ai_operations.read'], 'project.ai_operations.subjects.read'),
    ).toBe(false);
    expect(hasProjectPermission(permissions, 'project.ai_costs.read')).toBe(true);
  });

  it('keeps allowance read, policy, grant and reconcile authority independent', () => {
    expect(hasProjectPermission(['project.ai_allowance.read'], 'project.ai_allowance.read')).toBe(
      true,
    );
    expect(hasProjectPermission(['project.ai_allowance.read'], 'project.ai_allowance.manage')).toBe(
      false,
    );
    expect(
      hasProjectPermission(['project.ai_allowance.manage'], 'project.ai_allowance.grant'),
    ).toBe(false);
    expect(
      hasProjectPermission(['project.ai_allowance.grant'], 'project.ai_allowance.reconcile'),
    ).toBe(false);
  });

  it('requires the dedicated sensitive reader for operational state', () => {
    expect(
      hasProjectPermission(
        ['project.end_user_state.sensitive.read'],
        'project.end_user_state.sensitive.read',
      ),
    ).toBe(true);
    expect(
      hasProjectPermission(
        ['project.end_user_state.manage'],
        'project.end_user_state.sensitive.read',
      ),
    ).toBe(false);
  });

  it('recognizes the four independent Telegram broadcast capabilities', () => {
    const permissions = [
      'project.telegram.broadcasts.read',
      'project.telegram.broadcasts.draft',
      'project.telegram.broadcasts.approve',
      'project.telegram.broadcasts.operate',
    ];

    expect(hasProjectPermission(permissions, 'project.telegram.broadcasts.read')).toBe(true);
    expect(hasProjectPermission(permissions, 'project.telegram.broadcasts.draft')).toBe(true);
    expect(hasProjectPermission(permissions, 'project.telegram.broadcasts.approve')).toBe(true);
    expect(hasProjectPermission(permissions, 'project.telegram.broadcasts.operate')).toBe(true);
  });
  it('uses only the selected Project effective Permissions', () => {
    expect(hasProjectPermission(['project.knowledge.write'], 'project.knowledge.write')).toBe(true);
    expect(hasProjectPermission(['project.knowledge.read'], 'project.knowledge.write')).toBe(false);
    expect(hasProjectPermission([], 'project.knowledge.write')).toBe(false);
  });

  it('does not infer Project authority from a role-shaped value', () => {
    const legacyContext = { role: 'OWNER', effectivePermissionCodes: [] };
    expect(
      hasProjectPermission(legacyContext.effectivePermissionCodes, 'project.settings.write'),
    ).toBe(false);
  });

  it('accepts a Platform alternative only when the caller names it explicitly', () => {
    const platform = ['platform.memberships.read'];
    const project: string[] = [];

    expect(hasPlatformPermission(platform, 'platform.memberships.read')).toBe(true);
    expect(
      hasProjectOrPlatformPermission(
        platform,
        project,
        'project.members.read',
        'platform.memberships.read',
      ),
    ).toBe(true);
    expect(hasProjectPermission(project, 'project.members.read')).toBe(false);
  });

  it('keeps notification read and manage authority independent', () => {
    expect(hasProjectPermission(['project.notifications.read'], 'project.notifications.read')).toBe(
      true,
    );
    expect(
      hasProjectPermission(['project.notifications.read'], 'project.notifications.manage'),
    ).toBe(false);
  });

  it('keeps product Telegram installation and link-summary authority independent', () => {
    const permissions = ['project.integrations.read', 'project.telegram.links.read'];
    expect(hasProjectPermission(permissions, 'project.integrations.read')).toBe(true);
    expect(hasProjectPermission(permissions, 'project.integrations.manage')).toBe(false);
    expect(hasProjectPermission(permissions, 'project.telegram.links.read')).toBe(true);
    expect(hasProjectPermission(['project.notifications.read'], 'project.integrations.read')).toBe(
      false,
    );
  });

  it('does not infer personal Telegram send authority from link read or conversation reply', () => {
    expect(
      hasProjectPermission(
        ['project.telegram.personal_messages.send'],
        'project.telegram.personal_messages.send',
      ),
    ).toBe(true);
    expect(
      hasProjectPermission(
        ['project.telegram.links.read', 'project.conversations.reply'],
        'project.telegram.personal_messages.send',
      ),
    ).toBe(false);
  });
});
