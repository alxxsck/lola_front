export type PreparedRuleRequest<Request, Issue> =
  | { valid: true; request: Request }
  | { valid: false; issues: readonly Issue[] }

export type RuleRequestState<Response, Issue> =
  | { status: 'idle' }
  | { status: 'local-invalid'; issues: readonly Issue[] }
  | { status: 'debounce' }
  | { status: 'pending' }
  | { status: 'valid'; response: Response }
  | { status: 'semantic-invalid'; response: Response }
  | { status: 'network-error'; error: unknown }
  | { status: 'contract-error'; error: Error }

export interface RuleRequestContext {
  signal: AbortSignal
}

export interface LatestRuleRequestOptions<Request, Response extends { valid: boolean }> {
  debounceMs?: number
  execute: (request: Request, context: RuleRequestContext) => Promise<unknown>
  isResponse: (value: unknown) => value is Response
}

export interface LatestRuleRequestStateMachine<Request, Response, Issue> {
  getState: () => RuleRequestState<Response, Issue>
  subscribe: (listener: (state: RuleRequestState<Response, Issue>) => void) => () => void
  schedule: (prepared: PreparedRuleRequest<Request, Issue>) => void
  runNow: (prepared: PreparedRuleRequest<Request, Issue>) => Promise<void>
  cancel: () => void
}

export function createLatestRuleRequestStateMachine<
  Request,
  Response extends { valid: boolean },
  Issue = unknown,
>(options: LatestRuleRequestOptions<Request, Response>): LatestRuleRequestStateMachine<Request, Response, Issue> {
  let state: RuleRequestState<Response, Issue> = { status: 'idle' }
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let sequence = 0
  const listeners = new Set<(state: RuleRequestState<Response, Issue>) => void>()

  function transition(nextState: RuleRequestState<Response, Issue>) {
    state = nextState
    listeners.forEach((listener) => listener(state))
  }

  function invalidatePendingWork() {
    sequence += 1
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    controller?.abort()
    controller = undefined
    return sequence
  }

  async function execute(request: Request, requestSequence: number) {
    const requestController = new AbortController()
    controller = requestController
    transition({ status: 'pending' })

    try {
      const response = await options.execute(request, { signal: requestController.signal })
      if (requestSequence !== sequence || requestController.signal.aborted) return
      transition(options.isResponse(response)
        ? response.valid
          ? { status: 'valid', response }
          : { status: 'semantic-invalid', response }
        : { status: 'contract-error', error: new Error('Scenario rule response does not match the expected contract') })
    } catch (error) {
      if (requestSequence !== sequence || requestController.signal.aborted) return
      transition({ status: 'network-error', error })
    } finally {
      if (requestSequence === sequence && controller === requestController) controller = undefined
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    schedule(prepared) {
      const requestSequence = invalidatePendingWork()
      if (!prepared.valid) {
        transition({ status: 'local-invalid', issues: prepared.issues })
        return
      }

      transition({ status: 'debounce' })
      timer = setTimeout(() => {
        timer = undefined
        void execute(prepared.request, requestSequence)
      }, options.debounceMs ?? 400)
    },
    runNow(prepared) {
      const requestSequence = invalidatePendingWork()
      if (!prepared.valid) {
        transition({ status: 'local-invalid', issues: prepared.issues })
        return Promise.resolve()
      }
      return execute(prepared.request, requestSequence)
    },
    cancel() {
      invalidatePendingWork()
      transition({ status: 'idle' })
    },
  }
}
