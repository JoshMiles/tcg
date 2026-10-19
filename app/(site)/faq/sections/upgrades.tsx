import type { ReactNode } from 'react';
import type { UpgradeCosts } from '@/lib/types';
import { Section, Q } from '../parts';

export function UpgradesSection({ costs, upgradesOn, title = 'Upgrading', extra }: { costs: UpgradeCosts; upgradesOn: boolean; title?: string; extra?: ReactNode }) {
  return (
    <Section id="upgrades" title={title} icon="arrowUp">
      {upgradesOn ? (
        <>
          <Q q="How do upgrades work?" open>
            Collect duplicates of the same card in the same version, then trade them up one step:
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
              <li><strong className="text-white">{costs.reverse}</strong> Regular → 1 <strong className="text-fuchsia-300">Reverse Holo</strong></li>
              <li><strong className="text-white">{costs.full}</strong> Reverse Holo → 1 <strong className="text-sky-300">Full Art</strong></li>
              <li><strong className="text-white">{costs.shiny}</strong> Full Art → 1 <strong className="text-amber-300">Full Art Holo</strong></li>
            </ul>
            <p className="mt-2">
              That&rsquo;s {costs.reverse} Regulars for a Reverse Holo, {costs.reverse * costs.full} for a Full Art and {costs.reverse * costs.full * costs.shiny} for a Full Art Holo, counted from Regular editions alone.
            </p>
          </Q>
          <Q q="Where do I upgrade?">
            On the website, log in and open <strong className="text-white">My stats</strong> (it lists what you can upgrade right now), or open one of your cards on your own collection page and use the Upgrade column.
            You can also upgrade from the Twitch extension.
          </Q>
          <Q q="What are the rules?">
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
              <li>Only one step at a time. No skipping from Regular straight to Full Art Holo.</li>
              <li>Only editions of the <strong className="text-white">same card and the same version</strong> can be combined.</li>
              <li>Upgrades are <strong className="text-white">permanent</strong>. The editions you spend are destroyed, so the Upgrade button asks you to tap twice (the first tap says &ldquo;Sure?&rdquo;).</li>
              <li>Only the current season can be upgraded.</li>
              <li>Some cards or packs can have upgrades turned off.</li>
            </ul>
          </Q>
        </>
      ) : (
        <Q q="Can I upgrade cards?" open>
          In seasons with variants you can combine duplicates to create rarer versions. The current season doesn&rsquo;t use variants, so there&rsquo;s nothing to upgrade right now. When it&rsquo;s available, this section lists the exact costs.
        </Q>
      )}
      <Q q="Can I trade cards with other people?">
        Yes. See <a href="#trading" className="text-yellow-400 hover:text-yellow-300">Trading</a>. You can also trade duplicates for the version you&rsquo;re missing instead of upgrading them.
      </Q>
      <Q q="Can I trade upgraded cards?">
        Yes. Any edition of any version can be traded, including an upgraded one. A favourite, or an edition already in an offer, cannot. See <a href="#trading" className="text-yellow-400 hover:text-yellow-300">Trading</a>.
      </Q>
      {extra}
    </Section>
  );
}
