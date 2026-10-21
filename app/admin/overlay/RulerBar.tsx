'use client';

// One ruler along the canvas, in design px. `origin` is where design 0 sits along the bar (screen px, from the bar's start) and `fit`
// the screen px per design px, so the ticks follow zoom and pan. Pressing on it starts a guide (handled by the parent).
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

export function RulerBar({ axis, origin, fit, len, onPointerDown }: {
  axis: 'x' | 'y';
  origin: number;
  fit: number;
  len: number;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const major = STEPS.find(s => s * fit >= 60) ?? 5000;
  const minor = major >= 10 ? major / 5 : major >= 5 ? 1 : 0;
  const step = minor || major;
  const first = Math.ceil(-origin / fit / step) * step;
  const last = (len - origin) / fit;
  const ticks: number[] = [];
  for (let v = first; v <= last && ticks.length < 400; v += step) ticks.push(v);
  const horiz = axis === 'x';
  return (
    <div
      data-ruler={axis}
      onPointerDown={onPointerDown}
      className={`bg-gray-900 text-gray-500 select-none touch-none overflow-hidden ${horiz ? 'h-5 cursor-row-resize' : 'w-5 cursor-col-resize'}`}
      title={horiz ? 'Drag down for a horizontal guide' : 'Drag right for a vertical guide'}
    >
      <svg width={horiz ? len : 20} height={horiz ? 20 : len} className="block pointer-events-none">
        {ticks.map(v => {
          const p = origin + v * fit;
          const isMajor = v % major === 0;
          const a = isMajor ? 8 : 15;
          return (
            <g key={v}>
              <line x1={horiz ? p : a} y1={horiz ? a : p} x2={horiz ? p : 20} y2={horiz ? 20 : p} stroke="currentColor" strokeWidth={1} />
              {isMajor && (
                <text
                  x={horiz ? p + 2 : 6}
                  y={horiz ? 8 : p + 2}
                  fontSize={9}
                  fill="currentColor"
                  transform={horiz ? undefined : `rotate(-90 6 ${p + 2})`}
                  textAnchor={horiz ? 'start' : 'end'}
                >
                  {v}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
