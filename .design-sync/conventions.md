# Cheesy TCG: how to build with this design system

Cheesy TCG is a trading card game played live on a Twitch stream, with a public site (profiles, binder, dex, leaderboard, trading) and a staff admin panel. Designs should look like that site: dark, playful, card-first.

## Page setup

- Always render on the dark page: wrap screens in `bg-gray-950` (navy, `#0a0f21`) with light text. Components assume a dark background and look wrong on white.
- Fonts come with `styles.css`: `font-sans` is Nunito (body), `font-display` is Fredoka (headings, big numbers).
- Styling is Tailwind utility classes. The compiled CSS covers the common families (spacing, sizing, text, rounded, flex/grid, shadows) and the theme colours below; arbitrary values like `w-[123px]` are not compiled in, so stick to the scale.

## Theme vocabulary

- Surfaces: `bg-gray-950` page, `bg-gray-900` or `bg-gray-900/70` cards, `border-gray-800` hairlines, `text-gray-300`/`text-gray-400` secondary text.
- Accent: `yellow-500` (`#ffcb05`), with `yellow-300`/`yellow-400` for highlights and hover.
- Status: `green-*` good/live, `red-*` destructive, `amber-*` warning, `purple-*` staff, `sky-*` info. Brand extras: `poke-blue`, `poke-blue-light`, `poke-red`.
- Shadows: `shadow-card` for card art, `shadow-glow` for a yellow glow.

## House patterns

- Primary button: `rounded-xl bg-yellow-500 hover:bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-950`.
- Quiet button: `px-3 py-2 text-sm font-semibold text-gray-300 rounded-xl hover:bg-gray-800`.
- Panel: `rounded-2xl border border-gray-800 bg-gray-900/70 p-4`.
- Destructive or irreversible actions use `ArmedButton` (click once to arm, again to confirm), never a plain button.
- A pending action shows `Spinner` inside the button.

## Component notes

- `CardTile`: give it `relative` plus a size and the card ratio, e.g. `className="relative w-40 aspect-[2/3] rounded-xl overflow-hidden shadow-card"`. Children are overlays positioned `absolute` (put a `SerialChip` top-right, a `×N` count bottom-left).
- `SerialChip`: the print number of a card copy; low numbers get special tiers. Players call a card copy a "print".
- `Icon`: the only icon set. Use `<Icon name="trophy" />`; it sizes in `em` so it follows the text size unless you pass `w-*`/`h-*`. `RankMedal` is for podium places 1 to 3.
- `Dialog` is a fixed overlay with a title bar; put content in a `px-6 py-5` body and actions right-aligned at the bottom.
- `StatusChip` and `DraftChip` are admin list markers; `StaffBadge` sits next to a username.

## Rules

- No emoji anywhere in the UI: use `Icon`. Text glyphs like the rarity star are fine.
- No long dashes in copy: use a comma, colon, full stop or brackets.
- Short variant labels: Shiny "SH", Reverse Holo "RH", Full Art "FA".
