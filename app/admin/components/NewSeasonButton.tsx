import Link from 'next/link';

export function NewSeasonButton() {
  return (
    <Link href="/admin/seasons/new" className="px-4 py-2 btn btn-primary rounded-xl text-sm transition-colors">
      + New Season
    </Link>
  );
}
