import { getWebhookSettings } from '@/lib/webhooks';
import { getDiscordSettings } from '@/lib/discord';
import { WebhookConfig } from './WebhookConfig';
import { DiscordConfig } from './DiscordConfig';

export const dynamic = 'force-dynamic';

const BASE = 'https://tcg-khaki.vercel.app';

export default async function WebhooksPage() {
  const [settings, discord] = await Promise.all([getWebhookSettings(), getDiscordSettings()]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <p className="text-sm text-gray-500 mt-0.5">Discord feed, MixItUp integration — incoming triggers and outgoing events</p>
      </div>

      <DiscordConfig settings={discord} />

      <WebhookConfig settings={settings} base={BASE} />
    </div>
  );
}
