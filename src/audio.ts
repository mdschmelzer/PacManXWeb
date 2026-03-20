/**
 * Audio manager — thin wrapper around HTMLAudioElement.
 * Mirrors the DirectX Audio operations used in the original:
 *   play(), pause(), stop(), seekAndPlay().
 *
 * Each sound keeps one <audio> element. seek-to-zero + play is the common
 * pattern in the original (e.g. "sndDead.SeekCurrentPosition(0); sndDead.Play()").
 */
export class SoundManager {
  private sounds = new Map<string, HTMLAudioElement>();
  volume = 0.30;

  /** Pre-load all game sounds. Returns a promise that resolves when done (or on error). */
  async load(): Promise<void> {
    const names = [
      'audBonusItem',
      'audDot1',
      'audDot2',
      'audGhostEaten',
      'audGhostEatenCooldown',
      'audGhostSpeed1',
      'audGhostSpeed2',
      'audGhostSpeed3',
      'audLevel',
      'audNewLife',
      'audPlayerDead',
      'audPowerupGhostActive',
      'audStart',
    ];
    await Promise.allSettled(names.map(name => this.loadOne(name)));
  }

  private loadOne(name: string): Promise<void> {
    return new Promise(resolve => {
      const el = new Audio(`${import.meta.env.BASE_URL}${name}.wav`);
      el.volume = this.volume;
      el.preload = 'auto';
      el.oncanplaythrough = () => resolve();
      el.onerror = () => resolve(); // don't block on missing audio
      this.sounds.set(name, el);
    });
  }

  play(name: string): void {
    const el = this.sounds.get(name);
    if (!el) return;
    el.play().catch(() => {/* autoplay policy */});
  }

  /** Seek to start and play (matches VB.NET SeekCurrentPosition(0) + Play()) */
  seekAndPlay(name: string): void {
    const el = this.sounds.get(name);
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  }

  pause(name: string): void {
    const el = this.sounds.get(name);
    if (!el) return;
    el.pause();
  }

  stop(name: string): void {
    const el = this.sounds.get(name);
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }

  /** Pause all currently playing sounds */
  pauseAll(): void {
    for (const el of this.sounds.values()) {
      if (!el.paused) el.pause();
    }
  }

  /** Resume all sounds that were playing (i.e. are paused mid-play) */
  resumeAll(): void {
    for (const el of this.sounds.values()) {
      if (el.paused && el.currentTime > 0 && el.currentTime < el.duration) {
        el.play().catch(() => {});
      }
    }
  }

  stopAll(): void {
    for (const el of this.sounds.values()) {
      el.pause();
      el.currentTime = 0;
    }
  }

  isNearEnd(name: string, thresholdSec = 0.05): boolean {
    const el = this.sounds.get(name);
    if (!el || el.duration === 0 || isNaN(el.duration)) return false;
    return el.currentTime >= el.duration - thresholdSec;
  }

  isPlaying(name: string): boolean {
    const el = this.sounds.get(name);
    if (!el) return false;
    return !el.paused;
  }

  setVolume(name: string, volume: number): void {
    const el = this.sounds.get(name);
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
  }

  setAllVolumes(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    for (const el of this.sounds.values()) el.volume = this.volume;
  }
}
