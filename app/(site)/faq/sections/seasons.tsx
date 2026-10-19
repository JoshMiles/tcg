import type { ReactNode } from 'react';
import { Section, Q } from '../parts';

export function SeasonsSection({ title = 'Seasons', extra }: { title?: string; extra?: ReactNode } = {}) {
  return (
    <Section id="seasons" title={title} icon="calendar">
      <Q q="What is a season?" open>
        The game runs in seasons. Each season has its own set of cards and packs, its own collections and its own leaderboard, so everyone starts fresh and the rules (like version odds and upgrade costs) can change between them.
        Your collection page shows the current season. Cards you collected in an earlier season stay with that season.
      </Q>
      <Q q="Can I see old seasons?">
        Yes. The leaderboard, season stats and card dex all have season buttons at the top so you can look back.
      </Q>
      {extra}
    </Section>
  );
}
