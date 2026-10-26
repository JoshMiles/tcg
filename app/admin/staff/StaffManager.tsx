'use client';
import { useState, useTransition } from 'react';
import { UserInput } from '@/app/components/UserInput';
import { ArmedButton } from '@/app/components/ArmedButton';
import { Icon } from '@/app/components/Icon';
import { Chip, Panel, fieldClass, selectClass } from '../components/ui';
import { addStaffAction, removeStaffAction, setStaffRoleAction } from '../staff-actions';
import { ROLE_LABELS, canManage, type AssignableRole, type StaffRole } from '@/lib/staff-core';

interface Row { login: string; displayName?: string; twitchId?: string; role: AssignableRole; addedBy: string; addedText: string; lastLoginText: string }

/** The staff table: add someone by Twitch name, change a role, remove. What each person may do is enforced again on the server. */
export function StaffManager({ staff, viewerRole, viewerLogin }: { staff: Row[]; viewerRole: StaffRole; viewerLogin: string }) {
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<AssignableRole>('mod');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // A role change waits for a second click: promoting to Admin hands over the whole panel, and a select is easy to bump.
  const [changing, setChanging] = useState<{ login: string; role: AssignableRole } | null>(null);
  const canAddAdmin = canManage(viewerRole, 'admin');

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      try { const r = await fn(); setMessage({ ok: r.ok, text: r.message }); if (r.ok) after?.(); } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not work.' }); }
    });

  return (
    <Panel title="Admins and mods" icon="users" hint={`${staff.length} ${staff.length === 1 ? 'person' : 'people'} besides the super admin.`}>
      <form
        className="flex flex-wrap items-end gap-2 mb-5"
        onSubmit={e => { e.preventDefault(); if (login.trim()) run(() => addStaffAction(login, role), () => setLogin('')); }}
      >
        <label className="text-xs text-gray-400 flex-1 min-w-48">Twitch username
          <UserInput value={login} onValueChange={setLogin} onPick={setLogin} placeholder="their Twitch name" className={`${fieldClass} mt-1`} aria-label="Twitch username" />
        </label>
        <label className="text-xs text-gray-400">Role
          <select value={role} onChange={e => setRole(e.target.value as AssignableRole)} className={`${selectClass} block mt-1`}>
            <option value="mod">Mod</option>
            {canAddAdmin && <option value="admin">Admin</option>}
          </select>
        </label>
        <button type="submit" disabled={pending || !login.trim()} title={login.trim() ? undefined : 'Type their Twitch username first'} className="btn btn-primary px-4 py-2 text-sm rounded-xl"><Icon name="check" className="mr-1.5" />Add to staff</button>
      </form>
      {message && <p role="status" className={`text-sm mb-4 ${message.ok ? 'text-emerald-300' : 'text-red-400'}`}>{message.text}</p>}

      {staff.length === 0 ? <p className="text-sm text-gray-600">No admins or mods yet. Add someone above.</p> : (
        <div className="overflow-x-auto">
          <table className="table table-sm w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-3">Person</th><th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3 hidden sm:table-cell">Added</th><th className="py-2 pr-3 hidden md:table-cell">Last sign-in</th><th className="py-2 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => {
                const may = canManage(viewerRole, s.role);
                return (
                  <tr key={s.login} className="border-t border-gray-800/60">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-white">{s.displayName ?? s.login}{s.login === viewerLogin && <span className="ml-2 text-[10px] text-yellow-400 uppercase">you</span>}</p>
                      <p className="text-xs text-gray-500">@{s.login} · {s.twitchId ? <span className="text-emerald-400/80">linked to their Twitch account</span> : <span className="text-amber-400/80">matched by name until they first sign in</span>}</p>
                    </td>
                    <td className="py-2.5 pr-3"><Chip tone={s.role === 'admin' ? 'amber' : 'gray'}>{ROLE_LABELS[s.role]}</Chip></td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 hidden sm:table-cell">{s.addedText} by {s.addedBy}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 hidden md:table-cell">{s.lastLoginText}</td>
                    <td className="py-2.5 text-right">
                      {may ? (
                        <span className="inline-flex items-center gap-2 justify-end">
                          <select
                            aria-label={`Role for ${s.login}`} value={changing?.login === s.login ? changing.role : s.role} disabled={pending} className={selectClass}
                            onChange={e => { const role = e.target.value as AssignableRole; setChanging(role === s.role ? null : { login: s.login, role }); }}
                          >
                            <option value="mod">Mod</option>
                            <option value="admin" disabled={!canAddAdmin}>Admin</option>
                          </select>
                          {changing?.login === s.login && (
                            <>
                              <button type="button" disabled={pending} onClick={() => run(() => setStaffRoleAction(s.login, changing.role), () => setChanging(null))} className="text-xs font-bold text-yellow-300 hover:text-yellow-200 px-2 py-1.5 rounded-lg hover:bg-yellow-500/10">{changing.role === 'admin' ? 'Make admin' : 'Make mod'}</button>
                              <button type="button" disabled={pending} onClick={() => setChanging(null)} className="text-xs font-semibold text-gray-400 hover:text-white px-1.5 py-1.5">Cancel</button>
                            </>
                          )}
                          <ArmedButton
                            disabled={pending} armedLabel="Sure? Remove" title={`Remove ${s.displayName ?? s.login} from the staff`}
                            className="text-xs font-bold text-red-300 hover:text-red-200 px-2 py-1.5 rounded-lg hover:bg-red-500/10"
                            armedClassName="text-xs font-bold text-red-100 bg-red-500/25 px-2 py-1.5 rounded-lg"
                            onConfirm={() => run(() => removeStaffAction(s.login))}
                          >Remove</ArmedButton>
                        </span>
                      ) : <span className="text-xs text-gray-600">Only the super admin</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
