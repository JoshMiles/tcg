# lib/holo-core.ts

- HoloSpec · interface · L12-L15 — interface HoloSpec
- HoloSpecs · type · L16-L16 — type HoloSpecs = Record<Variant, HoloSpec>;
- holoGradient · function · L22-L28 — function holoGradient(colors: string[], angle: number): string
- buildHoloSpecs · function · L31-L53 — function buildHoloSpecs(props: PropValues, stars: number, holoMinStars: number): HoloSpecs
- g · function · L34-L34 — g = (name: string): PropValue | undefined
- holoVars · function · L56-L58 — function holoVars(spec: HoloSpec | undefined): React.CSSProperties
- holoClass · function · L61-L63 — function holoClass(spec: HoloSpec | undefined, live = false): string
