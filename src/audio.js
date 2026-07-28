export class SoundManager {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
    this.master = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master) this.master.gain.value = this.enabled ? 0.16 : 0;
  }

  async unlock() {
    if (!this.enabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  play(type) {
    if (!this.enabled) return;
    this.unlock().then(() => {
      if (!this.context || !this.master) return;
      const recipes = {
        shot: [150, 55, 0.07, "square", 0.45],
        turret: [220, 85, 0.055, "square", 0.3],
        melee: [95, 48, 0.11, "sawtooth", 0.36],
        hurt: [70, 36, 0.18, "sawtooth", 0.42],
        kill: [100, 28, 0.13, "triangle", 0.3],
        heal: [370, 620, 0.22, "sine", 0.3],
        build: [180, 260, 0.18, "triangle", 0.3],
        loot: [440, 760, 0.2, "sine", 0.28],
        search: [160, 130, 0.16, "triangle", 0.25],
        scream: [530, 115, 0.5, "sawtooth", 0.34],
        wave: [90, 45, 0.75, "sawtooth", 0.38],
        victory: [330, 660, 0.55, "triangle", 0.28],
        gameover: [130, 32, 1.1, "sawtooth", 0.4]
      };
      const recipe = recipes[type];
      if (!recipe) return;
      this.tone(...recipe);
    }).catch(() => {});
  }

  tone(startFrequency, endFrequency, duration, wave, volume) {
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }
}
