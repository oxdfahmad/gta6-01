// Sound and music: a live WebAudio groove (bass, chords, hats, engine,
// gunshots, sirens, chimes) plus the Solmar Bay radio loop — an original
// synthwave track shipped as a local file under game/assets/ and played
// only after a user gesture. No network, ever. Mute with M; nothing
// starts until a user gesture unlocks the audio context.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let engineOsc = null;
  let engineBus = null;
  let muted = false;
  let grooveTimer = null;
  let step = 0;
  let radio = null;
  let radioOn = false;

  function ensureCtx() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.16;
      musicBus.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineBus = ctx.createGain();
      engineBus.gain.value = 0;
      engineOsc.connect(engineBus);
      engineBus.connect(master);
      engineOsc.start();
    } catch (e) {
      return false;
    }
    return true;
  }

  function noiseHit(dur, freq, vol, type) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function tone(freq, dur, vol, type, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  // The groove: an 8-step bass line in D minor with a hat tick, a soft
  // chord stab each bar and a high sparkle every other bar. Dm – Bb –
  // F – C, one chord per two bars, so the loop breathes under the radio.
  const BASS_LINE = [73.42, 0, 73.42, 87.31, 73.42, 0, 65.41, 98];
  const CHORD_SET = [
    [146.83, 174.61, 220],
    [116.54, 146.83, 174.61],
    [174.61, 220, 261.63],
    [130.81, 164.81, 196],
  ];
  const SPARKLE = [587.33, 698.46, 880, 1046.5, 880, 698.46];

  function stabChord(freqs) {
    if (!ctx || muted) return;
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      o.connect(g);
      g.connect(musicBus);
      o.start();
      o.stop(ctx.currentTime + 0.52);
    }
  }

  function sparklePhrase() {
    SPARKLE.forEach((f, i) => window.setTimeout(() => tone(f, 0.16, 0.05, 'sine'), i * 110));
  }

  function startGroove() {
    if (!ensureCtx() || grooveTimer) return;
    grooveTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const n = BASS_LINE[step % 8];
      if (n) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = n;
        g.gain.setValueAtTime(0.5, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        o.connect(g);
        g.connect(musicBus);
        o.start();
        o.stop(ctx.currentTime + 0.24);
      }
      if (step % 16 === 0) stabChord(CHORD_SET[(step / 16) % 4]);
      if (step % 32 === 16) sparklePhrase();
      if (step % 2 === 0) noiseHit(0.03, 8000, 0.05, 'highpass');
      if (step % 8 === 6) tone(880, 0.12, 0.05, 'sine');
      step += 1;
    }, 200);
  }

  // The Solmar radio loop: a local WAV, loaded lazily on the first user
  // gesture only (preload none, so the title screen never fetches it).
  // A rejected play() (headless, autoplay policy) is swallowed — the
  // synth groove above keeps playing and nothing logs an error.
  function startRadio() {
    if (radioOn) return;
    radioOn = true;
    try {
      radio = new Audio('./assets/solmar-loop.wav');
      radio.loop = true;
      radio.preload = 'none';
      radio.volume = muted ? 0 : 0.22;
      const p = radio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      radio = null;
    }
  }

  return {
    unlock() {
      if (ensureCtx()) {
        if (ctx.state === 'suspended') ctx.resume();
        startGroove();
      }
    },
    startRadio() {
      startRadio();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      if (radio) radio.volume = m ? 0 : 0.22;
    },
    isMuted() {
      return muted;
    },
    setEngine(speed01, on) {
      if (!ctx) return;
      engineBus.gain.setTargetAtTime(on ? 0.03 + speed01 * 0.05 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 90, ctx.currentTime, 0.1);
    },
    gunshot() {
      noiseHit(0.14, 1800, 0.5);
      tone(180, 0.08, 0.3, 'square', 60);
    },
    hit() {
      tone(220, 0.12, 0.25, 'square', 110);
    },
    crash() {
      noiseHit(0.3, 500, 0.5);
    },
    cash() {
      tone(880, 0.1, 0.25);
      window.setTimeout(() => tone(1320, 0.18, 0.25), 90);
    },
    mission() {
      [523, 659, 784].forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 0.25), i * 110));
    },
    siren() {
      tone(950, 0.35, 0.12, 'sine', 1400);
    },
    busted() {
      [440, 349, 293].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 0.25, 'triangle'), i * 160));
    },
    pickup() {
      tone(660, 0.12, 0.25, 'sine', 990);
    },
  };
}
