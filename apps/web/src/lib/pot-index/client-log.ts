/** Report a browser-side failure to /api/pot-index/client-log. Never throws, never awaited. */
export function reportClientError(stage: string, e: unknown, extra: Record<string, unknown> = {}) {
  try {
    const err = e as { message?: string; name?: string; logs?: string[]; stack?: string; code?: unknown; stage?: string }
    const payload = {
      stage: err?.stage ?? stage,
      name: err?.name,
      message: err?.message ?? String(e),
      code: err?.code,
      logs: Array.isArray(err?.logs) ? err.logs.slice(-12) : undefined,
      stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 4).join(' / ') : undefined,
      ...extra,
      at: new Date().toISOString(),
    }
    void fetch('/api/pot-index/client-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {})
  } catch {
    /* ignore */
  }
}
