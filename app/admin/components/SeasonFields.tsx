import { DateTimeField } from './DateTimeField';

export function SeasonFields({ defaults }: { defaults?: { name?: string; collectionName?: string; maxConcurrentPacks?: number; active?: boolean; canActivate?: boolean; startsAt?: number; endsAt?: number; autoStart?: boolean } }) {
  return (
    <>
      <Field label="Season Name" name="name" required defaultValue={defaults?.name} />
      <Field
        label="Collection Name"
        name="collectionName"
        required
        defaultValue={defaults?.collectionName}
        help="No spaces — used as the KV key prefix (e.g. CheesyStarterDeck)"
      />
      <Field
        label="Max Concurrent Packs"
        name="maxConcurrentPacks"
        type="number"
        defaultValue={String(defaults?.maxConcurrentPacks ?? 1)}
        help="How many pack openings are shown on screen at once"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeField label="Starts (optional)" name="startsAt" defaultValue={defaults?.startsAt} help="Shown on the Seasons page. With the switch below it also turns the season on by itself." />
        <DateTimeField label="Ends (optional)" name="endsAt" defaultValue={defaults?.endsAt} help="At this time an active season is wrapped up: final standings, awards, trading closed." />
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="autoStart" name="autoStart" value="true" defaultChecked={defaults?.autoStart} className="w-4 h-4 accent-yellow-400" />
        <label htmlFor="autoStart" className="text-sm text-gray-300">Switch this season on automatically at the start time</label>
      </div>
      {defaults?.canActivate === false ? (
        <p className="text-xs text-gray-500">This season is a draft, so it can&apos;t be activated yet.</p>
      ) : (
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="active"
          name="active"
          value="true"
          defaultChecked={defaults?.active}
          className="w-4 h-4 accent-yellow-400"
        />
        <label htmlFor="active" className="text-sm text-gray-300">
          Set as active season (deactivates all others)
        </label>
      </div>
      )}
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
