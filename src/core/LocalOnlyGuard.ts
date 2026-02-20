const BLOCKED_MESSAGE =
  'TrackRSmackR local-only guard blocked a network API call from background context.';

export function enforceLocalOnlyRuntime(): void {
  if (typeof globalThis.fetch === 'function') {
    const originalFetch = globalThis.fetch;
    const blockedFetch = (async (..._args: Parameters<typeof fetch>) => {
      throw new Error(BLOCKED_MESSAGE);
    }) as unknown as typeof fetch;

    Object.assign(blockedFetch, originalFetch);
    globalThis.fetch = blockedFetch;
  }
}
