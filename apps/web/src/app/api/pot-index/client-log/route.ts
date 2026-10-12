import { NextResponse } from 'next/server'

/** Browser-side failures of the POTfolio flows, so they show up in server logs next to the route
 *  calls. No secrets: wallet pubkey, stage, raw error text, user agent. Fire and forget. */
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const line = JSON.stringify({ ...body, ua: req.headers.get('user-agent')?.slice(0, 120) }).slice(0, 4000)
    console.error('[potfolio client]', line)
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true })
}
