import { redirect } from 'next/navigation';
import { getPack, getPackCards, listAllPacks } from '@/lib/kv';
import { getCardBack } from '@/lib/card-back-store';
import { PackFlow } from './PackFlow';
import type { PackInput } from '../../draft-actions';

export const metadata = { title: 'New pack · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function NewPackPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;

  // Resume a saved draft: ?draft=<id>
  if (draft) {
    const [pack, cards, cardBack, allPacks] = await Promise.all([getPack(draft), getPackCards(draft), getCardBack(draft), listAllPacks()]);
    if (!pack) redirect('/admin/packs/new');
    if (pack.status !== 'draft') redirect(`/admin/packs/${pack.id}`);
    const input: PackInput = {
      name: pack.name,
      coverImageUrl: pack.coverImageUrl,
      active: pack.active,
      weight: pack.weight,
      accentColor: pack.accentColor,
      tearBorderColor: pack.tearBorderColor,
      holoMinStars: pack.holoMinStars,
      cardTime: pack.cardTime,
      cooldownTime: pack.cooldownTime,
      soundVolume: pack.soundVolume,
      upgradesEnabled: pack.upgradesEnabled,
      variantWeights: pack.variantWeights,
      upgradeCosts: pack.upgradeCosts,
      disabledVariants: pack.disabledVariants ?? [],
    };
    return (
      // No `key`: the client wizard creates its draft mid-session and rewrites the URL to ?draft=..., and a
      // changing key would remount it (losing the current step).
      <PackFlow
        cardBack={{ initial: cardBack, others: allPacks.filter(p => p.id !== draft && p.status !== 'draft').map(p => ({ id: p.id, name: p.name })) }}
        initial={{
          id: pack.id,
          pack: input,
          cards: cards.map(c => ({ ...c, upgradesEnabled: c.upgradesEnabled !== false })),
        }}
      />
    );
  }

  return <PackFlow />;
}
