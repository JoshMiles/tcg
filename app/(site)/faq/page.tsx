import type { Metadata } from 'next';
import { getFaqStore } from '@/lib/faq';
import { FAQ_BUILTINS } from '@/lib/faq-builtins';
import { fillFaqPlaceholders } from '@/lib/faq-core';
import { OpenOnHash } from '@/app/components/site/OpenOnHash';
import { Section, Q, FaqAnswer } from './parts';
import { FaqBlock } from './blocks';
import { getFaqContext } from './context';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'How The Cheesy TCG works: packs, variants, upgrades, points and the leaderboard.',
};

export default async function FaqPage() {
  const [faqStore, { values, flags, blockData }] = await Promise.all([getFaqStore(), getFaqContext()]);
  const visibleSections = faqStore.sections.filter(s => !s.hidden);
  const answer = (text: string) => <FaqAnswer answer={text} values={values} renderBlock={name => <FaqBlock name={name} data={blockData} />} />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <OpenOnHash />
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Frequently asked questions</h1>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          Everything about collecting cards on The Cheesy TCG: how to get them, what the versions mean, how upgrades work and how your points are worked out.
        </p>
        <nav aria-label="FAQ sections" className="flex flex-wrap gap-2 pt-1">
          {visibleSections.map(s => (
            <a key={s.id} href={`#${s.id}`} className="px-3 py-1 rounded-full text-xs font-semibold border border-gray-700 text-gray-300 hover:text-yellow-300 hover:border-yellow-500/50 transition-colors">
              {s.title}
            </a>
          ))}
        </nav>
      </header>

      {visibleSections.map(s => (
        <Section key={s.id} id={s.id} title={s.title} icon={s.icon}>
          {FAQ_BUILTINS.filter(b => b.sectionId === s.id && (!b.when || flags[b.when]) && !faqStore.overrides[b.id]?.hidden).map(b => {
            const o = faqStore.overrides[b.id];
            return (
              <Q key={b.id} id={b.id} q={fillFaqPlaceholders(o?.question ?? b.question, values)} open={b.open}>
                {b.anchors?.map(a => <span key={a} id={a} />)}
                {answer(o?.answer ?? b.answer)}
              </Q>
            );
          })}
          {faqStore.questions.filter(q => q.sectionId === s.id && q.enabled !== false).map(q => (
            <Q key={q.id} id={q.id} q={fillFaqPlaceholders(q.question, values)}>
              {answer(q.answer)}
            </Q>
          ))}
        </Section>
      ))}
    </div>
  );
}
