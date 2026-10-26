/** The site's main links: the top bar (xl and up), the menu and the phone tab bar all read this one list. */
export const LINKS = [
  { href: '/', label: 'Home', exact: true },
  { href: '/collection', label: 'Find collectors' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/trade', label: 'Trade' },
  { href: '/stats', label: 'Season Stats' },
  { href: '/cards', label: 'Card Dex' },
  { href: '/faq', label: 'FAQ' },
];

export const isActive = (pathname: string, href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + '/'));
