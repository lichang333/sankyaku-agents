import Mascot, { type MascotVariant } from "@/components/Mascot";

/*
 * 头像圆圈：浅紫底 + 按用户当前选择渲染的三足乌。
 * 这个组合原来在六个地方手写，内外径各配各的——尺寸档位收口到这里，
 * 评论区和负责人选择器里的同一个人不该长得不一样。
 */
const SIZES = {
  sm: { ring: "h-5 w-5", bird: "h-4.5 w-4.5" }, // 卡片角落
  md: { ring: "h-6 w-6", bird: "h-5 w-5" },     // 下拉菜单行
  lg: { ring: "h-7 w-7", bird: "h-6 w-6" },     // 评论、动态流
  xl: { ring: "h-8 w-8", bird: "h-7 w-7" },     // 顶栏用户菜单
} as const;

export default function Avatar({
  userId,
  size = "md",
  className = "",
}: {
  userId: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      className={`flex ${s.ring} shrink-0 items-center justify-center rounded-full bg-beetle/15 ${className}`}
    >
      <Mascot className={s.bird} variant={userId as MascotVariant} />
    </span>
  );
}
