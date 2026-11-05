"use client";

import React from "react";
import { CardCode } from "@/lib/types";
import {
  getPistiSpecialTier,
  getSuitSymbol,
  isRedSuit,
  parseCard,
} from "@/lib/game-engine";

interface PlayingCardProps {
  card?: CardCode;
  faceDown?: boolean;
  highlightSpecial?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

export function PlayingCard({
  card,
  faceDown = false,
  highlightSpecial = false,
  onClick,
  disabled = false,
  size = "md",
  className = "",
  style,
}: PlayingCardProps) {
  const dimensions = {
    sm: "w-16 h-24 rounded-lg",
    md: "w-20 h-28 sm:w-24 sm:h-36 rounded-xl",
    lg: "w-24 h-36 sm:w-28 sm:h-40 rounded-xl",
  }[size];

  const cornerRankSize = {
    sm: "text-xs",
    md: "text-sm sm:text-base",
    lg: "text-base sm:text-lg",
  }[size];

  const cornerSuitSize = {
    sm: "text-[10px]",
    md: "text-xs sm:text-sm",
    lg: "text-xs sm:text-sm",
  }[size];

  const centerSuitSize = {
    sm: "text-2xl",
    md: "text-3xl sm:text-4xl",
    lg: "text-4xl sm:text-5xl",
  }[size];

  if (faceDown || !card) {
    return (
      <div
        style={style}
        className={`relative select-none shrink-0 ${dimensions} card-back-pattern border-2 border-amber-300/60 shadow-xl ${className}`}
      >
        <div className="absolute inset-1.5 rounded-md border border-amber-400/30 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-300/40 flex items-center justify-center text-amber-200 text-xs font-serif">
            ♠
          </div>
        </div>
      </div>
    );
  }

  const { suit, rank } = parseCard(card);
  const symbol = getSuitSymbol(suit);
  const red = isRedSuit(suit);
  const tier = highlightSpecial ? getPistiSpecialTier(card) : "normal";

  const tierStyles =
    tier === "gold"
      ? "bg-gradient-to-br from-amber-100 via-yellow-200 to-amber-400 border-2 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.45)]"
      : tier === "silver"
      ? "bg-gradient-to-br from-slate-50 via-zinc-200 to-slate-300 border-2 border-slate-400 shadow-[0_0_15px_rgba(148,163,184,0.35)]"
      : "bg-[#faf8f4] border border-stone-300 shadow-xl";

  const isInteractive = Boolean(onClick) && !disabled;

  const interactiveStyles = isInteractive
    ? "cursor-pointer hover:-translate-y-2.5 hover:shadow-2xl hover:border-amber-400 active:translate-y-0"
    : onClick && disabled
    ? "opacity-60 cursor-not-allowed"
    : "";

  const textColor = red ? "text-rose-600" : "text-slate-900";

  const content = (
    <>
      {/* Top Left Corner Index */}
      <div
        className={`absolute top-1.5 left-2 flex flex-col items-center leading-none font-bold pointer-events-none ${textColor}`}
      >
        <span className={`${cornerRankSize} font-mono tracking-tighter`}>
          {rank}
        </span>
        <span className={cornerSuitSize}>{symbol}</span>
      </div>

      {/* Center Suit Medallion */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none ${centerSuitSize} leading-none ${textColor}`}
      >
        {symbol}
      </div>

      {/* Bottom Right Corner Index */}
      <div
        className={`absolute bottom-1.5 right-2 flex flex-col items-center leading-none font-bold rotate-180 pointer-events-none ${textColor}`}
      >
        <span className={`${cornerRankSize} font-mono tracking-tighter`}>
          {rank}
        </span>
        <span className={cornerSuitSize}>{symbol}</span>
      </div>

      {/* Subtle inner decorative border */}
      <div className="pointer-events-none absolute inset-1 rounded-lg border border-black/5" />
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        style={style}
        className={`group relative select-none shrink-0 ${dimensions} ${tierStyles} ${interactiveStyles} transition-transform duration-200 ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      style={style}
      className={`relative select-none shrink-0 ${dimensions} ${tierStyles} ${className}`}
    >
      {content}
    </div>
  );
}
