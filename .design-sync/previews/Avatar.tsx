import { Avatar } from 'cheesy-tcg';

export const Initials = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-3">
    <Avatar name="pixelpanda" />
    <Avatar name="moonlitmaple" className="w-10 h-10 text-sm" />
    <Avatar name="Tobyplays" className="w-14 h-14 text-lg" />
  </div>
);

export const WithPicture = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-3">
    <Avatar src="https://cheesytcg.app/apple-touch-icon.png" name="Cheesygidds" className="w-12 h-12 text-base" />
    <div>
      <div className="font-bold text-white">Cheesygidds</div>
      <div className="text-xs text-gray-400">142 prints collected</div>
    </div>
  </div>
);
