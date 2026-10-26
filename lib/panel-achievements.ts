import type { AchievementsView } from './achievements-store';

// The Twitch panel's achievements summary: "N of M" and the latest few earned, from the same view the website's profile shows
// (`syncAchievements`: custom wording applied, disabled goals gone). The panel has no icon set, so only names go out.

export const PANEL_ACHIEVEMENTS_LATEST = 4;

export interface PanelAchievements {
  earned: number;
  total: number;
  /** Newest first: id, title, what it asks (for a tooltip) and when it was first seen earned (epoch ms). */
  latest: { id: string; name: string; detail: string; at: number }[];
}

export function panelAchievements(view: AchievementsView): PanelAchievements {
  const latest = [...view.earned].sort((a, b) => b.earnedAt - a.earnedAt).slice(0, PANEL_ACHIEVEMENTS_LATEST)
    .map(a => ({ id: a.id, name: a.title, detail: a.detail, at: a.earnedAt }));
  return { earned: view.earned.length, total: Math.max(view.total, view.earned.length), latest };
}
