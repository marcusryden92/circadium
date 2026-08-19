"use client";

import { useRef, useState } from "react";
import {
  frame,
  video,
  playLayer,
  playButton,
  playLabel,
} from "./TeaserVideo.css";

const VIDEO_SRC =
  "https://res.cloudinary.com/dpxinra2a/video/upload/q_auto/v1787151944/circadium_teaser_swn4s1.mp4";
const POSTER_SRC =
  "https://res.cloudinary.com/dpxinra2a/video/upload/so_0,q_auto/v1787151944/circadium_teaser_swn4s1.jpg";

export function TeaserVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const start = () => {
    setPlaying(true);
    videoRef.current?.play().catch(() => {});
  };

  return (
    <div className={frame}>
      <video
        ref={videoRef}
        className={video}
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        preload="none"
        playsInline
        controls={playing}
      />
      {!playing ? (
        <button
          type="button"
          className={playLayer}
          onClick={start}
          aria-label="Play the two-minute tour"
        >
          <span className={playButton} aria-hidden>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <span className={playLabel}>Watch the two-minute tour</span>
        </button>
      ) : null}
    </div>
  );
}
