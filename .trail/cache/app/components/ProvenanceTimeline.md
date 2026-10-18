# app/components/ProvenanceTimeline.tsx

- when · function · L18-L18 — when = (t: number)
- madeStep · function · L21-L29 — function madeStep(origin: Origin | undefined, to: ReactNode | null): ReactNode
- ProvenanceTimeline · function · L31-L115 — function ProvenanceTimeline({ prov, who, plain, seasonId, refs, madeFrom, origin }: { prov: Provenance; /** A collector as a link (or masked text). */ who: (name?: string) => ReactNode; /** A collector as plain text, masked the same way (for the bar's legend). */ plain: (name: string) => string; seasonId: string; /** What the copies this one was forged from / into are called ("#1000042"). */ refs: Record<string, { uid?: number; n: number }>; madeFrom?: string[]; /** How the copy came to exist, so its first step reads "Pulled by", "Given to" or "Forged by". */ origin?: Origin; })
- ref · function · L48-L51 — ref = (id: string)
- tile · function · L53-L59 — tile = (label: string, value: ReactNode, sub?: ReactNode)
