// Game Show Web Audio Sound FX Synthesizer & Canvas Particle Engine

let audioCtx: AudioContext | null = null;
let soundMuted = false;
let soundVolume = 1;
let masterGain: GainNode | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getMasterGain(ctx: AudioContext): GainNode {
  if (!masterGain || masterGain.context !== ctx) {
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(soundMuted ? 0 : soundVolume, ctx.currentTime);
    masterGain.connect(ctx.destination);
  }
  return masterGain;
}

/**
 * Shared game AudioContext. Mobile browsers cap how many contexts a page may
 * open, so every Activity sound path — synthesized cues here and decoded
 * sample playback in `audio/gameAudio.ts` — must route through this one.
 */
export function getSharedAudioContext(): AudioContext | null {
  return getAudioContext();
}

/**
 * Master gain for the shared context. Routing sample playback here keeps the
 * existing host mute/volume controls authoritative over every game sound.
 */
export function getSharedAudioDestination(): GainNode | null {
  const ctx = getAudioContext();
  return ctx ? getMasterGain(ctx) : null;
}

export function isAudioMuted(): boolean {
  return soundMuted;
}

export function setAudioMuted(muted: boolean): void {
  soundMuted = muted;
  if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(muted ? 0 : soundVolume, audioCtx.currentTime, 0.01);
}

export function toggleAudioMuted(): boolean {
  setAudioMuted(!soundMuted);
  return soundMuted;
}

export function getAudioVolume(): number {
  return soundVolume;
}

export function setAudioVolume(volume: number): void {
  soundVolume = Math.min(1, Math.max(0, volume));
  if (masterGain && audioCtx && !soundMuted) masterGain.gain.setTargetAtTime(soundVolume, audioCtx.currentTime, 0.01);
}

// 1. Tick Sound (for spin wheel, random picker cycling)
export function playTickSound(frequency = 800): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (err) { void err; }
}

// 2. Victory Fanfare (for winners, game over podium)
export function playFanfareSound(): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Arpeggiated C-Major victory fanfare: C4, E4, G4, C5, G4, C5
    const notes = [
      { freq: 261.63, delay: 0.0, dur: 0.15 },
      { freq: 329.63, delay: 0.12, dur: 0.15 },
      { freq: 392.00, delay: 0.24, dur: 0.18 },
      { freq: 523.25, delay: 0.38, dur: 0.4 },
      { freq: 392.00, delay: 0.72, dur: 0.15 },
      { freq: 523.25, delay: 0.88, dur: 0.7 }
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.delay);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + n.delay);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + n.delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.delay + n.dur);

      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.start(ctx.currentTime + n.delay);
      osc.stop(ctx.currentTime + n.delay + n.dur);
    });
  } catch (err) { void err; }
}

// 3. Buzzer (for strikes, wrong answer, timer expired)
export function playBuzzerSound(): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(130.81, ctx.currentTime); // C3
    osc2.frequency.setValueAtTime(138.59, ctx.currentTime); // C#3 (dissonant clash)

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.45);
    osc2.stop(ctx.currentTime + 0.45);
  } catch (err) { void err; }
}

// 4. Chime / Sparkle (for correct answer, prize revealed)
export function playChimeSound(): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + idx * 0.07;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch (err) { void err; }
}

// 5. Pop / Blip (for score changes, button presses)
export function playPopSound(up = true): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const startFreq = up ? 300 : 500;
    const endFreq = up ? 600 : 250;

    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (err) { void err; }
}

// 5b. Thud / Heavy Lock-In (for final submissions)
export function playThudSound(): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Low sine drop gives the weight; a short filtered noise burst gives the
    // mechanical "click" edge so the cue reads as a physical switch throw.
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.14);
    oscGain.gain.setValueAtTime(0.32, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(oscGain);
    oscGain.connect(getMasterGain(ctx));
    osc.start();
    osc.stop(ctx.currentTime + 0.2);

    const clickLength = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, clickLength, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < clickLength; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / clickLength);
    }
    const click = ctx.createBufferSource();
    click.buffer = buffer;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'lowpass';
    clickFilter.frequency.setValueAtTime(2200, ctx.currentTime);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.18, ctx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(getMasterGain(ctx));
    click.start();
    click.stop(ctx.currentTime + 0.06);
  } catch (err) { void err; }
}

// 6. Ticking Countdown Clock
export function playCountdownTickSound(urgent = false): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(urgent ? 900 : 550, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (urgent ? 0.06 : 0.04));

    osc.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch (err) { void err; }
}

// 8. Drumroll / Suspense Tension Sound (for spinning, picking, reveal anticipation)
export function playDrumrollSound(durationMs = 3000): () => void {
  if (soundMuted) return () => {};
  try {
    const ctx = getAudioContext();
    if (!ctx) return () => {};

    const bufferSize = ctx.sampleRate * (durationMs / 1000);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(600, ctx.currentTime + durationMs / 1000);
    filter.Q.setValueAtTime(3, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + durationMs / 1000 - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterGain(ctx));

    noise.start();
    noise.stop(ctx.currentTime + durationMs / 1000);

    return () => {
      try {
        noise.stop();
      } catch (e) { void e; }
    };
  } catch (err) {
    void err;
    return () => {};
  }
}

// 9. Whoosh Sound (for fast transitions, card flips)
export function playWhooshSound(): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (err) { void err; }
}

// 10. Horn / Game Show Siren (for timer 00:00 finish)
export function playHornSound(): void {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freqs = [350, 440, 523.25];
    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc.start();
      osc.stop(ctx.currentTime + 0.85);
    });
  } catch (err) { void err; }
}

// 11. Confetti and Sparkle Particle Cannon
interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const CONFETTI_COLORS = [
  '#FF1744', '#FF9100', '#FFEA00', '#00E676', '#00E5FF', '#2979FF', '#D500F9', '#FF4081', '#FFD700'
];

export function launchConfetti(containerElement?: HTMLElement | null, particleCount = 120): void {
  if (typeof window === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';

  const target = containerElement || document.body;
  target.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.random() * Math.PI) - (Math.PI / 2); // Spread upwards
    const speed = 10 + Math.random() * 16;
    particles.push({
      x: width * (0.2 + Math.random() * 0.6),
      y: height * 0.65,
      vx: Math.sin(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: -Math.cos(angle) * speed - 5,
      size: 7 + Math.random() * 9,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      opacity: 1
    });
  }

  let animationId: number;
  const gravity = 0.38;
  const drag = 0.98;

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    let activeParticles = 0;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += gravity;
      p.vx *= drag;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.007;

      if (p.opacity > 0 && p.y < height + 50) {
        activeParticles++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    if (activeParticles > 0) {
      animationId = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(animationId);
      canvas.remove();
    }
  }

  render();
}
