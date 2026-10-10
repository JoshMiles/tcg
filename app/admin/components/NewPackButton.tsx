import Link from 'next/link';

export function NewPackButton() {
  return (
    <Link href="/admin/packs/new" className="px-4 py-2 tcg-btn rounded-xl text-sm transition-colors">
      + New Pack
    </Link>
  );
}
