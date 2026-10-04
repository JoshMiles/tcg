import { createSeason } from '../../actions';
import { SeasonFields } from '../../components/SeasonFields';

export default function NewSeasonPage() {
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">New Season</h1>
      <form action={createSeason} className="tcg-panel rounded-xl p-6 space-y-4">
        <SeasonFields />
        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 tcg-btn rounded-lg"
          >
            Create Season
          </button>
        </div>
      </form>
    </div>
  );
}
