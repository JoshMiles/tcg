import type { Pack } from '@/lib/types';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS } from '@/lib/variants';
import { ImageUploadField } from './image-upload';
import { VariantChecks } from './VariantSwitches';

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
          type="number" min={1} max={5} step={1}
          defaultValue={String(defaults?.holoMinStars ?? 5)}
          help="≥ this many stars = holo"
        />
        <Field
          label="Card Time (s)"
          name="cardTime"
          type="number" min={1}
          defaultValue={String(defaults?.cardTime ?? 3)}
          help="Seconds card is shown"
        />
        <Field
          label="Cooldown (s)"
          name="cooldownTime"
          type="number" min={0}
          defaultValue={String(defaults?.cooldownTime ?? 1)}
          help="Between queued draws"
        />
        <Field
          label="Weight"
          name="weight"
          type="number" min={0.01}
          defaultValue={String(defaults?.weight ?? 1)}
          help="Relative draw probability"
        />
      </div>

      <Field
        label="Sound Volume (0–1)"
        name="soundVolume"
        type="number" min={0} max={1}
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

      <div className="border-t border-gray-800 pt-4 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="pack-upgrades"
            name="upgradesEnabled"
            defaultChecked={defaults?.upgradesEnabled ?? false}
            className="w-4 h-4 accent-yellow-400"
          />
          <label htmlFor="pack-upgrades" className="text-sm text-gray-300">
            Enable variants &amp; upgrades
          </label>
        </div>
        <p className="text-xs text-gray-600 -mt-2">
          Pulls roll Regular / Reverse Holo / Full Art / Shiny Full Art, and viewers can upgrade duplicates.
          Leave off for packs that should stay single-version. Individual cards can opt out too.
        </p>

        <div>
          <p className="text-sm text-gray-400 mb-2">Variants in this pack</p>
          <VariantChecks disabled={defaults?.disabledVariants} />
          <p className="text-xs text-gray-600 mt-1">
            An unticked variant is never rolled, and upgrades skip it (skipping costs the combined price, so it is no shortcut).
            You can also switch variants off per card.
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">Variant weights</p>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Regular" name="weight_regular" type="number" min={0} defaultValue={String(defaults?.variantWeights?.regular ?? DEFAULT_VARIANT_WEIGHTS.regular)} />
            <Field label="Reverse" name="weight_reverse" type="number" min={0} defaultValue={String(defaults?.variantWeights?.reverse ?? DEFAULT_VARIANT_WEIGHTS.reverse)} />
            <Field label="Full Art" name="weight_full" type="number" min={0} defaultValue={String(defaults?.variantWeights?.full ?? DEFAULT_VARIANT_WEIGHTS.full)} />
            <Field label="Shiny" name="weight_shiny" type="number" min={0} defaultValue={String(defaults?.variantWeights?.shiny ?? DEFAULT_VARIANT_WEIGHTS.shiny)} />
          </div>
          <p className="text-xs text-gray-600 mt-1">Relative odds, rolled after the card. 100 / 25 / 5 / 1 ≈ 77% / 19% / 4% / 1%.</p>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">Upgrade cost (duplicates consumed)</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Regular → Reverse" name="cost_reverse" type="number" min={1} step={1} defaultValue={String(defaults?.upgradeCosts?.reverse ?? DEFAULT_UPGRADE_COSTS.reverse)} />
            <Field label="Reverse → Full Art" name="cost_full" type="number" min={1} step={1} defaultValue={String(defaults?.upgradeCosts?.full ?? DEFAULT_UPGRADE_COSTS.full)} />
            <Field label="Full Art → Shiny" name="cost_shiny" type="number" min={1} step={1} defaultValue={String(defaults?.upgradeCosts?.shiny ?? DEFAULT_UPGRADE_COSTS.shiny)} />
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue, help, min, max, step,
}: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string; help?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label htmlFor={`pack-${name}`} className="block text-sm text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        id={`pack-${name}`}
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={type === 'number' ? (step ?? 'any') : undefined}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-yellow-500"
      />
      {help && <p className="text-xs text-gray-600 mt-1">{help}</p>}
    </div>
  );
}
