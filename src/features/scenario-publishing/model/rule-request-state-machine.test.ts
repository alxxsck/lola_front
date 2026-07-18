import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLatestRuleRequestStateMachine } from './index'

interface Response {
  valid: boolean
  value: string
}

const isResponse = (value: unknown): value is Response => Boolean(
  value
  && typeof value === 'object'
  && typeof (value as Record<string, unknown>).valid === 'boolean'
  && typeof (value as Record<string, unknown>).value === 'string',
)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('latest rule request state machine', () => {
  afterEach(() => vi.useRealTimers())

  it('reports local issues without sending a request', () => {
    const execute = vi.fn()
    const machine = createLatestRuleRequestStateMachine({ execute, isResponse, debounceMs: 300 })

    machine.schedule({ valid: false, issues: [{ message: 'Выберите поле' }] })

    expect(machine.getState()).toEqual({ status: 'local-invalid', issues: [{ message: 'Выберите поле' }] })
    expect(execute).not.toHaveBeenCalled()
  })

  it('debounces edits and validates only the latest request', async () => {
    vi.useFakeTimers()
    const execute = vi.fn(async (request: string) => ({ valid: true, value: request }))
    const machine = createLatestRuleRequestStateMachine({ execute, isResponse, debounceMs: 300 })

    machine.schedule({ valid: true, request: 'first' })
    machine.schedule({ valid: true, request: 'latest' })

    expect(machine.getState()).toEqual({ status: 'debounce' })
    await vi.advanceTimersByTimeAsync(300)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('latest', { signal: expect.any(AbortSignal) })
    expect(machine.getState()).toEqual({ status: 'valid', response: { valid: true, value: 'latest' } })
  })

  it('aborts the previous explicit request and ignores its stale response', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const signals: AbortSignal[] = []
    const execute = vi.fn((request: string, context: { signal: AbortSignal }) => {
      signals.push(context.signal)
      return request === 'first' ? first.promise : second.promise
    })
    const machine = createLatestRuleRequestStateMachine({ execute, isResponse })

    const firstRun = machine.runNow({ valid: true, request: 'first' })
    const secondRun = machine.runNow({ valid: true, request: 'second' })
    second.resolve({ valid: true, value: 'second' })
    await secondRun

    expect(signals[0]?.aborted).toBe(true)
    expect(machine.getState()).toEqual({ status: 'valid', response: { valid: true, value: 'second' } })

    first.resolve({ valid: true, value: 'first' })
    await firstRun
    expect(machine.getState()).toEqual({ status: 'valid', response: { valid: true, value: 'second' } })
  })

  it('cancels pending work silently', async () => {
    const request = deferred<unknown>()
    let signal: AbortSignal | undefined
    const machine = createLatestRuleRequestStateMachine({
      execute: vi.fn((_request: string, context) => {
        signal = context.signal
        return request.promise
      }),
      isResponse,
    })

    const run = machine.runNow({ valid: true, request: 'draft' })
    expect(machine.getState()).toEqual({ status: 'pending' })
    machine.cancel()
    request.reject(new Error('canceled by transport'))
    await run

    expect(signal?.aborted).toBe(true)
    expect(machine.getState()).toEqual({ status: 'idle' })
  })

  it('publishes state transitions through one framework-independent subscription', async () => {
    const statuses: string[] = []
    const machine = createLatestRuleRequestStateMachine({
      execute: vi.fn(async (request: string) => ({ valid: true, value: request })),
      isResponse,
    })
    const unsubscribe = machine.subscribe((state) => statuses.push(state.status))

    await machine.runNow({ valid: true, request: 'draft' })
    unsubscribe()
    machine.cancel()

    expect(statuses).toEqual(['idle', 'pending', 'valid'])
  })

  it('keeps semantic, network and contract failures as different states', async () => {
    const execute = vi.fn<() => Promise<unknown>>()
    const machine = createLatestRuleRequestStateMachine<string, Response>({ execute, isResponse })

    execute.mockResolvedValueOnce({ valid: false, value: 'rejected' })
    await machine.runNow({ valid: true, request: 'semantic' })
    expect(machine.getState()).toEqual({ status: 'semantic-invalid', response: { valid: false, value: 'rejected' } })

    const networkFailure = new Error('offline')
    execute.mockRejectedValueOnce(networkFailure)
    await machine.runNow({ valid: true, request: 'network' })
    expect(machine.getState()).toEqual({ status: 'network-error', error: networkFailure })

    execute.mockResolvedValueOnce({ valid: 'yes', value: 'malformed' })
    await machine.runNow({ valid: true, request: 'contract' })
    expect(machine.getState()).toMatchObject({ status: 'contract-error', error: expect.any(Error) })
  })
})
