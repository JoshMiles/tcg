import type { ReactNode } from 'react';
import { DEFAULT_PROFILE_LAYOUT, PROFILE_WIDGET_TYPES, type ProfileWidgetType } from '@/lib/profile-widgets';
import type { ProfileBase } from '@/lib/profile-data';
import type { Copy } from '@/lib/serials-core';
import { ProfileGrid } from './ProfileGrid';
import { loadWidgetData, renderProfileWidget } from './widgets';

/** The customisable part of a profile: the owner's widgets in their order and widths. */
export async function OverviewTab({ b, copies, isOwner, viewer, mine }: { b: ProfileBase; copies: Copy[]; isOwner: boolean; viewer?: string; mine?: Record<number, number> }) {
  const layout = b.settings.profileLayout ?? DEFAULT_PROFILE_LAYOUT;
  // The owner can add any widget while editing, so they get every one rendered; a visitor only needs what is on the page.
  const types: ProfileWidgetType[] = isOwner ? [...PROFILE_WIDGET_TYPES] : layout.map(w => w.type);
  const data = await loadWidgetData(types, b);
  const ctx = { b, copies, isOwner, viewer, mine, ...data };
  const rendered = await Promise.all(types.map(async t => [t, await renderProfileWidget(t, ctx)] as const));
  const nodes: Partial<Record<ProfileWidgetType, ReactNode>> = Object.fromEntries(rendered);
  return <ProfileGrid layout={layout} nodes={nodes} isOwner={isOwner} />;
}
