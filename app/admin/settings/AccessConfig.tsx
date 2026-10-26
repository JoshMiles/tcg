import { Icon } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import { Chip } from '../components/ui';
import { ACCESS_LABELS, ACCESS_MODES, MAX_TESTERS, MESSAGE_MAX, MODE_HINTS, MODE_LABELS, type AccessSettings, type TesterRecord } from '@/lib/access-core';
import type { AccessLogEntry } from '@/lib/access';
import { addTesterAction, saveAccessAction } from './access-actions';
import { RemoveTesterButton } from './TesterControls';

const input = 'input w-full';
const label = 'block text-xs font-semibold text-gray-300 mb-1';
const help = 'text-[11px] text-gray-500 mt-1';
const primary = 'rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-60';

const LABEL_TEXT = { none: 'No banner', alpha: 'Alpha banner', beta: 'Beta banner' } as const;
const when = (t: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

/** Settings → Access: lock the site to the testers list, label it alpha / beta, and manage the testers (ROADMAP Track 16). */
export function AccessConfig({ settings: s, testers, log, filter }: { settings: AccessSettings; testers: TesterRecord[]; log: AccessLogEntry[]; filter: string }) {
  const q = filter.trim().toLowerCase();
  const shown = q ? testers.filter(t => t.login.includes(q) || (t.note ?? '').toLowerCase().includes(q)) : testers;
  const alpha = testers.filter(t => t.tier === 'alpha').length;
  const beta = testers.length - alpha;

  return (
    <div className="space-y-6">
      <form action={saveAccessAction} className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="lock" className="text-yellow-400" />Who can use the site</h2>
          <p className="text-xs text-gray-500 mt-0.5">While the site is closed, only the people on the list below and staff get in. The Twitch panel, the OBS overlay, the FAQ, Privacy and Terms always work.</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Mode</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {ACCESS_MODES.map(m => (
                <label key={m} className="flex items-start gap-2 rounded-xl border border-gray-800 bg-gray-950/50 p-3 text-sm has-checked:border-yellow-500/60">
                  <input type="radio" name="mode" value={m} defaultChecked={s.mode === m} className="mt-1 accent-yellow-500" />
                  <span><span className="block font-semibold text-white">{MODE_LABELS[m]}</span><span className="block text-[11px] text-gray-500">{MODE_HINTS[m]}</span></span>
                </label>
              ))}
            </div>
            {s.mode !== 'open' && <p className="mt-2 text-xs text-amber-300">The site is closed right now. A change reaches everyone within a minute.</p>}
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Banner and logo pill</legend>
            <div className="flex flex-wrap gap-3">
              {ACCESS_LABELS.map(l => (
                <label key={l} className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="radio" name="label" value={l} defaultChecked={s.label === l} className="accent-yellow-500" />{LABEL_TEXT[l]}
                </label>
              ))}
            </div>
            <p className={help}>Separate from the mode, so a public beta can show the banner without locking anything.</p>
          </fieldset>

          <div>
            <label className={label} htmlFor="ac-message">Message (shown on the closed page, and as the banner text)</label>
            <textarea id="ac-message" name="message" defaultValue={s.message ?? ''} maxLength={MESSAGE_MAX} rows={2} className="textarea w-full" placeholder="Leave empty for the default wording" />
          </div>
          <div className="flex items-center gap-3">
            <PendingButton className={primary}>Save access</PendingButton>
            <span className="text-xs text-gray-500">Settings version {s.v}</span>
          </div>
        </div>
      </form>

      <section className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="flask" className="text-purple-300" />Testers</h2>
            <p className="text-xs text-gray-500 mt-0.5">{alpha} alpha, {beta} beta ({testers.length} of {MAX_TESTERS}). Adding someone gives them the Alpha tester or Beta tester achievement for good.</p>
          </div>
          <form method="get" className="flex gap-2">
            <input type="hidden" name="tab" value="access" />
            <input name="q" defaultValue={filter} placeholder="Filter" aria-label="Filter testers" className={`${input} w-40`} />
          </form>
        </div>

        <form action={addTesterAction} className="px-6 py-4 border-b border-gray-800 grid gap-3 sm:grid-cols-[1fr_9rem_1fr_auto] items-end">
          <div><label className={label} htmlFor="ac-login">Twitch username</label><input id="ac-login" name="login" required placeholder="viewer_name" autoComplete="off" className={input} /></div>
          <div>
            <label className={label} htmlFor="ac-tier">Tier</label>
            <select id="ac-tier" name="tier" defaultValue="beta" className="select w-full"><option value="beta">Beta</option><option value="alpha">Alpha</option></select>
          </div>
          <div><label className={label} htmlFor="ac-note">Note (optional)</label><input id="ac-note" name="note" maxLength={120} className={input} /></div>
          <PendingButton className={primary}>Add</PendingButton>
        </form>

        {shown.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">{testers.length === 0 ? 'Nobody is on the list yet.' : 'No tester matches that filter.'}</p>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {shown.map(t => (
              <li key={t.login} className="px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold text-white">{t.login}</span>
                <Chip tone={t.tier === 'alpha' ? 'purple' : 'amber'}>{t.tier === 'alpha' ? 'Alpha' : 'Beta'}</Chip>
                {t.note && <span className="text-xs text-gray-400 min-w-0 wrap-break-word">{t.note}</span>}
                <span className="text-xs text-gray-600 ml-auto">added {when(t.addedAt)}{t.addedBy ? ` by ${t.addedBy}` : ''}</span>
                <RemoveTesterButton login={t.login} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {log.length > 0 && (
        <section className="card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800"><h2 className="font-semibold text-white">Recent changes</h2></div>
          <ul className="divide-y divide-gray-800/60 text-sm">
            {log.map((e, i) => (
              <li key={i} className="px-6 py-2 flex flex-wrap gap-x-3 text-gray-300"><span>{e.what}</span><span className="text-xs text-gray-500">by {e.by}</span><span className="text-xs text-gray-600 ml-auto">{new Date(e.at).toLocaleString('en-GB')}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
