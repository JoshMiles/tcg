import { getWebhookSettings } from '@/lib/webhooks';
import { WebhookConfig } from './WebhookConfig';

export const dynamic = 'force-dynamic';

const BASE = 'https://tcg-khaki.vercel.app';

export default async function WebhooksPage() {
  const settings = await getWebhookSettings();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <p className="text-sm text-gray-500 mt-0.5">MixItUp integration — incoming triggers and outgoing events</p>
      </div>

      <WebhookConfig settings={settings} base={BASE} />
    </div>
  );
}
