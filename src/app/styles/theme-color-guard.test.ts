import { readdirSync, readFileSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src')
const allowedFiles = new Set([
  'app/styles/theme.css',
  'app/styles/theme-color-guard.test.ts',
  'shared/api/mock-data.ts',
])
const rawColor = /#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i
const namedColorDeclaration = /(?:^|[;{])\s*(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|fill|stroke)\s*:\s*(?:black|white|red|blue|green|gray|grey|orange|purple|yellow|pink|brown|cyan|magenta|lime|navy|teal|maroon|olive|silver|aqua|fuchsia)(?=\s*[;}])/i

describe('theme color boundary', () => {
  it.each([
    'color: rgba(0, 0, 0, 0.5)',
    'background: hsla(120, 50%, 50%, 0.5)',
  ])('rejects legacy functional raw color %s', (source) => {
    expect(rawColor.test(source)).toBe(true)
  })

  it('keeps raw UI colors inside the theme token file', () => {
    const violations = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter((file) => ['.css', '.ts', '.vue'].includes(extname(file)))
      .filter((file) => !allowedFiles.has(file))
      .filter((file) => {
        const source = readFileSync(`${sourceRoot}/${file}`, 'utf8')
        return rawColor.test(source) || namedColorDeclaration.test(source)
      })
      .map((file) => relative(sourceRoot, `${sourceRoot}/${file}`))

    expect(violations).toEqual([])
  })
})
