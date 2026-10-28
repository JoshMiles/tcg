// The keys on the decks (ROADMAP 57.13a), without the Stream Deck SDK: plugin.ts hands the SDK's events and key objects to this, bridge/scripts/check-deck.ts hands it fakes.
import type { BridgeLink } from './link';
import { HOLD_MS, requestFor, view, type KeyKind, type Settings } from './keys';

/** What a key object must do; the SDK's KeyAction does all of it. */
export interface KeyHandle {
  setTitle(title: string): Promise<void> | void;
  setImage(image: string): Promise<void> | void;
  showAlert(): Promise<void> | void;
  showOk(): Promise<void> | void;
}

interface Key { kind: KeyKind; handle: KeyHandle; settings: Settings; shown: string; downAt: number; wasRunning: boolean; hintUntil: number }

export class Keys {
  private keys = new Map<string, Key>();
  constructor(private link: BridgeLink, private now: () => number = Date.now) {}

  add(id: string, kind: KeyKind, handle: KeyHandle, settings: Settings): void {
    this.keys.set(id, { kind, handle, settings, shown: '', downAt: 0, wasRunning: false, hintUntil: 0 });
    this.draw(id);
  }

  remove(id: string): void { this.keys.delete(id); }

  setSettings(id: string, settings: Settings): void {
    const k = this.keys.get(id);
    if (k) { k.settings = settings; this.draw(id); }
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
    const title = k.hintUntil > this.now() ? 'Hold 1 second\nto end' : v.title;
    const shown = `${title}|${v.image}`;
    if (shown === k.shown) return;
    k.shown = shown;
    void Promise.resolve(k.handle.setImage(v.image)).catch(() => undefined);
    void Promise.resolve(k.handle.setTitle(title)).catch(() => undefined);
  }

  /** A refusal shows the key's alert; the app has the reason in its own log. */
  private async run(k: Key, kind: KeyKind, settings: Settings): Promise<void> {
    const req = requestFor(kind, settings);
    if (!req) return void k.handle.showAlert();
    const r = await this.link.request(req);
    await (r.ok ? k.handle.showOk() : k.handle.showAlert());
  }

  async down(id: string): Promise<void> {
    const k = this.keys.get(id);
    if (!k) return;
    k.downAt = this.now();
    k.wasRunning = this.happyRunning();
    if (k.kind !== 'happy') await this.run(k, k.kind, k.settings);
  }

  /** Happy hour: a press starts one; while one runs, only a press of a second or more ends it. */
  async up(id: string): Promise<void> {
    const k = this.keys.get(id);
    if (!k || k.kind !== 'happy') return;
    if (!k.wasRunning) return this.run(k, 'happy', k.settings);
    if (this.now() - k.downAt >= HOLD_MS) {
      const r = await this.link.request({ what: 'happy-end' });
      await (r.ok ? k.handle.showOk() : k.handle.showAlert());
      return;
    }
    k.hintUntil = this.now() + 2000; // a short press: say how to end it, for two seconds
    this.draw(id);
    await k.handle.showAlert();
  }
}
