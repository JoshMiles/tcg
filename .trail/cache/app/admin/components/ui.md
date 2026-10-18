# app/admin/components/ui.tsx

- Tone · type · L7-L7 — type Tone = 'amber' | 'green' | 'red';
- Tile · function · L12-L25 — function Tile({ label, value, sub, tone, icon, href }: { label: string; value: string | number; sub?: string; tone?: Tone; icon?: IconName; href?: string })
- Panel · function · L28-L45 — function Panel({ title, hint, icon, actions, id, children, className = '' }: { title?: ReactNode; hint?: ReactNode; icon?: IconName; actions?: ReactNode; id?: string; children: ReactNode; className?: string; })
- PageHeader · function · L48-L61 — function PageHeader({ title, subtitle, icon, back, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: IconName; back?: { href: string; label: string }; actions?: ReactNode })
- Narrow · function · L64-L67 — function Narrow({ size = 'lg', children, className = '' }: { size?: 'md' | 'lg' | 'xl'; children: ReactNode; className?: string })
- EmptyState · function · L70-L80 — function EmptyState({ icon = 'inbox', title, children, action, asH1 = false }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; /** For a screen that is the whole page (not found): the title is the page's one heading. */ asH1?: boolean })
- Chip · function · L86-L88 — function Chip({ tone = 'gray', children }: { tone?: keyof typeof CHIP; children: ReactNode })
