import Link from 'next/link';
import { EmptyState } from './components/ui';

export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-xl pt-8">
      <EmptyState asH1 icon="search" title="That page doesn't exist" action={<Link href="/admin" className="btn btn-primary px-4 py-2 text-sm rounded-xl">Back to the dashboard</Link>}>
        It may have been deleted or renamed. Press Ctrl/⌘ + K to search for what you were looking for.
      </EmptyState>
    </div>
  );
}
