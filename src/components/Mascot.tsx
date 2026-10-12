"use client";

import { createContext, useContext } from "react";
import { AVATARS, DEFAULT_AVATAR, type AvatarKey } from "@/lib/types";

/** userId → 头像 key。layout 注入一次，全站的 Mascot 自动跟随 */
export const AvatarContext = createContext<Record<string, string>>({});

export type MascotVariant = AvatarKey | "plain" | (string & {});

const KEYS = new Set(AVATARS.map((a) => a.key as string));

/** 站鸟（与 App 图标同款）。variant 可传头像 key，也可传 userId（按用户当前选择渲染） */
export default function Mascot({
  className,
  variant = "plain",
}: {
  className?: string;
  variant?: MascotVariant;
}) {
  const map = useContext(AvatarContext);
  const key: string = KEYS.has(variant)
    ? variant
    : (map[variant] ?? DEFAULT_AVATAR[variant] ?? "plain");

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* 呆毛 */}
      <path d="M32 14c-1.5-5.5 2-9 6.5-10-2.5 3.5-1.5 6.5 1 8.5z" fill="#3E3A52" />
      {/* 翅膀 */}
      <ellipse cx="12.5" cy="37" rx="6" ry="9.5" fill="#332F47" transform="rotate(16 12.5 37)" />
      <ellipse cx="51.5" cy="37" rx="6" ry="9.5" fill="#332F47" transform="rotate(-16 51.5 37)" />
      {/* 脚：三足乌的三趾爪（与 icon.svg 同款，改一处要一起改） */}
      <g stroke="#B3541E" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <line x1="26.5" y1="52" x2="26.5" y2="59" />
        <line x1="37.5" y1="52" x2="37.5" y2="59" />
        <path d="M26.5 59 l-3 3 M26.5 59 l0 3.45 M26.5 59 l3 3" />
        <path d="M37.5 59 l-3 3 M37.5 59 l0 3.45 M37.5 59 l3 3" />
      </g>
      {/* 身体 */}
      <ellipse cx="32" cy="35" rx="20" ry="19" fill="#3E3A52" />
      <ellipse cx="32" cy="42" rx="12.5" ry="9.5" fill="#575170" />

      {/* 围巾画在脸之下、身体之上 */}
      {key === "scarf" && (
        <g>
          <path d="M17 45c9 5 21 5 30 0v5c-9 5-21 5-30 0z" fill="#FF4B4B" />
          <path d="M44 49l5 9-5 1-3-8z" fill="#D63B3B" />
        </g>
      )}

      {/* 眼睛 */}
      <ellipse cx="24.5" cy="31" rx="6" ry="6.6" fill="#fff" />
      <ellipse cx="39.5" cy="31" rx="6" ry="6.6" fill="#fff" />
      <circle cx="25.7" cy="32" r="3.2" fill="#26233A" />
      <circle cx="38.3" cy="32" r="3.2" fill="#26233A" />
      <circle cx="26.9" cy="30.7" r="1.2" fill="#fff" />
      <circle cx="39.5" cy="30.7" r="1.2" fill="#fff" />
      {/* 喙 */}
      <path d="M28.4 37.2h7.2L32 42.4z" fill="#FFB020" />
      {/* 腮红 */}
      <ellipse cx="19.5" cy="38.5" rx="3.2" ry="2" fill="#FF9FB2" opacity="0.85" />
      <ellipse cx="44.5" cy="38.5" rx="3.2" ry="2" fill="#FF9FB2" opacity="0.85" />

      {/* 便利贴：看板版的本命头像。歪着贴在头顶，右下角翘起一点 */}
      {key === "note" && (
        <g transform="rotate(-10 32 14)">
          <path d="M22 6h20v11l-3 3H22z" fill="#FFC800" />
          <path d="M42 17h-3v3z" fill="#E6AC00" />
          <path d="M25 9.6h14M25 12.6h14M25 15.6h9" stroke="#B98F00" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}

      {/* 铅笔：夹在耳后，随时记一笔 */}
      {key === "pencil" && (
        <g transform="translate(46 16) rotate(38)">
          <rect x="-1.9" y="-11" width="3.8" height="17" fill="#FFC800" />
          <rect x="-1.9" y="4" width="3.8" height="2.6" fill="#FF86C8" />
          <path d="M-1.9 -11l1.9-3.4 1.9 3.4z" fill="#FFDCA8" />
          <path d="M-0.75 -13.1l0.75-1.3 0.75 1.3z" fill="#26233A" />
        </g>
      )}

      {key === "cap" && (
        <g>
          <path d="M18.5 21.5a14.5 9.5 0 0 1 27 0c-4.5-2.6-9-3.9-13.5-3.9s-9 1.3-13.5 3.9z" fill="#1CB0F6" />
          <path d="M18.5 21.5a14.5 9.5 0 0 1 27 0" fill="none" stroke="#1899D6" strokeWidth="1.6" />
          <circle cx="32" cy="12.5" r="2.4" fill="#1899D6" />
        </g>
      )}

      {key === "bow" && (
        <g transform="translate(43 15) rotate(18)">
          <path d="M0 0L-8.5 -4.2L-7.5 3.8z" fill="#FF86C8" />
          <path d="M0 0L8.5 -4.2L7.5 3.8z" fill="#FF86C8" />
          <circle cx="0" cy="0" r="2.6" fill="#F452A8" />
        </g>
      )}

      {key === "headphones" && (
        <g>
          <path d="M14 33a18 18 0 0 1 36 0" fill="none" stroke="#2EC4B6" strokeWidth="3.4" strokeLinecap="round" />
          <rect x="9.5" y="30" width="8" height="11" rx="4" fill="#2EC4B6" />
          <rect x="46.5" y="30" width="8" height="11" rx="4" fill="#2EC4B6" />
          <rect x="11.6" y="32.4" width="3.8" height="6.2" rx="1.9" fill="#1B9E93" />
          <rect x="48.6" y="32.4" width="3.8" height="6.2" rx="1.9" fill="#1B9E93" />
        </g>
      )}

      {key === "glasses" && (
        <g stroke="#FFC800" strokeWidth="2.2" fill="none">
          <circle cx="24.5" cy="31" r="8" />
          <circle cx="39.5" cy="31" r="8" />
          <path d="M32.5 30.4h-1M16.5 29l-3.5-2M47.5 29l3.5-2" strokeLinecap="round" />
        </g>
      )}

      {key === "flower" && (
        <g transform="translate(45 16)">
          {[0, 72, 144, 216, 288].map((d) => (
            <ellipse key={d} cx="0" cy="-5.4" rx="2.7" ry="4.2" fill="#FF86C8" transform={`rotate(${d})`} />
          ))}
          <circle cx="0" cy="0" r="2.6" fill="#FFC800" />
        </g>
      )}

      {key === "crown" && (
        <g>
          <path d="M20 20l3.5-8 5 5.5 3.5-8 3.5 8 5-5.5 3.5 8z" fill="#FFC800" />
          <rect x="20" y="19.4" width="24" height="3.4" rx="1.7" fill="#E6AC00" />
          <circle cx="32" cy="10.5" r="2" fill="#FF4B4B" />
        </g>
      )}

      {key === "beanie" && (
        <g>
          <path d="M17 23a15 12 0 0 1 30 0z" fill="#CE82FF" />
          <rect x="15.5" y="21.5" width="33" height="5.4" rx="2.7" fill="#A568CC" />
          <circle cx="32" cy="9.5" r="3.4" fill="#F1F7FB" />
        </g>
      )}

      {key === "hachimaki" && (
        <g>
          <path d="M14 22c5-3.4 31-3.4 36 0l-1.2 4.6c-8-2.8-25.6-2.8-33.6 0z" fill="#F1F7FB" stroke="#D9E2E8" strokeWidth="1" />
          <circle cx="32" cy="23.6" r="2.6" fill="#FF4B4B" />
          <path d="M49 24l6-2-4.4 4.8z" fill="#F1F7FB" />
        </g>
      )}

      {key === "sunglasses" && (
        <g>
          <path d="M15 27h34v3.5a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-6.5 7 7 0 0 1-7 6.5h-2a7 7 0 0 1-7-7z" fill="#26233A" />
          <path d="M15 27h34" stroke="#26233A" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M19 30.5c1.5-1.2 4-1.2 5.5 0M39 30.5c1.5-1.2 4-1.2 5.5 0" stroke="#575170" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
