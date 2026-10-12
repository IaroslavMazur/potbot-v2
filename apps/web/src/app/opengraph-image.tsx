import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const alt = 'PotBot POTfolio: any basket of Solana assets as one liquid token'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Shared-link card (X, Telegram, Discord). One line of product, one picture, the URL. */
export default async function OgImage() {
  const plant = await readFile(path.join(process.cwd(), 'public/og-plant.png'))
    .then((b) => `data:image/png;base64,${b.toString('base64')}`)
    .catch(() => null)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0D1117', fontFamily: 'system-ui, sans-serif', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 78% 55%, rgba(20,241,149,0.16) 0%, transparent 55%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 80px', width: 720 }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#ffffff' }}>
            Pot<span style={{ color: '#14F195' }}>Bot</span>
            <span style={{ marginLeft: 14, color: '#8B9BB4', fontWeight: 500 }}>POTfolio</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, fontSize: 64, fontWeight: 900, lineHeight: 1.05, color: '#ffffff', letterSpacing: -1.5 }}>
            <span>Any basket of</span>
            <span>Solana assets.</span>
            <span style={{ color: '#14F195' }}>One liquid token.</span>
          </div>
          <div style={{ display: 'flex', marginTop: 30, fontSize: 26, color: '#c9d4e3' }}>Create a portfolio, hold the token. Exit any time.</div>
          <div style={{ display: 'flex', marginTop: 40, fontSize: 22, color: '#8B9BB4' }}>potbot.fun</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 480 }}>
          {plant ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={plant} width={380} height={380} style={{ objectFit: 'contain' }} />
          ) : null}
        </div>
      </div>
    ),
    { ...size },
  )
}
