# app/components/Icon.tsx

- LucideIcon · type · L15-L15 — type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;
- CheeseGlyph · function · L18-L29 — function CheeseGlyph(props: SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string })
- IconName · type · L45-L45 — type IconName = keyof typeof ICONS;
- Icon · function · L47-L60 — function Icon({ name, className = '', strokeWidth = 2, title }: { name: IconName; className?: string; strokeWidth?: number; title?: string })
- RankMedal · function · L65-L68 — function RankMedal({ rank, className = '' }: { rank: number; className?: string })
