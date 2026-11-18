// Solmar Bay sound — everything is synthesized live with Web Audio.
// This module loads no audio files; the ambient loop is a plain <audio>
// element fed by game/assets/solmar-loop.wav and started by the game once
// the player has interacted with the page.
(function () {
  'use strict';

  // Single shared engine object, exposed as window.SolmarAudio.
  const Engine = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: null,
    sirenHigh: false,
    musicEl: null,

    // Create (or resume) the AudioContext on first use. Called from the
    // game whenever a gesture or a mission start needs sound.
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.startEngine();
      return this.ctx;
    },

    // Mute everything: suspend the context and silence the music element.
    setMuted(m) {
      this.muted = !!m;
      if (this.ctx) {
        if (m) this.ctx.suspend();
        else this.ctx.resume();
      }
      if (this.musicEl) this.musicEl.muted = this.muted;
    },

    // Engine hum that runs for the whole session: a sawtooth through a
    // lowpass filter. Its pitch and loudness follow the car's speed.
    startEngine() {
      const ctx = this.ctx;
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(ctx.destination);
      this.engineOsc.start();
    },

    setEngine(speedNorm, driving) {
      if (!this.ctx || !this.engineOsc) return;
      const t = this.ctx.currentTime;
      const target = driving ? 0.028 + speedNorm * 0.05 : 0.0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.08);
      this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 165, t, 0.1);
    },

    // Two-tone police siren, alternating 660/880 Hz while wanted > 0.
    setSiren(on) {
      if (on && !this.sirenOsc) {
        const ctx = this.ctx;
        if (!ctx) return;
        this.sirenOsc = ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.value = 660;
        this.sirenGain = ctx.createGain();
        this.sirenGain.gain.value = 0.0;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(ctx.destination);
        this.sirenOsc.start();
        this.sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
        this.sirenHigh = false;
        this.sirenTimer = setInterval(() => {
          if (!this.sirenOsc) return;
          this.sirenHigh = !this.sirenHigh;
          this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 880 : 660, this.ctx.currentTime, 0.05);
        }, 420);
      } else if (!on && this.sirenOsc) {
        clearInterval(this.sirenTimer);
        this.sirenTimer = null;
        const osc = this.sirenOsc, gain = this.sirenGain;
        gain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.1);
        setTimeout(() => { try { osc.stop(); } catch (e) {} }, 400);
        this.sirenOsc = null;
        this.sirenGain = null;
      }
    },

    // One short tone with an exponential decay tail.
    blip(freq, dur, type, vol, when) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (when || 0);
      const o = this.ctx.createOscillator();
      o.type = type || 'square';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    // Short filtered noise burst for crashes; louder = harder hit.
    crash(intensity) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 0.18);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len) * (intensity || 0.5);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      src.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      src.start();
    },

    beep() { this.blip(880, 0.12, 'sine', 0.12); this.blip(1320, 0.14, 'sine', 0.1, 0.1); },
    honk() { this.blip(370, 0.22, 'square', 0.09); this.blip(466, 0.22, 'square', 0.07, 0.02); },
    pickup() { this.blip(660, 0.1, 'sine', 0.12); this.blip(990, 0.16, 'sine', 0.12, 0.09); },

    winJingle() {
      const notes = [523, 659, 784, 1047, 784, 1047];
      notes.forEach((n, i) => this.blip(n, 0.22, 'triangle', 0.12, i * 0.13));
    },

    bustedSting() {
      const notes = [392, 330, 262, 196];
      notes.forEach((n, i) => this.blip(n, 0.3, 'sawtooth', 0.08, i * 0.18));
    },

    // Ambient music loop (the generated wav). Starts on first user gesture.
    startMusic(url) {
      if (this.musicEl) return;
      const el = new Audio(url);
      el.loop = true;
      el.volume = 0.32;
      el.muted = this.muted;
      this.musicEl = el;
      const play = () => el.play().catch(() => {});
      document.addEventListener('pointerdown', play, { once: true });
      document.addEventListener('keydown', play, { once: true });
      play();
    }
  };

  window.SolmarAudio = Engine;
})();
