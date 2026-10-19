# Design sync notes

Syncs the app's self-contained visual primitives (11 components) to the Claude Design project "Cheesy TCG Design System". This is a Next.js app, not a component library: there is no Storybook and no `dist/`, so the bundle is built from `.design-sync/entry.ts` and the previews in `.design-sync/previews/` are hand-written.

## How to re-sync

1. Copy the skill's scripts into `.ds-sync/`. Install their dependencies there: esbuild, ts-morph, @types/react, and `playwright@1.64.0`. Playwright 1.64.0 matches the cached chromium-1248; a different version wants a different browser download.
2. Fetch the project's `_ds_sync.json` to `.design-sync/.cache/remote-sync.json`.
3. From the repo root, run:

   ```bash
   node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/entry.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
   ```

## Gotchas (already fixed, keep them)

- **Process shim.** `lib/site.ts` reads `process.env` when it loads, so the browser bundle crashed with `process is not defined` and nothing reached `window.CheesyTCG`. `entry.ts` imports `process-shim.ts` first to stop this.
- **Tailwind purge.** The app CSS only includes classes the app uses. `.design-sync/input.css` imports `app/globals.css` and adds an `@source inline` safelist of common utility families so designs can use classes the app does not. The `buildCmd` compiles that with `npx @tailwindcss/cli@4.3.3` (not a project dependency: the CLI still pulls the unpatched `braces` package) and puts `fonts.css` (Google Fonts: Fredoka and Nunito) in front.
- **Component discovery.** Automatic discovery found 0 components, so `componentSrcMap` pins each one to its file.
- **Prop types.** Props came out as `[key: string]: unknown`, so `dtsPropsFor` holds hand-written prop bodies.
  - Do not write `*/` inside a comment in them: the comment "w-*/h-*" broke the d.ts parse once.
- **Dialog preview.** Dialog is `position: fixed`, so its preview wraps it in `transform: translateZ(0)` with a fixed height. Without that the card renders blank.
- **CardTile.** Its className must include `relative`, because the hover image and overlays are absolute. Use `aspect-[2/3]` for the card ratio, as the app does.
- **Overflowing previews.** DraftChip, RankMedal and SerialChip use `cardMode: column` because the grid overflowed.
- **Internal docs.** `guidelinesGlob` is `[]` on purpose: the default would upload the internal `docs/*.md` files.

## Known validate warnings (expected)

- `[TOKENS_MISSING]` for `--d`, `--a`, `--x`, `--y`, `--edge`, `--cv-a`, `--cv-b` and `--cv-c`. These are holo and card-back variables that are set inline at runtime.
- `[FONT_REMOTE]` Poppins, from the Google Fonts import in `app/globals.css`.

## Re-sync risks

- **Card art.** Preview card art and the avatar picture load from `https://cheesytcg.app/...`. If those assets move, the CardTile and Avatar previews break. The bundle itself is unaffected.
- **Hand-copied prop types.** `dtsPropsFor` is copied from the component sources by hand. When a component's props change, update its entry here, or the design agent codes against a stale API.
- **Icon names.** Icon's `name` union in `dtsPropsFor` is generated from `ICONS` in `app/components/Icon.tsx`. Regenerate it when icons are added.
- **Admin component paths.** Dialog, StatusChip, DraftChip, ArmedButton and Spinner (from `PendingButton.tsx`) live in `app/admin/components/`. Moving or renaming those files breaks `componentSrcMap`.
- **Conventions header.** `conventions.md` names house classes and icon names. Check them against the build when the theme or `Icon` changes.
- **Grading.** Grading was visual, against the absolute rubric. No component was tested inside a real Claude Design generation.
