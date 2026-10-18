import { CHANNEL_NAME } from '@/lib/site';
import { Section, Q } from '../parts';

export function ExtensionSection() {
  return (
    <Section id="extension" title="Twitch extension" icon="tv">
      <Q q="How do I use the extension?" open>
        Open {CHANNEL_NAME}&rsquo;s stream on Twitch and look under the video for the card collection panel (on mobile it&rsquo;s in the extensions tab, and on desktop it can also appear on the video). Press
        <strong className="text-white"> Login with Twitch</strong> and allow Twitch&rsquo;s &ldquo;share your identity&rdquo; prompt. Your collection appears, with the same cards as on the website.
      </Q>
      <Q q="The extension doesn&rsquo;t show my cards">
        Make sure you pressed Login and accepted Twitch&rsquo;s prompt. Use the refresh button in the panel after a pull. If it still looks wrong, log out and back in.
      </Q>
    </Section>
  );
}
