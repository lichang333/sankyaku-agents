import Link from "next/link";

/** 首页那几段的统一壳子：标题 +（可选）右上角「全部 →」 */
export default function Section({
  title,
  hint,
  more,
  moreLabel = "全部",
  children,
}: {
  title: string;
  hint?: string;
  more?: string;
  moreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-base font-black">{title}</h2>
        {hint && <span className="text-[11px] font-bold text-hare">{hint}</span>}
        {more && (
          <Link href={more} className="ml-auto text-xs font-extrabold text-beetle-dark dark:text-beetle">
            {moreLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** 空状态：一句话说清「为什么这里是空的」和「该干嘛」 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="duo-card px-4 py-6 text-center text-[13px] font-bold text-hare">
      {children}
    </div>
  );
}
