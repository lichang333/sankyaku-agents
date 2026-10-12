import Link from "next/link";
import { redirect } from "next/navigation";
import CardTile from "@/components/CardTile";
import { Empty } from "@/components/Section";
import { compareUrgency, DUE_TEXT, dueState } from "@/lib/board";
import { getSessionUser } from "@/lib/current-user";
import { todayISO } from "@/lib/dates";
import { assignedTo } from "@/lib/queries";
import type { DueState } from "@/lib/board";

export const dynamic = "force-dynamic";

/*
 * 分组按紧迫程度，不按板。
 * 按板分组读起来更整齐，但「今天要交的那张在第三块板里」是没用的整齐——
 * 早上打开这一页要回答的是「先干哪个」，不是「我参与了几块板」。
 */
const GROUPS: { key: DueState; title: string; hint?: string }[] = [
  { key: "overdue", title: "已经过期" },
  { key: "today", title: "今天" },
  { key: "soon", title: "三天内" },
  { key: "later", title: "有期限，还早" },
  { key: "none", title: "没定期限", hint: "没期限不等于不用做" },
];

export default async function MinePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const today = todayISO();
  const all = assignedTo(user.id);
  const open = all.filter((c) => !c.listIsDone).sort((a, b) => compareUrgency(a, b, today));
  const doneCount = all.length - open.length;

  return (
    <div className="mx-auto max-w-3xl lg:max-w-6xl">
      <h2 className="text-lg font-black">我的卡片</h2>
      <p className="mt-0.5 mb-3 text-[11px] font-bold text-hare">
        派给你、还没进完成列的 {open.length} 张
        {doneCount > 0 && ` · 另有 ${doneCount} 张已经在完成列里`}
      </p>

      {open.length === 0 ? (
        <Empty>手上是空的。去板上认领一张，或者等别人派过来。</Empty>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const cards = open.filter((c) => dueState(c.dueDate, today) === g.key);
            if (!cards.length) return null;
            return (
              <section key={g.key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className={`text-[13px] font-black ${DUE_TEXT[g.key]}`}>
                    {g.title}
                  </h3>
                  <span className="text-[11px] font-bold text-hare">{cards.length}</span>
                  {g.hint && <span className="text-[11px] font-bold text-hare">· {g.hint}</span>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {cards.map((c) => (
                    <Link key={c.id} href={`/c/${c.id}`} className="block">
                      <CardTile
                        card={c}
                        agingDays={c.agingDays}
                        listIsDone={false}
                        today={today}
                      />
                      <p className="mt-0.5 px-1 text-[10px] font-bold text-hare">
                        {c.boardName} · {c.listName}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
