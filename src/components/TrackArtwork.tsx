import React, { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { usePlayer } from '@/src/context/PlayerContext';

interface TrackArtworkProps {
  trackId?: string;
  src?: string;
  alt: string;
  className?: string;
  iconSize?: number;
}

export const TrackArtwork: React.FC<TrackArtworkProps> = ({
  trackId,
  src,
  alt,
  className = 'w-12 h-12 rounded-md',
  iconSize = 20,
}) => {
  const { offlineArtworkMap } = usePlayer();
  const [failed, setFailed] = useState(false);

  const resolvedSrc = (trackId && offlineArtworkMap[trackId]) || src;

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return (
      <div
        className={`${className} bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 flex items-center justify-center shrink-0 overflow-hidden text-zinc-500`}
        aria-label={alt}
      >
        <Disc3 size={iconSize} strokeWidth={1.6} />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-cover shrink-0 bg-zinc-200 dark:bg-zinc-900`}
      loading="lazy"
    />
  );
};
