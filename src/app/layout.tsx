import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import AvatarProvider from "@/components/AvatarProvider";
import Mascot from "@/components/Mascot";
import NavBar from "@/components/NavBar";
import UserMenu from "@/components/UserMenu";
import { getSessionUser } from "@/lib/current-user";
import { getAvatarMap } from "@/lib/queries";

/*
 * 字体文件自己带着，不用 next/font/google。
 * 理由是构建期：next/font/google 会在编译时去抓 fonts.googleapis.com，
 * 一旦那台机器出不去网（VPS 上的 build、被墙、CI 沙箱），整个构建就静静地挂在那里。
 * 为一个 39KB 的字体赌上「能不能部署」不划算。
 */
const nunito = localFont({
  src: "./fonts/Nunito-Variable.woff2",
  weight: "400 900",
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "三脚协作",
    statusBarStyle: "black-translucent",
  },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  title: "三脚协作 · Sankyaku Agents",
  description: "人与 AI Agent 协同的任务看板：项目协作、议题讨论与跨项目协同",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdf7" },
    { media: "(prefers-color-scheme: dark)", color: "#131f24" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const avatars = user ? getAvatarMap() : {};

  return (
    <html lang="zh-CN" className={nunito.variable}>
      <body className="min-h-dvh font-[family-name:var(--font-nunito),'PingFang_SC','Hiragino_Sans_GB',sans-serif] antialiased">
        <AvatarProvider value={avatars}>
          {/* 桌面端单条顶栏：logo · 导航 · 头像；手机端导航仍在底部 */}
          <header className="border-b-2 border-transparent md:sticky md:top-0 md:z-30 md:border-swan md:bg-[var(--card)] md:dark:border-[#37464f]">
            {/* 顶栏和板一样全宽：logo 贴左缘、头像贴右缘。
                内容页自己限宽居中没关系——导航是窗口的，不是内容的。 */}
            <div className="flex items-center gap-4 px-4 pt-4 md:py-2">
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2 transition-transform active:scale-95"
                title="回到首页"
              >
                <Mascot className="h-9 w-9" variant={user?.id ?? "note"} />
                <h1 className="text-lg font-extrabold tracking-wide">
                  三脚<span className="text-beetle-dark dark:text-beetle">协作</span>
                </h1>
              </Link>
              {user && <NavBar desktop />}
              {user && (
                <div className="ml-auto">
                  <UserMenu user={user} />
                </div>
              )}
            </div>
          </header>
          {/* 宽度不在这里统一管：板页要占满整个窗口横着铺，
              文字页（首页/我的/设置…）自己居中限宽——各要各的。 */}
          <main className="px-4 pt-4 pb-32 md:pb-16">{children}</main>
          {user && <NavBar />}
        </AvatarProvider>
      </body>
    </html>
  );
}
