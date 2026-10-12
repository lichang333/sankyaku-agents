"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon, { type IconName } from "@/components/NavIcon";

const TABS: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: "/", label: "看板", icon: "board", match: ["/", "/b"] },
  { href: "/collab", label: "协作", icon: "collab", match: ["/collab"] },
  { href: "/agents", label: "Agents", icon: "agents", match: ["/agents"] },
  { href: "/mine", label: "我的", icon: "mine", match: ["/mine"] },
  { href: "/activity", label: "动态", icon: "activity", match: ["/activity"] },
];

/** 卡片详情页（/c/…）属于「看板」那一支，高亮跟着板走 */
const isActive = (pathname: string, t: (typeof TABS)[number]) =>
  t.href === "/"
    ? pathname === "/" || pathname.startsWith("/b/") || pathname.startsWith("/c/")
    : pathname.startsWith(t.href);

/**
 * 桌面端：并进顶栏的一行，图标与文字横排、尺寸小一号。
 * 手机端：固定底栏，图标在上文字在下，适合拇指。
 */
export default function NavBar({ desktop }: { desktop?: boolean }) {
  const pathname = usePathname();

  if (desktop) {
    return (
      <nav className="hidden items-center gap-0.5 md:flex">
        {TABS.map((t) => {
          const active = isActive(pathname, t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors ${
                active ? "bg-beetle/15 text-beetle-dark dark:text-beetle" : "text-hare hover:text-mid"
              }`}
            >
              <NavIcon name={t.icon} className="h-[18px] w-[18px]" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-swan bg-[var(--card)] dark:border-[#37464f] md:hidden">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((t) => {
          const active = isActive(pathname, t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-0.5 py-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
            >
              <span
                className={`flex h-8 w-10 items-center justify-center rounded-xl border-2 transition-colors ${
                  active
                    ? "border-beetle bg-beetle/15 text-beetle-dark dark:text-beetle"
                    : "border-transparent text-hare"
                }`}
              >
                <NavIcon name={t.icon} className="h-[21px] w-[21px]" />
              </span>
              <span
                className={`text-[10px] font-bold ${
                  active ? "text-beetle-dark dark:text-beetle" : "text-hare"
                }`}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
