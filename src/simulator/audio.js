function createAudioController({ volume = 0.45, muted = false } = {}) {
  let context = null;
  let master = null;
  let destroyed = false;

  function ensureContext() {
    if (destroyed) return null;
    if (!context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(context.destination);
    }
    return context;
  }

  async function resume() {
    const ctx = ensureContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  }

  function tone({ frequency = 220, endFrequency = frequency, duration = 0.08, type = "square", gain = 0.12 } = {}) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running" || muted) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.012, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  function noise({ duration = 0.07, gain = 0.07 } = {}) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running" || muted) return;
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
    const source = ctx.createBufferSource();
    const envelope = ctx.createGain();
    envelope.gain.value = gain;
    source.buffer = buffer;
    source.connect(envelope);
    envelope.connect(master);
    source.start();
  }

  function play(name) {
    switch (name) {
      case "throw": tone({ frequency: 520, endFrequency: 180, duration: 0.055, gain: 0.08 }); break;
      case "hit": noise({ duration: 0.045, gain: 0.055 }); break;
      case "enemy-down": tone({ frequency: 150, endFrequency: 55, duration: 0.16, gain: 0.1 }); break;
      case "hurt": tone({ frequency: 92, endFrequency: 62, duration: 0.14, type: "sawtooth", gain: 0.11 }); break;
      case "pickup": tone({ frequency: 330, endFrequency: 880, duration: 0.12, type: "square", gain: 0.07 }); break;
      case "slip": tone({ frequency: 440, endFrequency: 990, duration: 0.24, type: "triangle", gain: 0.09 }); break;
      case "door": tone({ frequency: 80, endFrequency: 45, duration: 0.22, type: "sawtooth", gain: 0.06 }); break;
      case "shuffle": noise({ duration: 0.18, gain: 0.045 }); break;
      case "victory":
        tone({ frequency: 392, endFrequency: 523, duration: 0.18, type: "triangle", gain: 0.08 });
        window.setTimeout(() => tone({ frequency: 523, endFrequency: 784, duration: 0.25, type: "triangle", gain: 0.08 }), 150);
        break;
      default: break;
    }
  }

  function setVolume(next) {
    volume = Math.max(0, Math.min(1, Number(next) || 0));
    if (master) master.gain.value = muted ? 0 : volume;
  }

  function setMuted(next) {
    muted = Boolean(next);
    if (master) master.gain.value = muted ? 0 : volume;
  }

  function isMuted() {
    return muted;
  }

  function suspend() {
    if (context && context.state === "running") context.suspend();
  }

  function destroy() {
    destroyed = true;
    if (master) master.disconnect();
    if (context && context.state !== "closed") context.close();
    master = null;
    context = null;
  }

  return { resume, play, setVolume, setMuted, isMuted, suspend, destroy };
}

export { createAudioController };
