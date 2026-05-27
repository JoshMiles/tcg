import type { Pack } from '@/lib/types';
import { ImageUploadField } from './image-upload';

export function PackFields({ defaults }: { defaults?: Partial<Pack> }) {
  return (
    <>
      <Field label="Pack Name" name="name" required defaultValue={defaults?.name} />
      <ImageUploadField name="coverImageUrl" defaultValue={defaults?.coverImageUrl} />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Accent Color"
          name="accentColor"
          defaultValue={defaults?.accentColor ?? 'rgb(241,187,6)'}
          help="CSS color for glow/holo effects"
        />
        <Field
          label="Tear Border Color"
          name="tearBorderColor"
          defaultValue={defaults?.tearBorderColor ?? 'rgb(218,163,18)'}
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
          label="Weight"
          name="weight"
          type="number"
          defaultValue={String(defaults?.weight ?? 1)}
          help="Relative draw probability"
        />
      </div>

      <Field
        label="Sound Volume (0–1)"
        name="soundVolume"
        type="number"
        defaultValue={String(defaults?.soundVolume ?? 1.0)}
        help="Pack-open sound volume"
      />

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="pack-active"
          name="active"
          value="true"
          defaultChecked={defaults?.active ?? true}
          className="w-4 h-4 accent-yellow-400"
        />
        <label htmlFor="pack-active" className="text-sm text-gray-300">
          Pack is active (included in draws)
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
