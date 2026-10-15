/* =====================================================================
   MeowChat audio: 8-bit SFX + procedural lo-fi ambience.
   Everything is synthesized with the Web Audio API. No audio files.

   Channels:  sfx    key clicks, typing ticks, chimes
              rain   filtered noise wash + random droplets + slow gusts
              vinyl  tape hiss + randomized crackle
              purr   low brown noise, amplitude-pulsed ~25 Hz, breathing
              music  "Meowbeats": a generative lo-fi radio (drums, jazzy
                     chords, bass, the odd synthesized "mew")
   ===================================================================== */
window.MeowAudio = (() => {
  const KEY = "meow.audio";
  const state = { volume: 0.6, sfx: false, rain: false, vinyl: false, purr: false, music: false };
  const AMBIENCE = ["music", "rain", "vinyl", "purr"];
  let nowPlaying = ""; // Meowbeats track title, while it plays
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}"));
    if (localStorage.getItem("meow.sound") === "on") state.sfx = true; // V2 setting
  } catch { /* storage unavailable: defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };

  let ctx, master, sfxBus, ambBus;
  const running = {}; // channel name → { stop() }
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn({ ...state }));

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = curve(state.volume);
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    const soften = ctx.createBiquadFilter(); // roll off harsh 8-bit highs
    soften.type = "lowpass";
    soften.frequency.value = 2600;
    sfxBus.connect(soften).connect(master);

    ambBus = ctx.createGain();
    ambBus.connect(master);
    return true;
  }
  const curve = v => v * v * 0.9; // perceptual-ish volume curve

  // browsers only start audio after a user gesture
  const wake = () => ctx && ctx.state === "suspended" && ctx.resume();
  ["pointerdown", "keydown"].forEach(e => addEventListener(e, wake));

  /* ---------------- noise buffers ---------------- */
  const buffers = {};
  function noise(kind, seconds = 3) {
    const id = kind + seconds;
    if (buffers[id]) return buffers[id];
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === "crackle") d[i] = 0;
      else d[i] = w;
    }
    if (kind === "crackle") {
      // sparse pops with tiny decays; a few bigger ones
      for (let i = 0; i < len; i++) {
        if (Math.random() < 0.0006) {
          const amp = (Math.random() < 0.08 ? 0.9 : 0.35) * (Math.random() < 0.5 ? -1 : 1);
          const n = 8 + Math.floor(Math.random() * 40);
          for (let k = 0; k < n && i + k < len; k++) d[i + k] += amp * Math.exp(-k / (n / 4)) * (Math.random() * 0.6 + 0.4);
        }
      }
    }
    return (buffers[id] = buf);
  }
  function loop(buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = 0;
    s.start(0, Math.random() * buf.duration); // random offset so loops don't line up
    return s;
  }
  function biquad(type, freq, Q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }
  function fader(level) {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(level, ctx.currentTime, 0.6); // gentle fade-in
    g.connect(ambBus);
    return g;
  }
  function stopper(out, sources, timers = []) {
    return {
      stop() {
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
        timers.forEach(clearInterval);
        setTimeout(() => { sources.forEach(s => { try { s.stop(); } catch { /* already stopped */ } }); out.disconnect(); }, 1500);
      },
    };
  }

  /* ---------------- ambience channels ---------------- */
  const CHANNELS = {
    rain() {
      const out = fader(0.55);
      // the wash: band-limited noise with slow gusts
      const wash = loop(noise("white", 4));
      const washGain = ctx.createGain();
      washGain.gain.value = 0.32;
      wash.connect(biquad("highpass", 450)).connect(biquad("lowpass", 3200)).connect(washGain).connect(out);
      const gust = ctx.createOscillator();
      gust.frequency.value = 0.07;
      const gustDepth = ctx.createGain();
      gustDepth.gain.value = 0.12;
      gust.connect(gustDepth).connect(washGain.gain);
      gust.start();
      // droplets: tiny falling sine plinks
      const timer = setInterval(() => {
        if (Math.random() > 0.4) return;
        const t = ctx.currentTime + Math.random() * 0.05;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = 1800 + Math.random() * 2600;
        o.type = "sine";
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.05);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.05, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.08);
      }, 55);
      return stopper(out, [wash, gust], [timer]);
    },

    vinyl() {
      const out = fader(0.5);
      const hiss = loop(noise("white", 3));
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0.06;
      hiss.connect(biquad("highpass", 4200)).connect(hissGain).connect(out);
      const crackle = loop(noise("crackle", 7));
      const crackleGain = ctx.createGain();
      crackleGain.gain.value = 0.85;
      crackle.connect(biquad("bandpass", 2400, 0.6)).connect(crackleGain).connect(out);
      // a little low "turntable" rumble
      const rumble = loop(noise("brown", 3));
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.08;
      rumble.connect(biquad("lowpass", 90)).connect(rumbleGain).connect(out);
      return stopper(out, [hiss, crackle, rumble]);
    },

    purr() {
      const out = fader(0.9);
      const body = loop(noise("brown", 4));
      const amp = ctx.createGain(); // pulsed at purr rate
      amp.gain.value = 0.45;
      const breath = ctx.createGain(); // slow in/out swell
      breath.gain.value = 0.55;
      body.connect(biquad("lowpass", 300)).connect(amp).connect(breath).connect(out);

      const pulse = ctx.createOscillator();
      pulse.type = "triangle";
      pulse.frequency.value = 25;
      const pulseDepth = ctx.createGain();
      pulseDepth.gain.value = 0.45;
      pulse.connect(pulseDepth).connect(amp.gain);

      const lungs = ctx.createOscillator();
      lungs.frequency.value = 0.32; // one breath ≈ 3 s
      const lungDepth = ctx.createGain();
      lungDepth.gain.value = 0.4;
      lungs.connect(lungDepth).connect(breath.gain);
      const rateDepth = ctx.createGain(); // purr speeds up slightly on the inhale
      rateDepth.gain.value = 3;
      lungs.connect(rateDepth).connect(pulse.frequency);

      pulse.start();
      lungs.start();
      return stopper(out, [body, pulse, lungs]);
    },

    music() {
      const out = fader(0.6);
      const mix = ctx.createGain(); // everything → dusty lowpass → out
      mix.connect(biquad("lowpass", 3200, 0.5)).connect(out);

      // tape wow: slowly drifts the pitch of chords + bass a few cents
      const wow = ctx.createOscillator();
      wow.frequency.value = 0.33;
      const wowDepth = ctx.createGain();
      wowDepth.gain.value = 7;
      wow.connect(wowDepth);
      wow.start();

      const hz = midi => 440 * 2 ** ((midi - 69) / 12);
      const noiseBuf = noise("white", 1);
      const env = (g, t, peak, attack, hold, release) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.setValueAtTime(peak, t + attack + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
        return t + attack + hold + release;
      };

      /* ---- instruments ---- */
      const kick = t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(115, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        o.connect(g).connect(mix);
        o.start(t); o.stop(env(g, t, 0.55, 0.004, 0.02, 0.28) + 0.05);
      };
      const snare = t => {
        const n = ctx.createBufferSource(), g = ctx.createGain();
        n.buffer = noiseBuf;
        n.connect(biquad("bandpass", 1900, 0.8)).connect(g).connect(mix);
        n.start(t, Math.random() * 0.5); n.stop(env(g, t, 0.22, 0.002, 0.01, 0.17) + 0.05);
        const o = ctx.createOscillator(), og = ctx.createGain(); // body
        o.type = "triangle"; o.frequency.value = 185;
        o.connect(og).connect(mix);
        o.start(t); o.stop(env(og, t, 0.12, 0.002, 0.005, 0.08) + 0.05);
      };
      const hat = (t, vel) => {
        const n = ctx.createBufferSource(), g = ctx.createGain();
        n.buffer = noiseBuf;
        n.connect(biquad("highpass", 7200, 0.7)).connect(g).connect(mix);
        n.start(t, Math.random() * 0.5); n.stop(env(g, t, 0.05 * vel, 0.001, 0.004, 0.035) + 0.05);
      };
      const keys = (t, notes, dur, vel = 1) => { // soft electric-piano chord
        const bus = ctx.createGain();
        bus.connect(biquad("lowpass", 1500, 0.6)).connect(mix);
        const end = env(bus, t, 0.09 * vel, 0.03, dur * 0.6, dur * 0.6);
        notes.forEach((m, i) => [-6, 6].forEach((cents, j) => {
          const o = ctx.createOscillator();
          o.type = j ? "sine" : "triangle";
          o.frequency.value = hz(m);
          o.detune.value = cents;
          wowDepth.connect(o.detune);
          o.connect(bus);
          o.start(t + i * 0.012); // a lazy strum
          o.stop(end + 0.05);
        }));
      };
      const bass = (t, m, dur) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = hz(m);
        wowDepth.connect(o.detune);
        o.connect(biquad("lowpass", 380, 0.7)).connect(g).connect(mix);
        o.start(t); o.stop(env(g, t, 0.32, 0.01, dur * 0.5, dur * 0.5) + 0.05);
      };
      const lead = (t, m) => { // a few quiet melody notes
        const o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vd = ctx.createGain();
        o.type = "sine"; o.frequency.value = hz(m);
        vib.frequency.value = 5; vd.gain.value = 4; vib.connect(vd).connect(o.frequency);
        o.connect(g).connect(mix);
        const end = env(g, t, 0.05, 0.02, 0.12, 0.5);
        o.start(t); vib.start(t); o.stop(end + 0.05); vib.stop(end + 0.05);
      };
      const mew = t => { // a synthesized "mew": pitch + formant glide
        const o = ctx.createOscillator(), f = biquad("bandpass", 900, 5), g = ctx.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(560, t);
        o.frequency.linearRampToValueAtTime(820, t + 0.12);
        o.frequency.linearRampToValueAtTime(520, t + 0.42);
        f.frequency.setValueAtTime(800, t);
        f.frequency.linearRampToValueAtTime(1500, t + 0.14);
        f.frequency.linearRampToValueAtTime(700, t + 0.42);
        o.connect(f).connect(g).connect(mix);
        o.start(t); o.stop(env(g, t, 0.09, 0.04, 0.14, 0.26) + 0.05);
      };

      /* ---- the "radio": three tracks, rotating every 24 bars ---- */
      const TRACKS = [
        { title: "tuna rain", bpm: 76, prog: [ // Dm9 G13 Cmaj9 Am9
          [50, [62, 65, 69, 72, 76]], [43, [59, 64, 65, 69]], [48, [59, 64, 67, 71]], [45, [60, 64, 67, 71]]] },
        { title: "window sill dreams", bpm: 70, prog: [ // Fmaj7 Em7 Dm7 Cmaj7
          [41, [64, 67, 69, 72]], [40, [62, 67, 71, 74]], [50, [60, 65, 69, 72]], [48, [59, 64, 67, 71]]] },
        { title: "nap at 3pm", bpm: 82, prog: [ // Am7 D9 Gmaj7 Cmaj7
          [45, [60, 64, 67, 69]], [50, [60, 64, 66, 69]], [43, [59, 62, 66, 67]], [48, [59, 64, 67, 71]]] },
      ];
      let track = Math.floor(Math.random() * TRACKS.length);
      let step = 0, bar = 0, next = ctx.currentTime + 0.15;
      const announce = () => { nowPlaying = TRACKS[track].title; emit(); };
      announce();

      function schedule(i, t, sixteenth) {
        const { prog } = TRACKS[track];
        const [root, chord] = prog[bar % prog.length];
        const at = t + (i % 2 ? sixteenth * 0.18 : 0); // lazy, swung off-beats
        if (i === 0 || i === 10) kick(at);
        if (i === 7 && Math.random() < 0.3) kick(at);        // ghost kick
        if (i === 4 || i === 12) snare(at);
        if (i % 2 === 0) hat(at, i % 4 === 0 ? 1 : 0.6);
        else if (Math.random() < 0.25) hat(at, 0.35);        // shuffle
        if (i === 0) keys(at, chord, sixteenth * 14);
        if (i === 8 && Math.random() < 0.5) keys(at, chord.slice(1), sixteenth * 6, 0.6);
        if (i === 0) bass(at, root, sixteenth * 6);
        if (i === 10) bass(at, root + (Math.random() < 0.5 ? 7 : 12), sixteenth * 4);
        if (i % 2 === 0 && i > 0 && Math.random() < 0.16) lead(at, chord[Math.floor(Math.random() * chord.length)] + 12);
        if (i === 6 && bar % 4 === 3 && Math.random() < 0.7) mew(at);
      }

      // look-ahead scheduler (further ahead when the tab is in the background,
      // because browsers slow timers there)
      const timer = setInterval(() => {
        const sixteenth = 60 / TRACKS[track].bpm / 4;
        const ahead = document.hidden ? 1.5 : 0.2;
        if (next < ctx.currentTime) next = ctx.currentTime + 0.05; // after a suspend, don't burst
        while (next < ctx.currentTime + ahead) {
          schedule(step, next, sixteenth);
          next += sixteenth;
          if (++step === 16) {
            step = 0;
            if (++bar % 24 === 0) { track = (track + 1) % TRACKS.length; announce(); }
          }
        }
      }, 25);

      const s = stopper(out, [wow], [timer]);
      return { stop() { s.stop(); nowPlaying = ""; emit(); } };
    },
  };

  function sync(name) {
    const want = state[name] && !paused;
    if (want && !running[name]) {
      if (!init()) return;
      wake();
      running[name] = CHANNELS[name]();
    } else if (!want && running[name]) {
      running[name].stop();
      delete running[name];
    }
  }

  let paused = false;

  /* ---------------- 8-bit SFX ---------------- */
  function tone(freq, { type = "square", dur = 0.05, vol = 0.04, at = 0, attack = 0.003 } = {}) {
    if (!state.sfx || !ctx) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  let lastKey = 0;

  const api = {
    get state() { return { ...state }; },
    get anyOn() { return state.sfx || AMBIENCE.some(ch => state[ch]); },
    get nowPlaying() { return nowPlaying; },
    onChange(fn) { listeners.add(fn); },

    set(name, on) {
      state[name] = !!on;
      if (name === "sfx" && on) { init(); wake(); }
      else if (name !== "sfx") sync(name);
      save();
      emit();
    },
    setVolume(v) {
      state.volume = Math.min(1, Math.max(0, v));
      if (ctx) master.gain.setTargetAtTime(curve(state.volume), ctx.currentTime, 0.05);
      save();
      emit();
    },
    // used while the user has "stepped away"
    pauseAmbience() { paused = true; AMBIENCE.forEach(sync); },
    resumeAmbience() { paused = false; AMBIENCE.forEach(sync); },
    restore() { // re-start saved channels (they stay silent until the first gesture)
      if (state.sfx) init();
      AMBIENCE.forEach(sync);
    },

    key() {
      const now = performance.now();
      if (now - lastKey < 35) return;
      lastKey = now;
      tone(1300 + Math.random() * 700, { dur: 0.025, vol: 0.025 });
    },
    tick() { tone(1700 + Math.random() * 900, { dur: 0.018, vol: 0.01 }); },
    send() { tone(660, { dur: 0.06, vol: 0.035 }); tone(990, { dur: 0.08, vol: 0.035, at: 0.06 }); },
    chime({ type, notes, gap, vol }) {
      notes.forEach((f, i) => tone(f, { type, dur: 1.1, vol, at: i * gap, attack: 0.012 }));
    },
    release() { api.chime({ type: "sine", notes: [523.25, 659.25, 783.99, 1046.5, 1318.5], gap: 0.16, vol: 0.055 }); },
    shimmer() { api.chime({ type: "triangle", notes: [1568, 1975.5, 2349.3, 2637, 3136], gap: 0.09, vol: 0.03 }); },
  };
  return api;
})();
