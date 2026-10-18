# lib/binder.ts

- BinderPage · interface · L10-L24 — interface BinderPage
- BinderCardInfo · interface · L26-L26 — interface BinderCardInfo
- AutoOptions · interface · L28-L28 — interface AutoOptions
- ordered · function · L30-L39 — function ordered(idx: number[], cards: BinderCardInfo[], sort: BinderSort): number[]
- byNumber · function · L31-L31 — byNumber = (a: number, b: number)
- buildBinderPages · function · L42-L66 — function buildBinderPages(cards: BinderCardInfo[], opts: AutoOptions = {}): BinderPage[]
- autoFillPages · function · L69-L75 — function autoFillPages(cards: BinderCardInfo[], cfg: Pick<BinderConfig, 'cols' | 'rows' | 'sort' | 'groupByPack' | 'hideUncollected'>): BinderPageCfg[]
- buildCustomPages · function · L78-L87 — function buildCustomPages(cards: { number: number }[], pages: BinderPageCfg[], cap: number): BinderPage[]
- Spread · interface · L89-L89 — interface Spread
- buildSpreads · function · L95-L103 — function buildSpreads(pages: BinderPage[], double: boolean): Spread[]
- spreadOfPage · function · L106-L108 — function spreadOfPage(pageIndex: number, double: boolean): number
- clampSpread · function · L111-L111 — clampSpread = (n: number, count: number)
