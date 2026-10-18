import { CardTile, SerialChip } from 'cheesy-tcg';

const ART = 'https://cheesytcg.app/assets/cards';

export const Single = () => (
  <div className="bg-gray-950 p-5">
    <CardTile imageUrl={`${ART}/Cheesygidds.webp`} alt="Cheesygidds" className="relative w-44 aspect-[2/3] rounded-xl overflow-hidden shadow-card" />
  </div>
);

export const WithOverlays = () => (
  <div className="bg-gray-950 p-5 flex gap-4">
    {(['Angrygidds', 'Comedygidds', 'Bottomgidds'] as const).map((n, i) => (
      <CardTile key={n} imageUrl={`${ART}/${n}.webp`} alt={n} className="relative w-36 aspect-[2/3] rounded-xl overflow-hidden shadow-card">
        <div className="absolute top-1.5 right-1.5"><SerialChip n={i + 1} bonus={i === 1 ? 2 : undefined} /></div>
        {i === 2 && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-gray-950/80 px-2 py-0.5 text-[11px] font-bold text-white">×3</span>}
      </CardTile>
    ))}
  </div>
);
