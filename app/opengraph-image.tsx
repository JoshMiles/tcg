import { ImageResponse } from 'next/og';
import { OG_BG, OG_SIZE, brandIconDataUri } from '@/lib/og';
import { CHANNEL_NAME } from '@/lib/site';
import { SITE_NAME } from '@/lib/seo';

export const alt = 'The Cheesy TCG: pull cards, collect the cheese';
export const size = OG_SIZE;
export const contentType = 'image/png';

// The default link preview for every page that doesn't have its own.
export default async function Image() {
  const icon = await brandIconDataUri();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: 72, background: OG_BG, color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontSize: 30, color: '#facc15', letterSpacing: 4, textTransform: 'uppercase', fontWeight: 700 }}>{SITE_NAME}</div>
          <div style={{ fontSize: 82, fontWeight: 800, lineHeight: 1.04, marginTop: 20, display: 'flex', flexDirection: 'column' }}>
            <span>Pull cards.</span><span style={{ color: '#facc15' }}>Collect the cheese.</span>
          </div>
          <div style={{ fontSize: 30, color: '#94a3b8', marginTop: 28 }}>{`Played live on ${CHANNEL_NAME}'s Twitch channel`}</div>
        </div>
        {icon && <img src={icon} width={300} height={300} style={{ borderRadius: 48, border: '4px solid #facc15' }} />}
      </div>
    ),
    size,
  );
}
