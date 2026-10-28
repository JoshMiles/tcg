// The start-up window's brain: what it says, and when the app hands over from it to the real window. Plain TypeScript, no
// Electron: main.ts feeds it electron-updater's events and a clock, and shows what it returns. It also keeps the in-window
// update stage, because the same events drive that for the whole life of the app.
import type { UpdateStage } from './update';

export type StartupPhase = 'checking' | 'downloading' | 'installing' | 'starting';
export type StartupEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'none' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error' };

export interface StartupStep {
  phase: StartupPhase;
  /** The one status line under the icon. */
  text: string;
  /** 0 to 100 while downloading, else null. */
  progress: number | null;
  /** The small note for the main window when the update was skipped; '' when there is none. */
  note: string;
  /** True from the moment the app should open its real window (or only the tray); stays true. */
  handover: boolean;
  /** True when the update is downloaded during start-up: call quitAndInstall now. */
  install: boolean;
  /** What the main window shows about updates. */
  update: UpdateStage;
}

export const CHECK_NOTE = "Couldn't check for updates";
export const DOWNLOAD_NOTE = "Couldn't download the update, TCG Bridge will try again later";
const TEXT: Record<StartupPhase, string> = { checking: 'Checking for updates', downloading: 'Downloading update', installing: 'Installing update', starting: 'Starting' };

export class Startup {
  private phase: StartupPhase = 'checking';
  private version = '';
  private percent = 0;
  private note = '';
  private handover = false;
  private install = false;
  private update: UpdateStage = { stage: 'idle' };
  private activeAt: number;

  /** `checkMs`: how long the first check may take; `stallMs`: how long a download may go without news. */
  constructor(private startedAt: number, private o: { checkMs: number; stallMs: number } = { checkMs: 8000, stallMs: 30_000 }) {
    this.activeAt = startedAt;
  }

  get step(): StartupStep {
    const downloading = this.phase === 'downloading';
    return {
      phase: this.phase,
      text: downloading ? `${TEXT.downloading} ${this.version}` : TEXT[this.phase],
      progress: downloading ? this.percent : this.phase === 'installing' ? 100 : null,
      note: this.note, handover: this.handover, install: this.install, update: this.update,
    };
  }

  /** The clock moved: a check that takes too long, or a download that went quiet, is given up on. */
  tick(now: number): StartupStep {
    if (!this.handover) {
      if (this.phase === 'checking' && now - this.startedAt >= this.o.checkMs) this.giveUp(CHECK_NOTE);
      else if (this.phase === 'downloading' && now - this.activeAt >= this.o.stallMs) this.giveUp(DOWNLOAD_NOTE);
    }
    return this.step;
  }

  event(e: StartupEvent, now: number): StartupStep {
    this.activeAt = now;
    if (this.handover) { // running: an update found now is only announced (the button restarts the app, the start-up window installs it)
      if (e.type === 'available') { this.update = { stage: 'available', version: e.version }; this.note = ''; }
      else if (e.type === 'none') this.note = '';
      return this.step;
    }
    if (this.phase === 'checking') {
      if (e.type === 'available') { this.phase = 'downloading'; this.version = e.version; this.percent = 0; }
      else if (e.type === 'none') this.start();
      else if (e.type === 'error') this.giveUp(CHECK_NOTE);
    } else if (this.phase === 'downloading') {
      if (e.type === 'progress') this.percent = Math.max(0, Math.min(100, Math.round(e.percent)));
      else if (e.type === 'downloaded') { this.phase = 'installing'; this.install = true; }
      else if (e.type === 'error') this.giveUp(DOWNLOAD_NOTE);
    }
    return this.step;
  }

  private start(): void {
    this.phase = 'starting';
    this.handover = true;
  }

  private giveUp(note: string): void {
    this.note = note;
    this.update = this.version ? { stage: 'available', version: this.version } : { stage: 'idle' }; // a failed download keeps Restart to update on offer
    this.start();
  }
}
