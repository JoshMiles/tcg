import type { ComponentType, SVGProps } from 'react';
import {
  Bug, Flag, Activity, Share2, Smartphone, Bell, BellOff, Filter, List, Pin, Heart, ArrowDown, ArrowUp, Award, Ban, BookOpen, Bomb, CalendarDays, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleAlert, CircleCheck, CircleDashed, ClipboardList, Clock, Coins, Compass, Copy, Crown, Download, Film, FlaskConical, Gamepad2, Gem,
  Gift, GripVertical, Handshake, History, Hourglass, Image, Inbox, Info, Layers, Link, Lock, Medal, Menu, MessageSquare, Monitor, Music,
  Palette, PartyPopper, Pause, Pencil, Play, Puzzle, Radio, RefreshCw, Repeat, Ruler, Search, Send, Settings, Shield, Sigma, Sparkles,
  Square, Star, StickyNote, Database, House, LogOut, PanelLeftClose, PanelLeftOpen, ExternalLink, Redo2, Eye, Grid3x3, Target, Trash2, TrendingUp, Trophy, Tv, TriangleAlert, Undo2, User, Users, Volume2, Wrench, X, Zap,
} from 'lucide-react';

/**
 * The site's icon set (Lucide), by short name, so data (nav items, widget registry, notification kinds) can refer to an icon with a
 * plain string and the pages stay free of emoji. Icons are sized in `em` by default so they match the text they sit beside;
 * give a `className` with `w-* h-*` to size one explicitly.
 */
type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

/** The Cheesy TCG's cheese wedge: the brand mark, used where a cheese emoji would have been. */
function CheeseGlyph(props: SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }) {
  const { size = 24, strokeWidth = 2, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M3 17.5 21 9.2a1 1 0 0 0 .4-1.4l-1.5-2.4a1.5 1.5 0 0 0-1.7-.6L3 9.8V17.5Z" />
      <path d="M3 17.5v1.7a1.3 1.3 0 0 0 1.3 1.3H19a2 2 0 0 0 2-2v-9.8" />
      <circle cx="8.5" cy="14.2" r="1.1" />
      <circle cx="14.5" cy="12.4" r="1" />
      <circle cx="16" cy="17.2" r="1.2" />
    </svg>
  );
}

export const ICONS = {
  flag: Flag, trophy: Trophy, medal: Medal, award: Award, crown: Crown,
  arrowUp: ArrowUp, arrowDown: ArrowDown, chevronUp: ChevronUp, chevronDown: ChevronDown, chevronLeft: ChevronLeft, chevronRight: ChevronRight,
  star: Star, sparkles: Sparkles, check: Check, checkCircle: CircleCheck, x: X, warning: TriangleAlert, alert: CircleAlert, info: Info, ban: Ban,
  trade: Repeat, handshake: Handshake, undo: Undo2, inbox: Inbox, send: Send, board: ClipboardList, history: History, hourglass: Hourglass,
  cards: Layers, gift: Gift, trash: Trash2, refresh: RefreshCw, zap: Zap, book: BookOpen, radio: Radio, users: Users, user: User,
  image: Image, film: Film, music: Music, palette: Palette, flask: FlaskConical, bug: Bug, settings: Settings, menu: Menu, volume: Volume2,
  target: Target, pencil: Pencil, puzzle: Puzzle, gem: Gem, monitor: Monitor, trend: TrendingUp, chart: ChartColumn, coins: Coins,
  hole: CircleDashed, party: PartyPopper, compass: Compass, note: StickyNote, ruler: Ruler, search: Search, gamepad: Gamepad2,
  chat: MessageSquare, link: Link, share: Share2, phone: Smartphone, shield: Shield, database: Database, home: House, stop: Square, bomb: Bomb, grip: GripVertical, download: Download, copy: Copy,
  pause: Pause, play: Play, filter: Filter, bell: Bell, bellOff: BellOff, list: List, pin: Pin, heart: Heart, activity: Activity, calendar: CalendarDays, tv: Tv, lock: Lock, wrench: Wrench, nerd: Sigma, clock: Clock, cheese: CheeseGlyph, redo: Redo2, logout: LogOut, panelClose: PanelLeftClose, panelOpen: PanelLeftOpen, external: ExternalLink, eye: Eye, grid: Grid3x3,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = '', strokeWidth = 2, title }: { name: IconName; className?: string; strokeWidth?: number; title?: string }) {
  const Glyph = ICONS[name] as LucideIcon;
  // Sized in em unless the caller sets a size; sits on the text baseline like a glyph would.
  const sized = /(^|\s)(w|h|size)-/.test(className) ? '' : 'w-[1.15em] h-[1.15em]';
  return (
    <Glyph
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      strokeWidth={strokeWidth}
      className={`inline-block shrink-0 align-[-0.2em] ${sized} ${className}`.trim()}
    />
  );
}

const MEDAL_COLOR = ['text-amber-300', 'text-slate-300', 'text-amber-600'];

/** A podium medal for ranks 1-3 (gold, silver, bronze), or the rank number after that. */
export function RankMedal({ rank, className = '' }: { rank: number; className?: string }) {
  if (rank >= 1 && rank <= 3) return <Icon name="medal" className={`${MEDAL_COLOR[rank - 1]} ${className}`} title={`#${rank}`} />;
  return <span className={`tabular-nums ${className}`}>{rank}</span>;
}
