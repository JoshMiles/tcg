'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/app/components/Icon';
import { detectInstallEnv, type InstallEnv, type InstallPlatform } from '@/lib/install-detect';
import { askToInstall, getInstallPrompt, isStandalone, subscribeInstall, wasInstalled } from './install-store';

const TABS: { id: InstallPlatform; label: string }[] = [
  { id: 'ios', label: 'iPhone & iPad' },
  { id: 'android', label: 'Android' },
  { id: 'desktop', label: 'Computer' },
];

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-3 text-gray-300 leading-relaxed">{children}</ol>;
}
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-yellow-400 text-gray-950 font-bold text-sm grid place-items-center tabular-nums" aria-hidden>{n}</span>
      <span className="pt-0.5 min-w-0">{children}</span>
    </li>
  );
}
const B = ({ children }: { children: ReactNode }) => <strong className="text-white">{children}</strong>;

/** How to put the site on a phone's home screen, on the instructions that match the visitor's device. */
export function InstallGuide() {
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [tab, setTab] = useState<InstallPlatform>('ios');
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    const e = detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints);
    setEnv(e); setTab(e.platform);
    const sync = () => { setInstalled(isStandalone() || wasInstalled()); setCanPrompt(!!getInstallPrompt()); };
    sync();
    return subscribeInstall(sync);
  }, []);

  async function install() {
    const accepted = await askToInstall();
    setOutcome(accepted ? 'Installing…' : 'No problem, you can do it any time from the browser menu.');
  }

  const chip = (on: boolean) => `px-4 py-2 rounded-full text-sm font-bold border transition-colors ${on ? 'bg-yellow-400 text-gray-950 border-yellow-400' : 'bg-white/[0.04] text-gray-300 border-white/10 hover:bg-white/10'}`;

  return (
    <div className="space-y-6">
      {installed && (
        <div role="status" className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-green-200 flex items-center gap-3">
          <Icon name="check" className="text-green-400" />You&rsquo;re already using the app. Nothing more to do.
        </div>
      )}

      {env?.inApp && (
        <div role="alert" className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-yellow-100 leading-relaxed">
          <p className="font-bold text-yellow-300"><Icon name="info" className="mr-1.5" />You&rsquo;re in another app&rsquo;s browser</p>
          <p className="text-sm mt-1">Apps like Twitch, Instagram and Discord open links in their own browser, which can&rsquo;t add sites to your home screen. Open this page in {env.platform === 'ios' ? 'Safari' : 'Chrome'} first (usually the &ldquo;&hellip;&rdquo; or share button, then &ldquo;Open in browser&rdquo;).</p>
        </div>
      )}

      {canPrompt && !installed && (
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-gray-200">Your browser can install it in one tap.</p>
          <button type="button" onClick={install} className="tcg-btn px-5 py-2.5 rounded-xl text-sm"><Icon name="download" className="mr-1.5" />Install the app</button>
        </div>
      )}
      {outcome && <p role="status" className="text-sm text-gray-400">{outcome}</p>}

      <div role="tablist" aria-label="Your device" className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={chip(tab === t.id)}>
            {t.label}{env?.platform === t.id && <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70">this device</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel" className="tcg-panel rounded-2xl p-5 sm:p-6 space-y-5">
        {tab === 'ios' && (
          <>
            <h2 className="font-display text-2xl font-bold text-white">iPhone &amp; iPad</h2>
            <Steps>
              <Step n={1}>Open <B>cheesytcg.app</B> in <B>Safari</B> (Chrome and Edge on iPhone can do it too, using the same steps from their share button).</Step>
              <Step n={2}>Tap the <B>Share</B> button, the square with an arrow pointing up. It&rsquo;s at the bottom of the screen on iPhone, and at the top on iPad.</Step>
              <Step n={3}>Scroll down and tap <B>Add to Home Screen</B>. If you don&rsquo;t see it, tap <B>View More</B> first.</Step>
              <Step n={4}>Leave <B>Open as Web App</B> switched on if you see it, then tap <B>Add</B>.</Step>
            </Steps>
            <p className="text-sm text-gray-400 leading-relaxed">
              The app opens full screen from its own icon. iPhones keep a home-screen app separate from Safari, so you&rsquo;ll need to <B>log in with Twitch once</B> the first time you open it.
              If you see a letter instead of the logo, remove the app and add it again.
            </p>
          </>
        )}
        {tab === 'android' && (
          <>
            <h2 className="font-display text-2xl font-bold text-white">Android</h2>
            <Steps>
              <Step n={1}>Open <B>cheesytcg.app</B> in <B>Chrome</B>.</Step>
              <Step n={2}>Tap the <B>menu</B> button (three dots, top right).</Step>
              <Step n={3}>Tap <B>Install app</B> (some phones say <B>Add to Home screen</B>), then tap <B>Install</B>.</Step>
            </Steps>
            <div className="text-sm text-gray-400 leading-relaxed space-y-1.5">
              <p><B>Samsung Internet:</B> tap the menu (three lines), then <B>Add page to</B>, then <B>Home screen</B>.</p>
              <p><B>Firefox:</B> tap the menu (three dots), then <B>Install</B>.</p>
              <p>You can log in with Twitch once it&rsquo;s installed, same as on the website.</p>
            </div>
          </>
        )}
        {tab === 'desktop' && (
          <>
            <h2 className="font-display text-2xl font-bold text-white">Computer</h2>
            <Steps>
              <Step n={1}>Open <B>cheesytcg.app</B> in <B>Chrome</B> or <B>Edge</B>.</Step>
              <Step n={2}>Click the <B>Install</B> icon at the right end of the address bar (a small screen with a down arrow). Or open the browser menu and choose <B>Install The Cheesy TCG</B> (Chrome: under <B>Cast, save and share</B>).</Step>
              <Step n={3}>Click <B>Install</B>. It gets its own window and shows up in your Start menu or Applications folder.</Step>
            </Steps>
            <p className="text-sm text-gray-400 leading-relaxed"><B>Safari on a Mac:</B> choose <B>File</B>, then <B>Add to Dock</B>.</p>
          </>
        )}
      </section>
    </div>
  );
}
