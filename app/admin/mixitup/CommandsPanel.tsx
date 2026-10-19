'use client';
import { useMemo, useRef, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Chip } from '../components/ui';
import {
  ACTION_IDS, COMMAND_ACTIONS, ERROR_DEFAULTS, ERROR_LABELS, MAX_COMMANDS, REPLY_MAX, renderReply, sampleVars,
  type ChatCommand, type CommandActionId, type ErrorKind,
} from '@/lib/commands-core';
import { saveCommandsAction, tryCommandAction } from './commands-actions';

const input = 'input w-full';
const label = 'block text-xs font-semibold text-gray-300 mb-1';
const help = 'text-[11px] text-gray-500 mt-1';
const primary = 'rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-60';
const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-60';

type Stats = Record<string, { count: number; last: number }>;

/** Mix It Up → Commands: the command builder (ROADMAP 19.2). The whole list is edited here and saved in one piece. */
export function CommandsPanel({ initial, stats, webhookUrl, secret }: { initial: ChatCommand[]; stats: Stats; webhookUrl: string; secret: string }) {
  const [commands, setCommands] = useState<ChatCommand[]>(initial);
  const [selected, setSelected] = useState(initial[0]?.id ?? '');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const cmd = commands.find(c => c.id === selected) ?? null;
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const patch = (p: Partial<ChatCommand>) => { setCommands(cs => cs.map(c => (c.id === selected ? { ...c, ...p } : c))); setDirty(true); setStatus(null); };

  const add = () => {
    if (commands.length >= MAX_COMMANDS) return;
    let n = 1;
    while (commands.some(c => c.id === `command-${n}` || c.name === `command${n}`)) n++;
    const c: ChatCommand = { id: `command-${n}`, name: `command${n}`, aliases: [], enabled: true, action: 'text', reply: 'Hello {username}!', errors: {}, cooldownS: 5, userCooldownS: 0, liveOnly: false };
    setCommands([...commands, c]); setSelected(c.id); setDirty(true);
  };
  const remove = () => {
    if (!cmd) return;
    const rest = commands.filter(c => c.id !== cmd.id);
    setCommands(rest); setSelected(rest[0]?.id ?? ''); setDirty(true);
  };
  const save = () => startSave(async () => {
    const r = await saveCommandsAction(JSON.stringify(commands));
    if (r.ok) { setCommands(r.commands); if (!r.commands.some(c => c.id === selected)) setSelected(r.commands[0]?.id ?? ''); setDirty(false); setStatus({ ok: true, text: 'Commands saved.' }); }
    else setStatus({ ok: false, text: r.message });
  });
  const insertVar = (name: string) => {
    if (!cmd) return;
    const el = replyRef.current;
    const at = el?.selectionStart ?? cmd.reply.length;
    const end = el?.selectionEnd ?? at;
    patch({ reply: `${cmd.reply.slice(0, at)}{${name}}${cmd.reply.slice(end)}` });
    requestAnimationFrame(() => { el?.focus(); const p = at + name.length + 2; el?.setSelectionRange(p, p); });
  };
  const changeAction = (action: CommandActionId) => {
    if (!cmd) return;
    const allowed = COMMAND_ACTIONS[action].errors;
    patch({ action, errors: Object.fromEntries(Object.entries(cmd.errors).filter(([k]) => allowed.includes(k as ErrorKind))) });
  };

  const info = cmd ? COMMAND_ACTIONS[cmd.action] : null;
  const preview = useMemo(() => (cmd ? renderReply(cmd.reply, sampleVars(cmd.action)) : ''), [cmd]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="card rounded-2xl overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-white text-sm">Commands</h2>
            <button type="button" onClick={add} disabled={commands.length >= MAX_COMMANDS} className={`${secondary} py-1! px-2! text-xs`}>New</button>
          </div>
          {commands.length === 0 ? <p className="px-4 py-4 text-sm text-gray-500">No commands yet.</p> : (
            <ul className="divide-y divide-gray-800/70">
              {commands.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected(c.id)} aria-current={c.id === selected ? 'true' : undefined}
                    className={`w-full text-left px-4 py-2.5 hover:bg-white/4 ${c.id === selected ? 'bg-yellow-500/10' : ''}`}>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-white">!{c.name}</span>
                      {!c.enabled && <Chip tone="gray">off</Chip>}
                    </span>
                    <span className="block text-[11px] text-gray-500">{COMMAND_ACTIONS[c.action].label} · {stats[c.id] ? `${stats[c.id].count} runs, last ${new Date(stats[c.id].last).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'never used'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {cmd && info ? (
          <section className="card rounded-2xl overflow-hidden min-w-0">
            <div className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-white font-semibold">
                <input type="checkbox" role="switch" checked={cmd.enabled} onChange={e => patch({ enabled: e.target.checked })} className="toggle toggle-sm toggle-primary" />
                Enabled
              </label>
              <button type="button" onClick={remove} className="text-xs font-semibold text-red-300 hover:text-red-200">Delete this command</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="cmd-name">Name (without the !)</label>
                  <input id="cmd-name" value={cmd.name} onChange={e => patch({ name: e.target.value })} maxLength={24} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="cmd-aliases">Other names (aliases)</label>
                  <input id="cmd-aliases" value={cmd.aliases.join(' ')} onChange={e => patch({ aliases: e.target.value.split(/[,\s]+/) })} placeholder="for example: flex brag" className={input} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="cmd-action">What it does</label>
                <select id="cmd-action" value={cmd.action} onChange={e => changeAction(e.target.value as CommandActionId)} className="select w-full">
                  {ACTION_IDS.map(a => <option key={a} value={a}>{COMMAND_ACTIONS[a].label}</option>)}
                </select>
                <p className={help}>{info.description}</p>
              </div>
              <div>
                <label className={label} htmlFor="cmd-reply">Reply</label>
                <textarea id="cmd-reply" ref={replyRef} value={cmd.reply} onChange={e => patch({ reply: e.target.value })} rows={3} className="textarea w-full" />
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Variables you can add">
                  {info.vars.map(x => (
                    <button key={x.name} type="button" onClick={() => insertVar(x.name)} title={x.help || `For example: ${x.sample}`}
                      className="rounded-md border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs font-mono text-yellow-300 hover:border-yellow-500">{`{${x.name}}`}</button>
                  ))}
                </div>
                <p className={help}>Up to {REPLY_MAX} characters go to chat, without formatting. Unknown {'{words}'} are dropped.</p>
                <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm text-gray-200">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mr-2">Preview</span>{preview || <span className="text-gray-600">Empty reply</span>}
                </div>
              </div>

              <div>
                <p className={label}>When it goes wrong</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {info.errors.map(k => (
                    <div key={k}>
                      <label className="block text-[11px] text-gray-400 mb-1" htmlFor={`cmd-err-${k}`}>{ERROR_LABELS[k]}</label>
                      <input id={`cmd-err-${k}`} value={cmd.errors[k] ?? ''} onChange={e => patch({ errors: { ...cmd.errors, [k]: e.target.value } })} placeholder={ERROR_DEFAULTS[k]} className={input} />
                    </div>
                  ))}
                </div>
                <p className={help}>Empty = the standard text. You can use {'{username}'} and {'{args}'}.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={label} htmlFor="cmd-cd">Cooldown for everyone (s)</label>
                  <input id="cmd-cd" type="number" min={0} max={3600} value={cmd.cooldownS} onChange={e => patch({ cooldownS: Number(e.target.value) })} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="cmd-ucd">Cooldown per viewer (s)</label>
                  <input id="cmd-ucd" type="number" min={0} max={3600} value={cmd.userCooldownS} onChange={e => patch({ userCooldownS: Number(e.target.value) })} className={input} />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm text-white font-semibold">
                  <input type="checkbox" role="switch" checked={cmd.liveOnly} onChange={e => patch({ liveOnly: e.target.checked })} className="toggle toggle-sm toggle-primary" />
                  Only while live
                </label>
              </div>

              <TryIt cmd={cmd} />
            </div>
          </section>
        ) : (
          <section className="card rounded-2xl px-6 py-8 text-sm text-gray-500">Add a command to get started.</section>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className={primary}>{saving ? 'Saving...' : 'Save commands'}</button>
        {dirty && !status && <span className="text-xs text-amber-300">Unsaved changes</span>}
        {status && <span role={status.ok ? 'status' : 'alert'} className={`text-sm ${status.ok ? 'text-green-300' : 'text-red-300'}`}>{status.text}</span>}
      </div>

      <SetupPanel cmd={cmd} webhookUrl={webhookUrl} secret={secret} />
    </div>
  );
}

function TryIt({ cmd }: { cmd: ChatCommand }) {
  const [user, setUser] = useState('');
  const [args, setArgs] = useState('');
  const [out, setOut] = useState('');
  const [busy, start] = useTransition();
  const run = () => start(async () => { setOut((await tryCommandAction(JSON.stringify(cmd), user, args)).json); });
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-3">
      <div>
        <p className="font-semibold text-white text-sm">Try it</p>
        <p className="text-xs text-gray-500">Runs this command as it is above, as a practice run: nothing goes on stream and no cooldown is used.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end">
        <div>
          <label className={label} htmlFor="try-user">Viewer</label>
          <input id="try-user" value={user} onChange={e => setUser(e.target.value)} placeholder="viewer name" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="try-args">What they typed after !{cmd.name}</label>
          <input id="try-args" value={args} onChange={e => setArgs(e.target.value)} placeholder="for example: gouda goat" className={input} />
        </div>
        <button type="button" onClick={run} disabled={busy} className={secondary}>{busy ? 'Running...' : 'Run'}</button>
      </div>
      {out && <pre aria-label="Reply" className="max-h-72 overflow-auto rounded-lg border border-gray-800 bg-black/40 p-3 text-xs text-gray-200 whitespace-pre-wrap wrap-break-word">{out}</pre>}
    </div>
  );
}

function SetupPanel({ cmd, webhookUrl, secret }: { cmd: ChatCommand | null; webhookUrl: string; secret: string }) {
  const body = JSON.stringify({ secret, command: cmd?.name ?? 'stats', username: '$username', args: '$allargs' }, null, 2);
  const copy = (t: string) => { try { void navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } };
  return (
    <section className="card rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="link" className="text-yellow-400" />Set up in Mix It Up</h2>
        <p className="text-xs text-gray-500 mt-0.5">One Web Request action per chat command. Keep the secret private.</p>
      </div>
      <div className="px-6 py-5 space-y-4 text-sm text-gray-300">
        <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-400">
          <li>Make a Chat Command in Mix It Up (for example <code>!{cmd?.name ?? 'stats'}</code>) and add a <strong>Web Request</strong> action: method POST, content type JSON.</li>
          <li>Paste the address and the body below. <code>$username</code> and <code>$allargs</code> are Mix It Up&rsquo;s own.</li>
          <li>Read the answer with a <strong>Webhook Response</strong> action (JSON to special identifiers), then add a <strong>Chat Message</strong> that says the <code>message</code> field. Every variable is also its own field.</li>
        </ol>
        <div>
          <p className={label}>Address</p>
          <div className="flex gap-2"><code className="flex-1 min-w-0 break-all rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs">{webhookUrl}</code><button type="button" onClick={() => copy(webhookUrl)} className={secondary}>Copy</button></div>
        </div>
        <div>
          <p className={label}>Body</p>
          <div className="flex gap-2"><pre className="flex-1 min-w-0 overflow-auto rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs">{body}</pre><button type="button" onClick={() => copy(body)} className={`${secondary} self-start`}>Copy</button></div>
        </div>
      </div>
    </section>
  );
}
