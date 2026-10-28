// The keys on the decks (ROADMAP 57.13), without the Stream Deck SDK: plugin.ts hands the SDK's events and key objects to this, bridge/scripts/check-deck.ts hands it fakes.
import type { BridgeLink } from './link';
import { HOLD_MS, SKIP_MS, requestFor, staffRefused, statOf, view, type KeyKind, type Settings } from './keys';
import type { DeckStatKind } from './protocol';

/** What a key object must do; the SDK's KeyAction does all of it. */
export interface KeyHandle {
  setTitle(title: string): Promise<void> | void;
  setImage(image: string): Promise<void> | void;
  showAlert(): Promise<void> | void;
  showOk(): Promise<void> | void;
}

interface Key { kind: KeyKind; handle: KeyHandle; settings: Settings; shown: string; downAt: number; wasRunning: boolean; hintUntil: number; skipUntil: number }

export class Keys {
  private keys = new Map<string, Key>();
  constructor(private link: BridgeLink, private now: () => number = Date.now) {}

  add(id: string, kind: KeyKind, handle: KeyHandle, settings: Settings): void {
    this.keys.set(id, { kind, handle, settings, shown: '', downAt: 0, wasRunning: false, hintUntil: 0, skipUntil: 0 });
    this.draw(id);
    this.tell();
  }

  remove(id: string): void { this.keys.delete(id); this.tell(); }

  setSettings(id: string, settings: Settings): void {
    const k = this.keys.get(id);
    if (k) { k.settings = settings; k.skipUntil = 0; this.draw(id); this.tell(); }
  }

  /** The stats the visible Stat keys show: the app asks the site for them only while this is not empty. */
  private tell(): void {
    const want = new Set<DeckStatKind>();
    for (const k of this.keys.values()) if (k.kind === 'stat') { const s = statOf(k.settings); if (s && s !== 'happy') want.add(s); } else if (k.kind === 'queue') want.add('queue');
    this.link.want([...want]);
  }

  /** Draws every key; each one only talks to the Stream Deck when what it shows changed. Called when the state changes and once a second (the happy hour counts down). */
  drawAll(): void { for (const id of this.keys.keys()) this.draw(id); }

  private happyRunning(): boolean {
    const h = this.link.state?.happy;
    return !!h && h.endsAt > this.now();
  }

  private draw(id: string): void {
    const k = this.keys.get(id);
    if (!k) return;
    const v = view(k.kind, this.link.state, k.settings, this.now());
    const title = k.hintUntil > this.now() ? `Hold 1 second\nto ${k.kind === 'clear-queue' ? 'clear' : k.kind === 'trading' ? 'pause' : 'end'}` : k.skipUntil > this.now() ? 'Press again\nto skip' : v.title;
    const shown = `${title}|${v.image}`;
    if (shown === k.shown) return;
    k.shown = shown;
    void Promise.resolve(k.handle.setImage(v.image)).catch(() => undefined);
    void Promise.resolve(k.handle.setTitle(title)).catch(() => undefined);
  }

  /** A refusal shows the key's alert; the app has the reason in its own log. */
  private async run(k: Key, kind: KeyKind, settings: Settings): Promise<void> {
    const req = staffRefused(kind, this.link.state) ? null : requestFor(kind, settings, this.link.state); // a refused staff key sends nothing (the app would refuse it too)
    if (!req) return void k.handle.showAlert();
    const r = await this.link.request(req);
    await (r.ok ? k.handle.showOk() : k.handle.showAlert());
  }

  async down(id: string): Promise<void> {
    const k = this.keys.get(id);
    if (!k) return;
    k.downAt = this.now();
    k.wasRunning = k.kind === 'trading' ? !!this.link.state?.staff?.tradingPaused : this.happyRunning();
    if (k.kind === 'stat') return this.pressStat(id, k);
    if (k.kind !== 'happy' && k.kind !== 'clear-queue' && k.kind !== 'queue' && k.kind !== 'trading') await this.run(k, k.kind, k.settings);
  }

  /** Only the Queue stat does anything: the first press says how to skip, a second within SKIP_MS skips the next pull. */
  private async pressStat(id: string, k: Key): Promise<void> {
    if (statOf(k.settings) !== 'queue') return;
    if (!this.link.state) return void k.handle.showAlert();
    if (k.skipUntil <= this.now()) {
      k.skipUntil = this.now() + SKIP_MS;
      this.draw(id);
      return;
    }
    k.skipUntil = 0;
    this.draw(id);
    await this.run(k, 'stat', k.settings);
  }

  /** Happy hour: a press starts one; while one runs, only a press of a second or more ends it. Clear queue: only a press of a second or more clears. Trading: a press resumes it; pausing needs a second or more. */
  async up(id: string): Promise<void> {
    const k = this.keys.get(id);
    if (!k || (k.kind !== 'happy' && k.kind !== 'clear-queue' && k.kind !== 'trading')) return;
    if (k.kind === 'trading') {
      if (staffRefused('trading', this.link.state) || k.wasRunning || this.now() - k.downAt >= HOLD_MS) return this.run(k, 'trading', k.settings);
      k.hintUntil = this.now() + 2000;
      this.draw(id);
      return void k.handle.showAlert();
    }
    if (k.kind === 'happy' && !k.wasRunning) return this.run(k, 'happy', k.settings);
    if (this.now() - k.downAt >= HOLD_MS) {
      const r = await this.link.request(k.kind === 'happy' ? { what: 'happy-end' } : { what: 'clear-queue' });
      await (r.ok ? k.handle.showOk() : k.handle.showAlert());
      return;
    }
    k.hintUntil = this.now() + 2000; // a short press: say how to end it, for two seconds
    this.draw(id);
    await k.handle.showAlert();
  }
}
