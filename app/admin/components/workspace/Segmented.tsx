'use client';

/** A row of mutually exclusive choices. */
export function Segmented({
  label, value, onChange, options, disabled = [], wrap = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; dot?: boolean }[];
  disabled?: string[];
  wrap?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-1 ${wrap ? 'flex-wrap' : ''}`}>
      <span className="text-xs text-gray-500 mr-1">{label}</span>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          disabled={disabled.includes(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border disabled:opacity-35 ${value === o.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
        >
          {o.label}{o.dot && <span className="ml-1 text-yellow-400">●</span>}
        </button>
      ))}
    </div>
  );
}
