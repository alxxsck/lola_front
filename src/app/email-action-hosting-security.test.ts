/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface HeaderRule {
  source: string
  headers: Array<{ key: string; value: string }>
}

const config = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, 'utf8')) as {
  headers?: HeaderRule[]
}

describe('email action hosting boundary', () => {
  it.each([
    '/auth/initial-access',
    '/auth/email-verification',
    '/auth/email-change',
    '/auth/password-reset',
    '/forgot-password',
  ])('serves %s with non-cacheable no-referrer headers', (source) => {
    const rule = config.headers?.find((candidate) => candidate.source === source)
    const headers = Object.fromEntries(
      (rule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value.toLowerCase()]),
    )

    expect(headers).toMatchObject({
      'cache-control': 'no-store, no-cache, must-revalidate',
      pragma: 'no-cache',
      'referrer-policy': 'no-referrer',
    })
  })
})
