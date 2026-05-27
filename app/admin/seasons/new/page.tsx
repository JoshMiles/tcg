import { createSeason } from '../../actions';

export default function NewSeasonPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New Season</h1>
      <form action={createSeason} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <SeasonFields />
        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg"
          >
            Create Season
          </button>
        </div>
      </form>
    </div>
  );
}

export function SeasonFields({ defaults }: { defaults?: Record<string, string | number | boolean> }) {
  return (
    <>
      <Field label="Season Name" name="name" required defaultValue={defaults?.name as string} />
      <Field
        label="Collection Name"
        name="collectionName"
        required
        defaultValue={defaults?.collectionName as string}
        help="No spaces — used as the KV key prefix (e.g. CheesyStarterDeck)"
      />
      <Field label="Cover Image URL" name="coverImageUrl" defaultValue={defaults?.coverImageUrl as string} />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Accent Color"
          name="accentColor"
          defaultValue={(defaults?.accentColor as string) ?? 'rgb(241,187,6)'}
          help="CSS color for glow/holo effects"
        />
        <Field
          label="Tear Border Color"
          name="tearBorderColor"
          defaultValue={(defaults?.tearBorderColor as string) ?? 'rgb(218,163,18)'}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field
          label="Holo Min Stars"
          name="holoMinStars"
          type="number"
          defaultValue={String(defaults?.holoMinStars ?? 5)}
          help="≥ this many stars = holo"
        />
        <Field
          label="Card Time (s)"
          name="cardTime"
          type="number"
          defaultValue={String(defaults?.cardTime ?? 3)}
          help="Seconds card is shown"
        />
        <Field
          label="Cooldown (s)"
          name="cooldownTime"
          type="number"
          defaultValue={String(defaults?.cooldownTime ?? 1)}
          help="Between queued draws"
        />
        <Field
          label="Max Concurrent"
          name="maxConcurrentPacks"
          type="number"
          defaultValue={String(defaults?.maxConcurrentPacks ?? 1)}
          help="Packs open at once"
        />
      </div>

      <Field
        label="Sound Volume (0–1)"
        name="soundVolume"
        type="number"
        defaultValue={String(defaults?.soundVolume ?? 1.0)}
        help="Widget pack-open sound volume"
      />

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="active"
          name="active"
          value="true"
          defaultChecked={defaults?.active as boolean}
          className="w-4 h-4 accent-yellow-400"
        />
        <label htmlFor="active" className="text-sm text-gray-300">
          Set as active season (deactivates all others)
        </label>
      </div>
    </>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue, help,
}: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string; help?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        step={type === 'number' ? 'any' : undefined}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
      />
      {help && <p className="text-xs text-gray-600 mt-1">{help}</p>}
    </div>
  );
}
