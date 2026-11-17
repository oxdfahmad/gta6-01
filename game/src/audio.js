// Sound and music: a live WebAudio groove (bass, chords, hats, engine,
// gunshots, sirens, chimes) plus a Solmar Bay radio loop — an original
// synthwave track generated for this game, shipped as a local file under
// game/assets/ and played only after a user gesture. No network, ever.
// Mute with M; starts only after a user gesture.
export function createAudio() {
  let ctx = null, master = null, musicGain = null, engineOsc = null, engineGain = null;
  let muted = false, musicTimer = null, beat = 0;
  let radio = null, radioStarted = false;
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain = ctx.createGain(); engineGain.gain.value = 0; engineOsc.connect(engineGain); engineGain.connect(master); engineOsc.start();
    } catch (e) { return false; }
    return true;
  }
  function noiseBurst(dur, freq, vol, type) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }
  function tone(freq, dur, vol, type, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
  }
  // Simple 8-step groove: root bass notes in A minor with a hat tick,
  // plus a soft chord stab on the bar and a high sparkle every other bar.
  // Am – F – C – G, one chord per two bars, so the loop breathes.
  const BASS = [55, 0, 55, 65.41, 55, 0, 49, 58.27];
  const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [130.81, 164.81, 196], [196, 246.94, 293.66]];
  function chordStab(freqs) {
    if (!ctx || muted) return;
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.10, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      o.connect(g); g.connect(musicGain); o.start(); o.stop(ctx.currentTime + 0.52);
    }
  }
  // Lead sparkle: a short pentatonic phrase every other bar, quiet,
  // so the groove has a top line without fighting the radio loop.
  const LEAD = [440, 523.25, 659.25, 880, 659.25, 523.25];
  function leadPhrase() {
    LEAD.forEach((f, i) => window.setTimeout(() => tone(f, 0.16, 0.05, 'sine'), i * 110));
  }
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const n = BASS[beat % 8];
      if (n) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = n;
        g.gain.setValueAtTime(0.5, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        o.connect(g); g.connect(musicGain); o.start(); o.stop(ctx.currentTime + 0.24); }
      if (beat % 16 === 0) chordStab(CHORDS[(beat / 16) % 4]);
      if (beat % 32 === 16) leadPhrase();
      if (beat % 2 === 0) noiseBurst(0.03, 8000, 0.05, 'highpass');
      if (beat % 8 === 6) tone(880, 0.12, 0.05, 'sine');
      beat += 1;
    }, 190);
  }
  // The Solmar radio loop: a local WAV, loaded lazily on the first user
  // gesture only (preload none, so the title screen never fetches it).
  // A rejected play() (headless, autoplay policy) is swallowed — the
  // synth groove above keeps playing and nothing logs an error.
  function startRadio() {
    if (radioStarted) return;
    radioStarted = true;
    try {
      radio = new Audio('./assets/solmar-loop.wav');
      radio.loop = true; radio.preload = 'none'; radio.volume = muted ? 0 : 0.22;
      const p = radio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { radio = null; }
  }
  return {
    unlock() { if (ensure()) { if (ctx.state === 'suspended') ctx.resume(); startMusic(); } },
    startRadio() { startRadio(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; if (radio) radio.volume = m ? 0 : 0.22; },
    isMuted() { return muted; },
    setEngine(speed01, on) { if (!ctx) return; engineGain.gain.setTargetAtTime(on ? 0.03 + speed01 * 0.05 : 0, ctx.currentTime, 0.1); engineOsc.frequency.setTargetAtTime(50 + speed01 * 90, ctx.currentTime, 0.1); },
    gunshot() { noiseBurst(0.14, 1800, 0.5); tone(180, 0.08, 0.3, 'square', 60); },
    hit() { tone(220, 0.12, 0.25, 'square', 110); },
    crash() { noiseBurst(0.3, 500, 0.5); },
    cash() { tone(880, 0.1, 0.25); window.setTimeout(() => tone(1320, 0.18, 0.25), 90); },
    mission() { [523, 659, 784].forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 0.25), i * 110)); },
    sirenBlip() { tone(950, 0.35, 0.12, 'sine', 1400); },
    busted() { [440, 349, 293].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 0.25, 'triangle'), i * 160)); },
    pickup() { tone(660, 0.12, 0.25, 'sine', 990); },
  };
}
