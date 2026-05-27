import Link from 'next/link';
import { createPack } from '../../actions';
import { PackFields } from '../../components/PackFields';

export default function NewPackPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Pack</h1>
        <Link href="/admin/packs" className="text-sm text-gray-500 hover:text-white transition-colors">
          ← Packs
        </Link>
      </div>

      <form action={createPack} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <PackFields />
        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg transition-colors"
          >
            Create Pack
          </button>
        </div>
      </form>
    </div>
  );
}
