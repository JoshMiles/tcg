import type { ReactNode } from 'react';
import { FAQ_LINES } from '@/lib/commands-core';
import { CHANNEL_NAME } from '@/lib/site';
import type { ChatCommand } from '@/lib/commands-core';
import { Section, Q } from '../parts';

export function CommandsSection({ chatCommands, title = 'Chat commands', extra }: { chatCommands: ChatCommand[]; title?: string; extra?: ReactNode }) {
  return (
    <Section id="commands" title={title} icon="chat">
      <Q q="Which commands can I type in chat?">
        <p>These work in {CHANNEL_NAME}&rsquo;s chat while the stream is on:</p>
        <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
          {chatCommands.map(c => (
            <li key={c.id}><strong className="text-white">!{c.name}</strong>{c.aliases.length > 0 && <> (or {c.aliases.map(a => `!${a}`).join(', ')})</>} {FAQ_LINES[c.action]}</li>
          ))}
          <li><strong className="text-white">!pack</strong> asks the stream to open a pack for you. It is set up in Mix It Up, not in the command builder.</li>
        </ul>
      </Q>
      {extra}
    </Section>
  );
}
