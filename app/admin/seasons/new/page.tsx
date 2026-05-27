import { createSeason } from '../../actions';
import { SeasonFields } from '../../components/SeasonFields';

export default function NewSeasonPage() {
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">New Season</h1>
      <form action={createSeason} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <SeasonFields />
        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg"
          >
            Create Season
          </button>
        </div>
      </form>
    </div>
  );
}
