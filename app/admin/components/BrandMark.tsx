// Tilted holo trading card with an energy-style orb. Pure SVG, no assets.
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="bm-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5f6d" />
          <stop offset="0.35" stopColor="#ffe14d" />
          <stop offset="0.65" stopColor="#6bffb0" />
          <stop offset="1" stopColor="#6bb6ff" />
        </linearGradient>
      </defs>
      <g transform="rotate(-10 24 24)">
        <rect x="9" y="4" width="30" height="40" rx="5" fill="#ffcb05" />
        <rect x="12" y="7" width="24" height="34" rx="3" fill="#141b36" />
        <rect x="14" y="9" width="20" height="17" rx="2" fill="url(#bm-foil)" opacity="0.9" />
        <circle cx="24" cy="17.5" r="5" fill="#ffcb05" stroke="#141b36" strokeWidth="2" />
        <rect x="15" y="30" width="18" height="2.5" rx="1.25" fill="#434f7b" />
        <rect x="15" y="35" width="11" height="2.5" rx="1.25" fill="#434f7b" />
      </g>
    </svg>
  );
}
