(() => {
  /* Procedural sound engine (WebAudio, no audio files):
   * - a soft two-note chime when the companion arrives
   * - ambient focus soundscapes (rain / storm / sea / forest / birds / cafe)
   *   synthesized from filtered noise and small oscillator events.
   * Everything is generated locally; volumes are conservative on purpose.
   * Chromium may hold the AudioContext suspended until the user interacts
   * with the app once; we resume on the first pointerdown anywhere. */
  let ctx = null;
  let master = null;
  let volume = 0.7;
  let current = null; // { kind, nodes: [], timers: [] }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, true);
    return ctx;
  }

  function noiseBuffer(seconds, brown = false) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  function noiseSource({ brown = false, freq = 1000, type = 'lowpass', gain = 0.2, q = 0.6 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4, brown);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start();
    return { src, filter, g };
  }

  function every(session, ms, fn) {
    const id = setInterval(fn, ms);
    session.timers.push(id);
    return id;
  }

  function chirp(session, base = 2600) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = base + Math.random() * 700;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.16);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  const builders = {
    rain(session) {
      session.nodes.push(noiseSource({ freq: 1300, gain: 0.16 }));
      session.nodes.push(noiseSource({ freq: 3400, type: 'bandpass', gain: 0.035, q: 0.4 }));
    },
    storm(session) {
      session.nodes.push(noiseSource({ freq: 850, gain: 0.17 }));
      const thunder = () => {
        if (!ctx || current !== session) return;
        const n = noiseSource({ brown: true, freq: 110, gain: 0 });
        const t = ctx.currentTime;
        n.g.gain.linearRampToValueAtTime(0.5, t + 1.1);
        n.g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
        setTimeout(() => { try { n.src.stop(); } catch { /* already stopped */ } }, 4200);
        session.timers.push(setTimeout(thunder, 9000 + Math.random() * 14000));
      };
      session.timers.push(setTimeout(thunder, 2500));
    },
    sea(session) {
      const n = noiseSource({ freq: 480, gain: 0.12 });
      session.nodes.push(n);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.09;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(n.filter.frequency);
      lfo.start();
      session.nodes.push({ src: lfo, g: null, filter: null });
    },
    forest(session) {
      session.nodes.push(noiseSource({ freq: 640, gain: 0.05 }));
      const sing = () => { chirp(session, 2400); session.timers.push(setTimeout(sing, 1800 + Math.random() * 3800)); };
      session.timers.push(setTimeout(sing, 900));
    },
    birds(session) {
      session.nodes.push(noiseSource({ freq: 900, gain: 0.018 }));
      const sing = () => {
        chirp(session, 2500);
        if (Math.random() < 0.5) setTimeout(() => chirp(session, 2900), 260);
        session.timers.push(setTimeout(sing, 1600 + Math.random() * 4200));
      };
      session.timers.push(setTimeout(sing, 500));
    },
    cafe(session) {
      session.nodes.push(noiseSource({ brown: true, freq: 380, gain: 0.1 }));
      const clink = () => {
        if (!ctx || current !== session) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 1750 + Math.random() * 500;
        g.gain.setValueAtTime(0.028, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.1);
        session.timers.push(setTimeout(clink, 6000 + Math.random() * 9000));
      };
      session.timers.push(setTimeout(clink, 4000));
    }
  };

  function stop() {
    if (!current) return;
    for (const id of current.timers) { clearInterval(id); clearTimeout(id); }
    for (const n of current.nodes) {
      try { n.src && n.src.stop(); } catch { /* already stopped */ }
      try { n.g && n.g.disconnect(); } catch { /* ignore */ }
    }
    current = null;
  }

  function play(kind, vol) {
    if (typeof vol === 'number') setVolume(vol);
    if (!builders[kind]) { stop(); return; }
    if (current && current.kind === kind) return;
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    stop();
    const session = { kind, nodes: [], timers: [] };
    current = session;
    builders[kind](session);
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }

  function chime(cfg = {}) {
    if (cfg.chime === false) return;
    if (typeof cfg.volume === 'number') setVolume(cfg.volume);
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') return; // no user gesture yet: stay silent rather than queue noise
    const t = ctx.currentTime;
    [[880, 0], [1174.66, 0.11]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t + offset);
      g.gain.linearRampToValueAtTime(0.12, t + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.55);
      osc.connect(g).connect(master);
      osc.start(t + offset);
      osc.stop(t + offset + 0.6);
    });
  }

  window.CompanionSounds = {
    chime,
    play,
    stop,
    setVolume,
    playing: () => (current ? current.kind : null)
  };
})();
