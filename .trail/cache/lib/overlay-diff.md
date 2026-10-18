# lib/overlay-diff.ts

- DiffLine · interface · L6-L6 — interface DiffLine
- formatValue · function · L10-L20 — function formatValue(def: PropDef | undefined, v: PropValue | undefined): string
- same · function · L22-L22 — same = (a: unknown, b: unknown)
- diffProps · function · L25-L37 — function diffProps(scope: string, before: PropValues, after: PropValues, missing: (key: string) => PropValue | string | undefined): DiffLine[]
- fmt · function · L33-L33 — fmt = (x: PropValue | string | undefined)
- diffLayout · function · L39-L51 — function diffLayout(before: OverlayLayout, after: OverlayLayout): DiffLine[]
- add · function · L41-L41 — add = (label: string, a: unknown, b: unknown)
