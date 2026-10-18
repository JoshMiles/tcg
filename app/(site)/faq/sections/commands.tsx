import { FAQ_LINES } from '@/lib/commands-core';
import { CHANNEL_NAME } from '@/lib/site';
import type { ChatCommand } from '@/lib/commands-core';
import { Section, Q } from '../parts';

export function CommandsSection({ chatCommands }: { chatCommands: ChatCommand[] }) {
  return (
    <Section id="commands" title="Chat commands" icon="chat">
      <Q q="Which commands can I type in chat?">
        {chatCommands.length === 0 ? <>There are no chat commands right now.</> : (
          <>
            <p>These work in {CHANNEL_NAME}&rsquo;s chat while the stream is on:</p>
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
              {chatCommands.map(c => (
                <li key={c.id}><strong className="text-white">!{c.name}</strong>{c.aliases.length > 0 && <> (or {c.aliases.map(a => `!${a}`).join(', ')})</>} {FAQ_LINES[c.action]}</li>
              ))}
            </ul>
          </>
        )}
      </Q>
    </Section>
  );
}
