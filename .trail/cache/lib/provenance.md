# lib/provenance.ts

- StepKind · type · L7-L7 — type StepKind = 'made' | 'passed' | 'offered' | 'returned' | 'forged' | 'ended' | 'removed';
- ProvStep · interface · L9-L21 — interface ProvStep
- Provenance · interface · L23-L34 — interface Provenance
- viewer · function · L36-L36 — viewer = (n?: string)
- buildProvenance · function · L42-L76 — function buildProvenance(copy: Pick<Copy, 'ev' | 'owner' | 'at'>, now = Date.now()): Provenance
- spanText · function · L79-L87 — function spanText(ms: number): string
