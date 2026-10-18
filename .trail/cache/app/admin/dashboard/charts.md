# app/admin/dashboard/charts.tsx

- Sparkline · function · L4-L17 — function Sparkline({ values, className = '', stroke = '#eab308' }: { values: number[]; className?: string; stroke?: string })
- BarLayer · interface · L19-L19 — interface BarLayer
- StackedBars · function · L22-L46 — function StackedBars({ layers, labels, height = 150 }: { layers: BarLayer[]; labels: string[]; height?: number })
- Delta · function · L49-L55 — function Delta({ now, prev, className = '' }: { now: number; prev: number; className?: string }): ReactNode
