'use client';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import { useId, useState } from 'react';
import type { WebhookSettings, OutgoingWebhookConfig, WebhookField } from '@/lib/webhooks';
import { saveOutgoingWebhook, regenerateWebhookSecret } from '../actions';
import { ConfirmButton } from '../components/ConfirmButton';

// ── Outgoing event definitions ────────────────────────────

const EVENTS = [
  {
    key:         'cardPulled' as const,
    label:       'Card Pulled',
    description: 'Fires when a viewer pulls a card from the overlay',
    variables:   ['{username}', '{cardName}', '{cardNumber}', '{stars}', '{packName}'],
  },
  {
    key:         'collectionShown' as const,
    label:       'Collection Shown',
    description: "Fires when a viewer's collection is displayed on the overlay",
    variables:   ['{username}'],
  },
];

// ── Root component ────────────────────────────────────────

export function WebhookConfig({ settings, base }: { settings: WebhookSettings; base: string }) {
  const [tab, setTab] = useState<'cardPulled' | 'collectionShown'>('cardPulled');
  const event = EVENTS.find(e => e.key === tab)!;

  return (
    <div className="space-y-8">

      {/* ── Incoming ── */}
      <section className="tcg-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white">Incoming Webhooks</h2>
          <p className="text-xs text-gray-500 mt-0.5">MixItUp calls these URLs to trigger overlay actions</p>
        </div>
        <div className="px-6 py-5 space-y-6">

          {/* Secret */}
          <SecretRow secret={settings.incomingSecret} />

          {/* Pull URL */}
          <IncomingUrl
            label="Pull Card"
            description="Triggers a card draw for the given viewer"
            url={`${base}/api/webhooks/pull`}
            secret={settings.incomingSecret}
          />

          {/* Collection URL */}
          <IncomingUrl
            label="Show Collection"
            description="Displays a viewer's card collection on the overlay"
            url={`${base}/api/webhooks/collection`}
            secret={settings.incomingSecret}
          />

          {/* Grant Card URL */}
          <IncomingUrl
            label="Grant Card"
            description="Adds a specific card number to a viewer's collection in the active season"
            url={`${base}/api/webhooks/grant-card`}
            secret={settings.incomingSecret}
            extraFields={{ cardNumber: '{{CardNumber}}' }}
          />
        </div>
      </section>

      {/* ── Outgoing ── */}
      <section className="tcg-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white">Outgoing Webhooks</h2>
          <p className="text-xs text-gray-500 mt-0.5">TCG calls these URLs when events happen on stream</p>
        </div>

        {/* Event tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {EVENTS.map(e => (
            <button
              key={e.key}
              onClick={() => setTab(e.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === e.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          <p className="text-xs text-gray-500 mb-5">{event.description}</p>
          <OutgoingEventForm
            key={event.key + JSON.stringify(settings.outgoing[event.key])}
            eventKey={event.key}
            config={settings.outgoing[event.key]}
            variables={event.variables}
          />
        </div>
      </section>
    </div>
  );
}

// ── Incoming secret row ───────────────────────────────────

function SecretRow({ secret }: { secret: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-2">Webhook Secret</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-yellow-300 truncate">
          {visible ? secret : '•'.repeat(32)}
        </code>
        <button
          onClick={() => setVisible(v => !v)}
          className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors shrink-0"
        >
          {visible ? 'Hide' : 'Reveal'}
        </button>
        <button
          onClick={copy}
          className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors shrink-0"
        >
          {copied ? <Icon name="check" /> : 'Copy'}
        </button>
        <form action={regenerateWebhookSecret}>
          <ConfirmButton
                title="Regenerate secret?"
                confirmLabel="Regenerate"
                message={<>Anything using the current secret (MixItUp, bots, scripts) will stop working until you update it. This can&apos;t be undone.</>}
                className="px-3 py-2 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors shrink-0"
              >
                Regenerate
              </ConfirmButton>
        </form>
      </div>
      <p className="text-xs text-gray-600 mt-1.5">Include as <code className="text-gray-500">secret</code> in the request body</p>
    </div>
  );
}

// ── Incoming URL row ──────────────────────────────────────

function IncomingUrl({ label, description, url, secret, extraFields }: {
  label: string; description: string; url: string; secret: string;
  extraFields?: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);
  const body = JSON.stringify({ username: '{{UserName}}', ...extraFields, secret });

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-xs text-yellow-300 break-all select-all">
          {url}
        </code>
        <button
          onClick={copy}
          className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors shrink-0"
        >
          {copied ? <Icon name="check" /> : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-gray-600">
        Body: <code className="text-gray-500 break-all">{body}</code>
      </p>
    </div>
  );
}

// ── Outgoing event form ───────────────────────────────────

function OutgoingEventForm({ eventKey, config, variables }: {
  eventKey: 'cardPulled' | 'collectionShown';
  config: OutgoingWebhookConfig;
  variables: string[];
}) {
  const urlId = useId();
  const [url, setUrl] = useState(config.url);
  const [enabled, setEnabled] = useState(config.enabled);
  const [fields, setFields] = useState<WebhookField[]>(config.fields);

  const saveAction = saveOutgoingWebhook.bind(null, eventKey);

  function addField() {
    setFields(f => [...f, { key: '', value: '' }]);
  }

  function updateField(i: number, prop: 'key' | 'value', val: string) {
    setFields(f => f.map((field, idx) => idx === i ? { ...field, [prop]: val } : field));
  }

  function removeField(i: number) {
    setFields(f => f.filter((_, idx) => idx !== i));
  }

  return (
    <form action={saveAction} className="space-y-5">
      {/* Hidden inputs carrying state */}
      <input type="hidden" name="enabled" value={String(enabled)} />
      <input type="hidden" name="fieldsJson" value={JSON.stringify(fields)} />

      {/* URL */}
      <div>
        <label htmlFor={urlId} className="block text-sm text-gray-400 mb-1.5">Webhook URL</label>
        <input
          id={urlId}
          type="text"
          name="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://desktop.api.mixitupapp.com/api/webhook/..."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
        />
      </div>

      {/* Enabled toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(e => !e)}
        className="flex items-center gap-3 group"
      >
        <div className={`w-10 h-6 rounded-full relative transition-colors ${enabled ? 'bg-yellow-500' : 'bg-gray-700'}`}>
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </button>

      {/* Payload fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">Payload Fields</label>
          <span className="text-xs text-gray-600">
            Variables: {variables.map(v => (
              <code key={v} className="text-gray-500 mr-1">{v}</code>
            ))}
          </span>
        </div>

        {fields.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs text-gray-600 px-1">
              <span>Key</span><span>Value</span><span />
            </div>
            {fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center">
                <input
                  type="text"
                  value={f.key}
                  onChange={e => updateField(i, 'key', e.target.value)}
                  placeholder="key_name"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
                />
                <input
                  type="text"
                  value={f.value}
                  onChange={e => updateField(i, 'value', e.target.value)}
                  placeholder="{username}"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addField}
          className="text-sm text-yellow-500 hover:text-yellow-400 transition-colors"
        >
          + Add Field
        </button>
      </div>

      <div className="pt-1">
        <PendingButton
          type="submit"
          className="px-5 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
        >
          Save Changes
        </PendingButton>
      </div>
    </form>
  );
}
