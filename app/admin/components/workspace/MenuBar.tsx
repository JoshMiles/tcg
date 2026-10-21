'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';

// A desktop-style menu bar (File, Edit, ...) shared by the editors; it knows nothing about what it controls.
// Menu > MenuItem / MenuSeparator / SubMenu (a flyout holding any content, e.g. a form). Escape closes, Left / Right move between
// menus, Up / Down between items, a press outside closes. Items that act close the menu; a SubMenu's content keeps it open.

const MenuCtx = createContext<{ open: string | null; setOpen: (v: string | null) => void }>({ open: null, setOpen: () => {} });

const itemCls = 'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-white/10 focus-visible:bg-white/10 outline-hidden disabled:opacity-40 disabled:hover:bg-transparent';

/** `end` sits at the right edge of the bar (Revert / Save, a notice). */
export function MenuBar({ label = 'Menu bar', children, end }: { label?: string; children: React.ReactNode; end?: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const tops = () => [...(ref.current?.querySelectorAll<HTMLElement>('[data-menu-top]') ?? [])];
  // The open menu's own items, not those inside a flyout.
  const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[data-menu-drop] [data-menu-item]') ?? [])].filter(el => !el.closest('[data-menu-flyout]') && !(el as HTMLButtonElement).disabled);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      const top = tops().find(b => b.dataset.menuTop === open);
      setOpen(null);
      top?.focus();
      return;
    }
    const isTop = t.dataset.menuTop !== undefined;
    const isItem = t.dataset.menuItem !== undefined && !t.closest('[data-menu-flyout]');
    if (!isTop && !isItem) return; // typing in a flyout's field is left alone
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const all = tops();
      const cur = all.findIndex(b => b.dataset.menuTop === (isTop ? t.dataset.menuTop : open));
      const next = all[(cur + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      e.preventDefault();
      if (open) setOpen(next.dataset.menuTop ?? null);
      next.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (isTop && open !== t.dataset.menuTop) { setOpen(t.dataset.menuTop ?? null); setTimeout(() => items()[0]?.focus()); return; }
      const list = items();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      (isTop ? list[step > 0 ? 0 : list.length - 1] : list[(list.indexOf(t) + step + list.length) % list.length])?.focus();
    }
  };

  return (
    <MenuCtx.Provider value={{ open, setOpen }}>
      <div ref={ref} role="menubar" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {children}
        {end && <div className="ml-auto flex flex-wrap items-center gap-2 min-w-0">{end}</div>}
      </div>
    </MenuCtx.Provider>
  );
}

export function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const { open, setOpen } = useContext(MenuCtx);
  const isOpen = open === label;
  return (
    <div className="relative">
      <button
        type="button"
        role="menuitem"
        data-menu-top={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : label)}
        onMouseEnter={() => { if (open && !isOpen) setOpen(label); }}
        className={`px-2.5 py-1 rounded-md text-sm font-semibold transition-colors ${isOpen ? 'bg-white/10 text-yellow-300' : 'text-gray-200 hover:bg-white/10'}`}
      >
        {label}
      </button>
      {isOpen && (
        <div role="menu" aria-label={label} data-menu-drop className="absolute left-0 top-full mt-1 z-40 min-w-60 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-2xl">
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ label, shortcut, icon, checked, disabled, onSelect }: { label: string; shortcut?: string; icon?: IconName; checked?: boolean; disabled?: boolean; onSelect: () => void }) {
  const { setOpen } = useContext(MenuCtx);
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      data-menu-item=""
      disabled={disabled}
      onClick={() => { onSelect(); setOpen(null); }}
      className={itemCls}
    >
      <span className="w-4 shrink-0 text-gray-400">{checked ? <Icon name="check" /> : icon && <Icon name={icon} />}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <kbd className="text-[11px] text-gray-500 font-sans">{shortcut}</kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-gray-800" />;
}

/** An item that opens a flyout beside the menu holding any content (a form, a list). The menu stays open while it is used. */
export function SubMenu({ label, icon, badge, disabled, children }: { label: string; icon?: IconName; badge?: number; disabled?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" role="menuitem" data-menu-item="" aria-haspopup="true" aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)} className={itemCls}>
        <span className="w-4 shrink-0 text-gray-400">{icon && <Icon name={icon} />}</span>
        <span className="flex-1">{label}{badge ? <span className="ml-1.5 text-xs text-gray-500">{badge}</span> : null}</span>
        <Icon name="chevronRight" className="text-gray-500" />
      </button>
      {open && (
        <div data-menu-flyout className="absolute left-full top-0 ml-1 z-50 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-3">
          {children}
        </div>
      )}
    </div>
  );
}
