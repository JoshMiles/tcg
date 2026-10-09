import { getBuildInfo, formatVersion, describeBuild } from '@/lib/version';

/** Small build stamp for the sidebar: "v1.1.0 · 75fdb70", linking to the commit when known. */
export function BuildBadge() {
  const build = getBuildInfo();
  const label = formatVersion(build);
  const className = 'font-mono text-[11px] text-gray-600 hover:text-yellow-300 transition-colors';

  return (
    <div className="px-3 pt-2 pb-1 flex items-center gap-2">
      {build.commitUrl ? (
        <a href={build.commitUrl} target="_blank" rel="noreferrer" title={describeBuild(build)} className={className}>
          {label}
        </a>
      ) : (
        <span title={describeBuild(build)} className={className}>{label}</span>
      )}
      {build.env !== 'production' && (
        <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-full px-1.5 py-px">
          {build.env === 'development' ? 'dev' : build.env}
        </span>
      )}
    </div>
  );
}
