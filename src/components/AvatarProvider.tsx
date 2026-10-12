"use client";

import { AvatarContext } from "@/components/Mascot";

/** 把 userId → 头像 key 的映射注入到整棵树，Mascot 自动跟随 */
export default function AvatarProvider({
  value,
  children,
}: {
  value: Record<string, string>;
  children: React.ReactNode;
}) {
  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>;
}
