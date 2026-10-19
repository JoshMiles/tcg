import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { parseFaqAnswerBlocks, parseInlineTokens } from '@/lib/faq-core';

export function Section({ id, title, icon, children }: { id: string; title: string; icon: IconName; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
        <span aria-hidden className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center text-xl"><Icon name={icon} className="w-5 h-5 text-yellow-400" /></span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Q({ q, open, id, children }: { q: string; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details id={id} open={open} className="group rind rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-white">{q}</span>
        <span aria-hidden className="text-yellow-500 text-lg leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">{children}</div>
    </details>
  );
}

function renderFaqTokens(text: string): ReactNode {
  const tokens = parseInlineTokens(text);
  return tokens.map((t, idx) => {
    if (t.type === 'bold') {
      return <strong key={idx} className="text-white font-semibold">{t.content}</strong>;
    }
    if (t.type === 'link') {
      return (
        <a
          key={idx}
          href={t.href}
          target={t.href.startsWith('http') ? '_blank' : undefined}
          rel={t.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-yellow-400 hover:text-yellow-300 underline"
        >
          {t.content}
        </a>
      );
    }
    return t.content;
  });
}

export function FaqAnswer({ answer }: { answer: string }) {
  const blocks = parseFaqAnswerBlocks(answer);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1 marker:text-gray-600">
              {block.items.map((item, j) => (
                <li key={j}>{renderFaqTokens(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderFaqTokens(block.text)}</p>;
      })}
    </div>
  );
}

export function CustomQ({ q, answer, id }: { q: string; answer: string; id?: string }) {
  return (
    <Q q={q} id={id}>
      <FaqAnswer answer={answer} />
    </Q>
  );
}

