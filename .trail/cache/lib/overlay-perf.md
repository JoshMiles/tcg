# lib/overlay-perf.ts

- PerfLevel · type · L7-L7 — type PerfLevel = 'light' | 'medium' | 'heavy';
- PerfRating · interface · L8-L8 — interface PerfRating
- num · function · L10-L10 — num = (v: PropValue | undefined, fallback: number)
- variantPerf · function · L12-L43 — function variantPerf(get: (key: string) => PropValue, variant: VariantId): PerfRating
- g · function · L13-L13 — g = (n: string)
- add · function · L16-L16 — add = (points: number, reason?: string)
