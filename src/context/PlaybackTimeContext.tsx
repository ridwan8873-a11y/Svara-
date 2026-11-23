import React, { createContext, useContext, useEffect, useState } from 'react';
import { audioEngine } from '@/src/lib/audioEngine';

interface PlaybackTimeContextValue {
  currentTime: number;
  duration: number;
  setManualTime: (sec: number) => void;
}

const PlaybackTimeContext = createContext<PlaybackTimeContextValue | null>(null);

export const PlaybackTimeProvider: React.FC<{
  initialTime?: number;
  children: React.ReactNode;
}> = ({ initialTime = 0, children }) => {
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const syncTime = () => {
      const el = audioEngine.getElement();
      setCurrentTime(el.currentTime || 0);
      audioEngine.updateMediaSessionPlaybackState(!el.paused);
    };

    const syncDuration = () => {
      const el = audioEngine.getElement();
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    };

    const onEmptied = () => {
      setCurrentTime(0);
      setDuration(0);
    };

    const unsubs = [
      audioEngine.subscribe('timeupdate', syncTime),
      audioEngine.subscribe('loadedmetadata', syncDuration),
      audioEngine.subscribe('durationchange', syncDuration),
      audioEngine.subscribe('seeked', syncTime),
      audioEngine.subscribe('emptied', onEmptied),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  return (
    <PlaybackTimeContext.Provider
      value={{
        currentTime,
        duration,
        setManualTime: setCurrentTime,
      }}
    >
      {children}
    </PlaybackTimeContext.Provider>
  );
};

export function usePlaybackTime() {
  const ctx = useContext(PlaybackTimeContext);
  if (!ctx) {
    throw new Error('usePlaybackTime must be used within PlaybackTimeProvider');
  }
  return ctx;
}
