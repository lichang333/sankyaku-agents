import Link from "next/link";
import { redirect } from "next/navigation";
import CardTile from "@/components/CardTile";
import NewBoardForm from "@/components/NewBoardForm";
import Section, { Empty } from "@/components/Section";
import {
  boardRedlines,
  compareUrgency,
  isOverWip,
  REDLINE_STYLE,
  wipCount,
} from "@/lib/board";
import { getSessionUser } from "@/lib/current-user";
import { todayISO } from "@/lib/dates";
import { assignedTo, getBoardViews, listBoards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const today = todayISO();
  const boards = listBoards(user.id);
  /*
   * 取完整视图再用纯函数算红线，而不是写几条 SQL 直接数出来——
   * WIP 超限、卡龄、逾期三条规则全站只有一份定义（lib/board.ts），
   * 不会出现「首页说超了、板上说没超」这种最伤信任的不一致。
   * 批量版一轮 6 条 IN 查询搞定全部板，不随板数线性涨。
   */
  const views = getBoardViews(boards.map((b) => b.id));
  const redlines = views.flatMap((v) => boardRedlines(v, today));

  const mine = assignedTo(user.id)
    .filter((c) => !c.listIsDone)
    .sort((a, b) => compareUrgency(a, b, today))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-3xl space-y-3 lg:max-w-6xl">
      {/* 介绍与快速导航 */}
      <div className="duo-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-beetle/15 px-2 py-0.5 text-xs font-black text-beetle-dark dark:text-beetle">
                人机协同
              </span>
              <h2 className="text-base font-black">三脚协作 · Sankyaku Agents</h2>
            </div>
            <p className="mt-1 text-xs font-bold text-hare">
              在任务看板基础上接入项目协作、通用议题讨论与跨项目沟通，支持外部 AI Agent 结构化协作与任务交接。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/collab"
              className="btn3d inline-flex items-center gap-1.5 bg-beetle px-3.5 py-2 text-xs text-white [--sh:var(--color-beetle-dark)]"
            >
              <span>💬</span>
              <span>协作空间</span>
            </Link>
            <Link
              href="/agents"
              className="btn3d inline-flex items-center gap-1.5 bg-polar px-3.5 py-2 text-xs text-mid dark:bg-[#202f36] dark:text-[#f1f7fb] [--sh:var(--card-border)]"
            >
              <span>🤖</span>
              <span>Agents 管理</span>
            </Link>
          </div>
        </div>
      </div>

      {redlines.length > 0 && (
        <Section title="该管一管的">
          <div className="duo-card divide-y-2 divide-swan dark:divide-[#37464f]">
            {redlines.map((r, i) => {
              const s = REDLINE_STYLE[r.kind];
              return (
                <Link key={i} href={r.href} className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <span className={`mt-0.5 text-sm font-black ${s.tint}`}>{s.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold">{r.text}</span>
                    <span className="text-[11px] font-bold text-hare">{r.boardName}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="我的卡片" more="/mine" moreLabel="全部">
        {mine.length === 0 ? (
          <Empty>没有派给你的卡。板上认领一张，或者等别人派过来。</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {mine.map((c) => (
              <Link key={c.id} href={`/c/${c.id}`} className="block">
                <CardTile card={c} agingDays={c.agingDays} listIsDone={false} today={today} />
                <p className="mt-0.5 px-1 text-[10px] font-bold text-hare">
                  {c.boardName} · {c.listName}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="板">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {views.map((v) => {
            const cards = v.lists.reduce((n, l) => n + wipCount(l), 0);
            const doing = v.lists.filter((l) => !l.isDone).reduce((n, l) => n + wipCount(l), 0);
            const over = v.lists.filter(isOverWip).length;
            const mineHere = v.lists.reduce(
              (n, l) => n + l.cards.filter((c) => c.assigneeId === user.id).length,
              0
            );
            return (
              <Link key={v.id} href={`/b/${v.id}`} className="duo-card block p-3.5">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-black">{v.name}</h3>
                  {v.visibility === "private" && (
                    <span className="shrink-0 rounded-md bg-[var(--track)] px-1.5 py-0.5 text-[10px] font-bold text-mid">
                      私人
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
                  <span className="text-hare">{cards} 张</span>
                  <span className="text-hare">在制品 {doing}</span>
                  {mineHere > 0 && (
                    <span className="text-beetle-dark dark:text-beetle">我的 {mineHere}</span>
                  )}
                  {over > 0 && <span className="text-cardinal">{over} 列超限</span>}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-3">
          <NewBoardForm />
        </div>
        {views.length === 0 && (
          <p className="mt-3 text-[11px] font-bold text-hare">
            一块板就是一件事的全部流程。别把所有事塞进一块板——那样每一列都会长到看不完。
          </p>
        )}
      </Section>
    </div>
  );
}
