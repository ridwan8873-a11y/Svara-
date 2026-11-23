import type { AudioQuality, EQPresetId, Track } from '@/src/types/music';

export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;

export const EQ_PRESETS: Record<EQPresetId, { label: string; gains: number[] }> = {
  flat: { label: 'Flat Studio', gains: [0, 0, 0, 0, 0] },
  bass: { label: 'Bass Mendalam', gains: [5.5, 3.5, 0, 1.0, 2.0] },
  vocal: { label: 'Vokal Jernih', gains: [-1.5, 1.0, 3.5, 4.0, 1.5] },
  acoustic: { label: 'Akustik Hangat', gains: [2.5, 1.5, 0.5, 2.5, 3.0] },
  electronic: { label: 'Elektronik Punch', gains: [4.5, 2.0, -1.0, 3.0, 4.5] },
  custom: { label: 'Kustom', gains: [0, 0, 0, 0, 0] },
};

export type EngineEventName =
  | 'play'
  | 'pause'
  | 'waiting'
  | 'canplay'
  | 'ended'
  | 'timeupdate'
  | 'loadedmetadata'
  | 'durationchange'
  | 'seeked'
  | 'emptied';

type DeckIndex = 0 | 1;

interface DeckState {
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  deckGain: GainNode | null;
  objectUrl: string | null;
  loadedSrc: string | null;
}

class SvaraAudioEngine {
  private decks: [DeckState, DeckState];
  private activeIndex: DeckIndex = 0;
  private ctx: AudioContext | null = null;
  private preampNode: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private normalizerComp: DynamicsCompressorNode | null = null;
  private normalizerMakeup: GainNode | null = null;
  private presenceFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;

  private quality: AudioQuality = 'hires';
  private eqGains: number[] = [0, 0, 0, 0, 0];
  private volume = 0.85;
  private muted = false;
  private lowRamMode = false;
  private volumeNormalization = true;
  private wakeLockRelease: (() => void) | null = null;
  private crossfadeTimer: number | null = null;
  private listeners = new Map<EngineEventName, Set<() => void>>();

