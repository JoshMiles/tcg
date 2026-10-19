import Link from 'next/link';

export function NewPackButton() {
  return (
    <Link href="/admin/packs/new" className="px-4 py-2 btn btn-primary rounded-xl text-sm transition-colors">
      + New Pack
    </Link>
  );
}
