import { Icon } from 'cheesy-tcg';

const SET = ['cheese', 'trophy', 'cards', 'trade', 'sparkles', 'star', 'gift', 'bell', 'search', 'settings', 'shield', 'heart'] as const;

export const Gallery = () => (
  <div className="bg-gray-950 p-5 grid grid-cols-6 gap-4 text-gray-200">
    {SET.map((n) => (
      <div key={n} className="flex flex-col items-center gap-1.5">
        <Icon name={n} className="w-6 h-6" />
        <span className="text-[11px] text-gray-500">{n}</span>
      </div>
    ))}
  </div>
);

export const InlineWithText = () => (
  <div className="bg-gray-950 p-5 space-y-2 text-gray-200">
    <p className="text-sm"><Icon name="trophy" className="text-yellow-400" /> Top of the leaderboard this week</p>
    <p className="text-lg font-bold"><Icon name="cheese" className="text-yellow-500" /> 1,240 points</p>
  </div>
);

export const Coloured = () => (
  <div className="bg-gray-950 p-5 flex gap-4 text-2xl">
    <Icon name="checkCircle" className="text-green-400" title="Done" />
    <Icon name="warning" className="text-amber-300" title="Warning" />
    <Icon name="alert" className="text-red-400" title="Error" />
    <Icon name="info" className="text-poke-blue-light" title="Info" />
  </div>
);
