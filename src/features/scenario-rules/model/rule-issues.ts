import type { ScenarioRuleIssueResponseDto } from '@/shared/api/generated/models'

import type { MappedRuleIssue, RulePathIndex } from './rule-types'

export function mapBackendRuleIssues(issues: ScenarioRuleIssueResponseDto[], pathIndex: RulePathIndex): MappedRuleIssue[] {
  const paths = Object.keys(pathIndex).sort((left, right) => right.length - left.length)
  return issues.map((issue) => {
    const normalized = issue.path.startsWith('rule.') ? issue.path.slice('rule.'.length) : issue.path
    const nodePath = paths.find((path) => normalized === path || normalized.startsWith(`${path}.`))
    if (!nodePath) return { ...issue }
    const entry = pathIndex[nodePath]
    if (!entry) return { ...issue }
    const fieldPath = normalized === nodePath ? undefined : normalized.slice(nodePath.length + 1)
    return { ...issue, nodeId: entry.nodeId, ...(fieldPath ? { fieldPath } : {}) }
  })
}
