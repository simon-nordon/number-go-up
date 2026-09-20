export class AudioManager {
  enabled = true;
  private context: AudioContext | null = null;
  unlock(): void {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
  }
  play(kind: "catch" | "hit" | "buy" | "click"): void {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const ctx = this.context,
      now = ctx.currentTime;
    const notes =
      kind === "catch"
        ? [523.25, 659.25, 783.99]
        : kind === "buy"
          ? [392, 523.25, 659.25, 1046.5]
          : kind === "hit"
            ? [260]
            : [480];
    notes.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + i * 0.07);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * (kind === "hit" ? 0.55 : 1.02),
        now + i * 0.07 + 0.15,
      );
      gain.gain.setValueAtTime(0, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(
        kind === "hit" ? 0.025 : 0.07,
        now + i * 0.07 + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.24);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + i * 0.07);
      oscillator.stop(now + i * 0.07 + 0.25);
    });
  }
}
