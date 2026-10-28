import { PendingButton } from '@/app/components/PendingButton';
import { Icon } from '@/app/components/Icon';
import { CHAT_LINE_MAX, END_VARS, START_VARS, type ChatSettings } from '@/lib/bridge-chat-core';
import type { LedgerCheck } from '@/lib/bridge-chat';
import { saveChatAction } from './mixitup-actions';

const label = 'block text-xs font-semibold text-gray-300 mb-1';
const primary = 'rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-60';
const vars = (v: readonly string[]) => v.map(x => `{${x}}`).join(' ');

/** Mix It Up → Chat and Brie Bucks: the posts when the stream starts and ends, the Brie Bucks backup and the Brie Bucks check. ROADMAP 55.10. */
export function ChatBucks({ chat, check, when }: { chat: ChatSettings; check: LedgerCheck | null; when: (t: number) => string }) {
  return (
    <div className="space-y-6">
      <form action={saveChatAction} className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="chat" className="text-yellow-400" />Chat and Brie Bucks</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            All of this goes through TCG Bridge 0.8.0 or newer and is off until you switch it on. A stream starts when the site first sees it live and ends when it sees it offline.
            To shout a big pull in chat, add a line to a rule on the Big pulls tab.
          </p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="startOn" defaultChecked={chat.startOn} className="toggle toggle-sm toggle-primary" />Say it when the stream starts</label>
            <label className={label} htmlFor="chat-start">Message <span className="font-normal text-gray-500">(variables {vars(START_VARS)})</span></label>
            <input id="chat-start" name="startText" defaultValue={chat.startText} maxLength={CHAT_LINE_MAX} className="input w-full" />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="endOn" defaultChecked={chat.endOn} className="toggle toggle-sm toggle-primary" />Post the top pull and top three pullers when it ends</label>
            <label className={label} htmlFor="chat-end">Message <span className="font-normal text-gray-500">(variables {vars(END_VARS)}; nothing is posted when nobody pulled)</span></label>
            <input id="chat-end" name="endText" defaultValue={chat.endText} maxLength={CHAT_LINE_MAX} className="input w-full" />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="backup" defaultChecked={chat.backup} className="toggle toggle-sm toggle-primary" />Back up everyone&rsquo;s Brie Bucks at the start and end</label>
            <p className="text-xs text-gray-500">TCG Bridge saves a CSV in Documents\TCG Bridge\backups (the newest 30 are kept). The Settings tab of the app has Open backups.</p>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="check" defaultChecked={chat.check} className="toggle toggle-sm toggle-primary" />Check the charges when the stream ends</label>
            <p className="text-xs text-gray-500">TCG Bridge keeps its own list of every charge and refund. At the end the site compares it with its own and lists the ones only one side has, or with a different amount. Balances are not compared.</p>
          </div>
          <PendingButton type="submit" className={primary}>Save</PendingButton>
        </div>
      </form>
      <section className="card rounded-2xl px-6 py-5 space-y-2" aria-labelledby="check-h">
        <h2 id="check-h" className="font-semibold text-white flex items-center gap-2"><Icon name="check" className="text-yellow-400" />Last Brie Bucks check</h2>
        {!check ? <p className="text-sm text-gray-500">No check has run yet.</p> : (
          <>
            <p className="text-sm text-gray-300">{when(check.at)}: the site sent {check.site}, TCG Bridge recorded {check.app}. {check.problems.length ? `${check.problems.length} differ.` : 'They match.'}</p>
            {check.problems.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-300 space-y-0.5">{check.problems.map(p => <li key={p}>{p}</li>)}</ul>}
          </>
        )}
      </section>
    </div>
  );
}
