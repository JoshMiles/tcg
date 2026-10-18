# app/components/UpgradeCeremony.tsx

- CeremonyCard · interface · L13-L17 — interface CeremonyCard
- artFor · function · L27-L27 — artFor = (card: CeremonyCard, v: Variant)
- UpgradeCeremony · function · L33-L118 — function UpgradeCeremony({ card, from, to, cost, gain, holo, serial, serialMult, onClose, }: { card: CeremonyCard; from: Variant; to: Variant; cost: number; gain?: number; /** The serial the new copy got, and its points multiplier. */ serial?: number; serialMult?: number; /** The card's holographic shimmer per variant, from the Overlay Editor settings (see lib/holo.ts). */ holo?: HoloSpecs; onClose: () => void; })
- onKey · function · L49-L49 — onKey = (e: KeyboardEvent)
