import { uid } from '@/shared/lib/format'

import type { RuleDraft } from './rule-types'

export function createRuleDraft(): RuleDraft {
  return {
    version: 1,
    root: {
      nodeId: uid('rule_node'),
      kind: 'all',
      children: [],
    },
  }
}