  constructor() {
    const createDeck = (idx: DeckIndex): DeckState => {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');

      const events: EngineEventName[] = [
        'play',
        'pause',
        'waiting',
        'canplay',
        'ended',
        'timeupdate',
        'loadedmetadata',
        'durationchange',
        'seeked',
        'emptied',
      ];
      for (const evt of events) {
        audio.addEventListener(evt, () => {
          if (this.activeIndex !== idx) return;
          if (evt === 'play') {
            if (this.ctx && this.ctx.state === 'suspended') {
              void this.ctx.resume().catch(() => {});
            }
            this.acquireBackgroundLock();
          } else if (evt === 'pause' || evt === 'ended') {
            this.releaseBackgroundLock();
          }
          const set = this.listeners.get(evt);
          if (set) {
            for (const fn of set) fn();
          }
        });
      }

      return {
        audio,
        sourceNode: null,
        deckGain: null,
        objectUrl: null,
        loadedSrc: null,
      };
    };

    this.decks = [createDeck(0), createDeck(1)];

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const active = this.getElement();
        if (this.ctx && this.ctx.state === 'suspended' && !active.paused) {
          void this.ctx.resume().catch(() => {});
        }
      });
    }
  }

  subscribe(event: EngineEventName, handler: () => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  private acquireBackgroundLock() {
    if (this.wakeLockRelease) return;
    if (typeof navigator !== 'undefined' && 'locks' in navigator && typeof navigator.locks.request === 'function') {
      try {
        let releaseFn: (() => void) | null = null;
        const holdPromise = new Promise<void>((resolve) => {
          releaseFn = resolve;
        });
        this.wakeLockRelease = () => {
          if (releaseFn) {
            releaseFn();
            releaseFn = null;
          }
          this.wakeLockRelease = null;
        };
        void navigator.locks
          .request('svara-active-audio-session', { mode: 'shared', ifAvailable: true }, async () => {
            await holdPromise;
          })
          .catch(() => {});
      } catch {
        // Ignore unsupported
      }
    }
  }

  private releaseBackgroundLock() {
    if (this.wakeLockRelease) {
      this.wakeLockRelease();
      this.wakeLockRelease = null;
    }
  }

  private ensureWebAudio() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx({ latencyHint: 'playback' });

      const preampNode = ctx.createGain();
      preampNode.gain.value = this.computePreampGain(this.eqGains);

      const filters = EQ_FREQUENCIES.map((freq, index) => {
        const filter = ctx.createBiquadFilter();
        filter.type =
          index === 0 ? 'lowshelf' : index === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.05;
        filter.gain.value = this.eqGains[index] ?? 0;
        return filter;
      });

      // Loudness Normalization stage (consistent perceived LUFS across tracks)
      const normalizerComp = ctx.createDynamicsCompressor();
      const normalizerMakeup = ctx.createGain();
      this.applyNormalizationParams(normalizerComp, normalizerMakeup, this.volumeNormalization);

      // Hi-Res / Lossless clarity shelf
      const presenceFilter = ctx.createBiquadFilter();
      presenceFilter.type = 'highshelf';
      presenceFilter.frequency.value = 11500;
      presenceFilter.gain.value = this.computePresenceGain(this.quality);

      const compressor = ctx.createDynamicsCompressor();
      this.applyCompressorQuality(compressor, this.quality);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = this.lowRamMode ? 64 : 128;
      analyser.smoothingTimeConstant = 0.82;

      const gainNode = ctx.createGain();
      gainNode.gain.value = this.muted ? 0 : this.volume;

      // Connect shared master chain
      let prev: AudioNode = preampNode;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(normalizerComp);
      normalizerComp.connect(normalizerMakeup);
      normalizerMakeup.connect(presenceFilter);
      presenceFilter.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Connect both decks into preampNode via per-deck GainNodes
      this.decks.forEach((deck, idx) => {
        const src = ctx.createMediaElementSource(deck.audio);
        const dg = ctx.createGain();
        dg.gain.value = idx === this.activeIndex ? 1 : 0;
        src.connect(dg);
        dg.connect(preampNode);
        deck.sourceNode = src;
        deck.deckGain = dg;
      });

      this.ctx = ctx;
      this.preampNode = preampNode;
      this.filters = filters;
      this.normalizerComp = normalizerComp;
      this.normalizerMakeup = normalizerMakeup;
      this.presenceFilter = presenceFilter;
      this.compressor = compressor;
      this.analyser = analyser;
      this.gainNode = gainNode;
      this.frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      // Native HTMLAudioElement playback fallback
    }
  }

  private computePreampGain(gains: number[]): number {
    const maxBoost = Math.max(0, ...gains);
    const trimDb = maxBoost > 2 ? -Math.min(4.5, (maxBoost - 2) * 0.45) : 0;
    return Math.pow(10, trimDb / 20);
  }

  private computePresenceGain(quality: AudioQuality): number {
    if (quality === 'flac' || quality === 'alac') return 2.1;
    if (quality === 'hires') return 1.8;
    if (quality === 'high') return 0.6;
    return 0;
  }

  private applyNormalizationParams(
    comp: DynamicsCompressorNode,
    makeup: GainNode,
    enabled: boolean
  ) {
    if (enabled) {
      comp.threshold.value = -20;
      comp.knee.value = 18;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.008;
      comp.release.value = 0.28;
      makeup.gain.value = 1.24;
    } else {
      comp.threshold.value = 0;
      comp.knee.value = 0;
      comp.ratio.value = 1;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      makeup.gain.value = 1.0;
    }
  }

  private applyCompressorQuality(comp: DynamicsCompressorNode, quality: AudioQuality) {
    if (quality === 'flac' || quality === 'alac' || quality === 'hires') {
      comp.threshold.value = -14;
      comp.knee.value = 14;
      comp.ratio.value = 2.4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
    } else if (quality === 'high') {
      comp.threshold.value = -10;
      comp.knee.value = 10;
      comp.ratio.value = 1.8;
      comp.attack.value = 0.005;
      comp.release.value = 0.24;
    } else {
      comp.threshold.value = -2;
      comp.knee.value = 6;
      comp.ratio.value = 1.2;
    }
  }

  private clearCrossfadeTimer() {
    if (this.crossfadeTimer !== null) {
      window.clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
  }

  private assignDeckSrc(deck: DeckState, srcUrl: string) {
    if (deck.objectUrl && deck.objectUrl !== srcUrl) {
      URL.revokeObjectURL(deck.objectUrl);
      deck.objectUrl = null;
    }
    if (srcUrl.startsWith('blob:')) {
      deck.objectUrl = srcUrl;
    }
    deck.loadedSrc = srcUrl;
    deck.audio.src = srcUrl;
    deck.audio.load();
  }

  getElement(): HTMLAudioElement {
    return this.decks[this.activeIndex].audio;
  }

  private getStandbyDeck(): { deck: DeckState; idx: DeckIndex } {
    const idx: DeckIndex = this.activeIndex === 0 ? 1 : 0;
    return { deck: this.decks[idx], idx };
  }

  preloadNext(srcUrl: string) {
    if (!srcUrl) return;
    const { deck } = this.getStandbyDeck();
    if (deck.loadedSrc === srcUrl) return;
    try {
      deck.audio.pause();
      deck.audio.currentTime = 0;
      this.assignDeckSrc(deck, srcUrl);
    } catch {
      // Ignore preload errors
    }
  }

  isNextPreloaded(srcUrl: string): boolean {
    const { deck } = this.getStandbyDeck();
    return Boolean(srcUrl && deck.loadedSrc === srcUrl && deck.audio.readyState >= 2);
  }

  async loadAndPlay(srcUrl: string, startAtSec = 0) {
    this.ensureWebAudio();
    this.clearCrossfadeTimer();

    // Silence standby deck cleanly
    const { deck: standby } = this.getStandbyDeck();
    standby.audio.pause();
    if (standby.deckGain && this.ctx) {
      standby.deckGain.gain.cancelScheduledValues(this.ctx.currentTime);
      standby.deckGain.gain.setValueAtTime(0, this.ctx.currentTime);
    } else {
      standby.audio.volume = 0;
    }

    const active = this.decks[this.activeIndex];
    if (active.deckGain && this.ctx) {
      active.deckGain.gain.cancelScheduledValues(this.ctx.currentTime);
      active.deckGain.gain.setValueAtTime(1, this.ctx.currentTime);
    } else {
      active.audio.volume = this.muted ? 0 : this.volume;
    }

    this.assignDeckSrc(active, srcUrl);
    if (startAtSec > 0) {
      active.audio.currentTime = startAtSec;
    }
    await active.audio.play();
  }

  async transitionToPreloaded(srcUrl: string, crossfadeSec: number): Promise<boolean> {
    this.ensureWebAudio();
    const { deck: nextDeck, idx: nextIdx } = this.getStandbyDeck();
    const prevDeck = this.decks[this.activeIndex];

    if (nextDeck.loadedSrc !== srcUrl || nextDeck.audio.readyState < 2) {
      await this.loadAndPlay(srcUrl, 0);
      return true;
    }

    this.clearCrossfadeTimer();
    const fadeSec = Math.max(0, Math.min(12, crossfadeSec));

    try {
      nextDeck.audio.currentTime = 0;
      if (this.ctx && nextDeck.deckGain && prevDeck.deckGain) {
        const now = this.ctx.currentTime;
        nextDeck.deckGain.gain.cancelScheduledValues(now);
        prevDeck.deckGain.gain.cancelScheduledValues(now);

        if (fadeSec <= 0.05) {
          nextDeck.deckGain.gain.setValueAtTime(1, now);
          prevDeck.deckGain.gain.setValueAtTime(0, now);
          this.activeIndex = nextIdx;
          await nextDeck.audio.play();
          prevDeck.audio.pause();
          prevDeck.audio.currentTime = 0;
          return true;
        }

        // Smooth equal-feel crossfade over fadeSec
        nextDeck.deckGain.gain.setValueAtTime(0.001, now);
        nextDeck.deckGain.gain.linearRampToValueAtTime(1, now + fadeSec);
        prevDeck.deckGain.gain.setValueAtTime(prevDeck.deckGain.gain.value || 1, now);
        prevDeck.deckGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);

        this.activeIndex = nextIdx;
        await nextDeck.audio.play();

        const stopAt = Date.now() + fadeSec * 1000 + 80;
        this.crossfadeTimer = window.setInterval(() => {
          if (Date.now() >= stopAt) {
            this.clearCrossfadeTimer();
            prevDeck.audio.pause();
            prevDeck.audio.currentTime = 0;
          }
        }, 120);
        return true;
      }

      // Fallback without Web Audio GainNodes
      const targetVol = this.muted ? 0 : this.volume;
      if (fadeSec <= 0.05) {
        nextDeck.audio.volume = targetVol;
        this.activeIndex = nextIdx;
        await nextDeck.audio.play();
        prevDeck.audio.pause();
        prevDeck.audio.currentTime = 0;
        return true;
      }

      nextDeck.audio.volume = 0;
      this.activeIndex = nextIdx;
      await nextDeck.audio.play();

      const steps = Math.max(8, Math.round(fadeSec * 15));
      let step = 0;
      const stepMs = (fadeSec * 1000) / steps;
      this.crossfadeTimer = window.setInterval(() => {
        step += 1;
        const t = Math.min(1, step / steps);
        const curVol = this.muted ? 0 : this.volume;
        nextDeck.audio.volume = curVol * t;
        prevDeck.audio.volume = curVol * (1 - t);
        if (t >= 1) {
          this.clearCrossfadeTimer();
          prevDeck.audio.pause();
          prevDeck.audio.currentTime = 0;
        }
      }, stepMs);
      return true;
    } catch {
      await this.loadAndPlay(srcUrl, 0);
      return true;
    }
  }

  async play() {
    this.ensureWebAudio();
    await this.getElement().play();
  }

  pause() {
    this.clearCrossfadeTimer();
    this.decks[0].audio.pause();
    this.decks[1].audio.pause();
  }

  seek(timeSec: number) {
    if (!Number.isFinite(timeSec)) return;
    const el = this.getElement();
    const maxDur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : timeSec;
    el.currentTime = Math.max(0, Math.min(timeSec, maxDur));
  }

  setVolume(vol: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.muted = muted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    } else {
      this.getElement().volume = muted ? 0 : this.volume;
    }
  }

  setEQGains(gains: number[]) {
    this.eqGains = [...gains];
    if (this.preampNode && this.ctx) {
      this.preampNode.gain.setTargetAtTime(
        this.computePreampGain(gains),
        this.ctx.currentTime,
        0.03
      );
    }
    this.filters.forEach((filter, idx) => {
      const val = gains[idx] ?? 0;
      if (this.ctx) {
        filter.gain.setTargetAtTime(val, this.ctx.currentTime, 0.03);
      } else {
        filter.gain.value = val;
      }
    });
  }

  setQuality(quality: AudioQuality) {
    this.quality = quality;
    if (this.compressor) {
      this.applyCompressorQuality(this.compressor, quality);
    }
    if (this.presenceFilter && this.ctx) {
      this.presenceFilter.gain.setTargetAtTime(
        this.computePresenceGain(quality),
        this.ctx.currentTime,
        0.03
      );
    }
  }

  setVolumeNormalization(enabled: boolean) {
    this.volumeNormalization = enabled;
    if (this.normalizerComp && this.normalizerMakeup && this.ctx) {
      this.applyNormalizationParams(this.normalizerComp, this.normalizerMakeup, enabled);
    }
  }

  setLowRamMode(enabled: boolean) {
    this.lowRamMode = enabled;
    if (this.analyser) {
      this.analyser.fftSize = enabled ? 64 : 128;
    }
  }

  getFrequencyBars(barCount = 32): number[] {
    if (this.lowRamMode || !this.analyser || !this.frequencyData) {
      return new Array(barCount).fill(0.15);
    }
    this.analyser.getByteFrequencyData(this.frequencyData);
    const out: number[] = [];
    const usableBins = Math.min(this.frequencyData.length, 48);
    const step = Math.max(1, Math.floor(usableBins / barCount));
    for (let i = 0; i < barCount; i++) {
      const val = this.frequencyData[Math.min(i * step, usableBins - 1)] ?? 0;
      out.push(val / 255);
    }
    return out;
  }

  isCastSupported(): boolean {
    const el = this.getElement() as HTMLAudioElement & {
      remote?: { prompt?: () => Promise<void> };
      webkitShowPlaybackTargetPicker?: () => void;
    };
    return Boolean(el.remote?.prompt || el.webkitShowPlaybackTargetPicker);
  }

  async promptCastDevice(): Promise<'connected' | 'unsupported' | 'cancelled'> {
    const el = this.getElement() as HTMLAudioElement & {
      remote?: { prompt?: () => Promise<void>; state?: string };
      webkitShowPlaybackTargetPicker?: () => void;
    };
    if (el.remote?.prompt) {
      try {
        await el.remote.prompt();
        return 'connected';
      } catch (err) {
        const name = (err as Error)?.name || '';
        if (name === 'NotSupportedError') return 'unsupported';
        return 'cancelled';
      }
    }
    if (el.webkitShowPlaybackTargetPicker) {
      try {
        el.webkitShowPlaybackTargetPicker();
        return 'connected';
      } catch {
        return 'cancelled';
      }
    }
    return 'unsupported';
  }

  updateMediaSession(
    track: Track,
    artworkSrc: string,
    handlers: {
      onPlay: () => void;
      onPause: () => void;
      onStop: () => void;
      onNext: () => void;
      onPrev: () => void;
      onSeek: (time: number) => void;
    }
  ) {
    if (!('mediaSession' in navigator)) return;

    try {
      let safeArtworkUrl = '/pwa-512x512.png';
      if (artworkSrc) {
        if (artworkSrc.startsWith('blob:') || artworkSrc.startsWith('/')) {
          safeArtworkUrl = artworkSrc;
        } else {
          safeArtworkUrl = `/api/music/artwork?url=${encodeURIComponent(artworkSrc)}`;
        }
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Svara Music',
        artwork: [
          { src: safeArtworkUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: safeArtworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      const safeSetHandler = (
        action: MediaSessionAction,
        fn: MediaSessionActionHandler | null
      ) => {
        try {
          navigator.mediaSession.setActionHandler(action, fn);
        } catch {
          // Unsupported action
        }
      };

      safeSetHandler('play', handlers.onPlay);
      safeSetHandler('pause', handlers.onPause);
      safeSetHandler('stop', handlers.onStop);
      safeSetHandler('nexttrack', handlers.onNext);
      safeSetHandler('previoustrack', handlers.onPrev);
      safeSetHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
          handlers.onSeek(details.seekTime);
        }
      });
      safeSetHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        handlers.onSeek(Math.max(0, (this.getElement().currentTime || 0) - offset));
      });
      safeSetHandler('seekforward', (details) => {
        const offset = details.seekOffset || 10;
        const dur = this.getElement().duration;
        const maxDur = Number.isFinite(dur) ? dur : 300;
        handlers.onSeek(Math.min(maxDur, (this.getElement().currentTime || 0) + offset));
      });
    } catch {
      // Unsupported MediaSession
    }
  }

  updateMediaSessionPlaybackState(isPlaying: boolean) {
    if (!('mediaSession' in navigator)) return;
    try {
      const el = this.getElement();
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      const dur = el.duration;
      const pos = el.currentTime;
      const rate = el.playbackRate || 1;
      if (
        'setPositionState' in navigator.mediaSession &&
        Number.isFinite(dur) &&
        dur > 0 &&
        Number.isFinite(pos) &&
        pos >= 0 &&
        Number.isFinite(rate) &&
        rate > 0
      ) {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: rate,
          position: Math.max(0, Math.min(pos, dur)),
        });
      }
    } catch {
      // Ignore position state errors
    }
  }
}

export const audioEngine = new SvaraAudioEngine();
