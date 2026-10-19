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
        help="No spaces, and no other season may use it. Viewers' cards are stored under this name, so changing it once the season has cards points it at an empty collection (the old cards stay under the old name)."
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
        <input type="checkbox" id="autoStart" name="autoStart" value="true" defaultChecked={defaults?.autoStart} className="toggle toggle-sm toggle-primary" />
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
          className="toggle toggle-sm toggle-primary"
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
    <fieldset className="fieldset">
      <legend className="fieldset-legend">
        <label htmlFor={`season-${name}`}>{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
      </legend>
      <input
        id={`season-${name}`}
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        min={type === 'number' ? 1 : undefined}
        step={type === 'number' ? 1 : undefined}
        className="input w-full"
      />
      {help && <p className="fieldset-label">{help}</p>}
    </fieldset>
  );
}
