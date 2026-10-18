# app/(entity)/cards/[card]/copies/page.tsx

- SP · type · L20-L20 — type SP = { season?: string; variant?: string; page?: string };
- generateMetadata · function · L22-L25 — async function generateMetadata({ params }: { params: Promise<{ card: string }> }): Promise<Metadata>
- CardCopiesPage · function · L31-L127 — async function CardCopiesPage({ params, searchParams }: { params: Promise<{ card: string }>; searchParams: Promise<SP> })
- href · function · L52-L56 — href = (o: { variant?: Variant; page?: number })
- who · function · L57-L62 — who = (name?: string)
