import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sourceRoot = path.join(root, 'src')
const forbidden = [
  ['selected-user role authority', /auth\.user\??\.role/],
  ['legacy projected member role', /\bmemberRole\b/],
  ['legacy role mapping', /\blegacyRole\b/],
  ['knowledge membership role probe', /\bgetKnowledgeProjectRole\b/],
  ['role-based proposal authority', /\bcanReviewAIProposals\b/],
  [
    'legacy Project member API',
    /\b(?:platformMembers|platformCreateMember|platformDeleteMember|ProjectMemberResponseDto)\b/,
  ],
]

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (target.includes(`${path.sep}shared${path.sep}api${path.sep}generated`)) return []
      return files(target)
    }
    if (!entry.isFile() || !/\.(?:ts|vue)$/.test(entry.name) || entry.name.endsWith('.test.ts')) return []
    return [target]
  }))
  return nested.flat()
}

const violations = []
for (const file of await files(sourceRoot)) {
  const source = await readFile(file, 'utf8')
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) violations.push(`${path.relative(root, file)}: ${label}`)
  }
}

if (violations.length) {
  throw new Error(`Legacy IAM authority references found:\n${violations.join('\n')}`)
}

console.log('Frontend IAM authority check passed')
