/** Pulls per day as bars (server-rendered SVG, no client code). `labels` and `values` line up; the tallest bar sets the scale. */
export function PullsChart({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const w = 100 / Math.max(1, values.length);
  const best = values.indexOf(Math.max(...values));
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-40" role="img" aria-label={`Pulls per day, ${total} in total${total > 0 ? `, busiest on ${labels[best]} with ${values[best]}` : ''}`}>
        {values.map((v, i) => {
          const h = (v / max) * 36;
          return <rect key={i} x={i * w + w * 0.12} y={40 - h - 2} width={w * 0.76} height={Math.max(v > 0 ? 0.6 : 0, h)} rx="0.6" fill={i === best && v > 0 ? '#facc15' : '#a16207'}><title>{`${labels[i]}: ${v}`}</title></rect>;
        })}
        <line x1="0" y1="38" x2="100" y2="38" stroke="#374151" strokeWidth="0.3" />
      </svg>
      <div className="flex justify-between text-[11px] text-gray-500"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>
    </div>
  );
}
