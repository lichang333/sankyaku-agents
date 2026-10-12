import Link from "next/link";
import { redirect } from "next/navigation";
import CardBodyEditor from "@/components/CardBodyEditor";
import CardControls from "@/components/CardControls";
import CardTitleEditor from "@/components/CardTitleEditor";
import Checklist from "@/components/Checklist";
import CommentBox from "@/components/CommentBox";
import LabelPicker from "@/components/LabelPicker";
import Avatar from "@/components/Avatar";
import RichText from "@/components/RichText";
import { agingLevel, cardAgeDays, DUE_STYLE, dueLabel, dueState } from "@/lib/board";
import { getSessionUser } from "@/lib/current-user";
import { relTime, todayISO } from "@/lib/dates";
import { describeEvent, EVENT_ICON } from "@/lib/events";
import {
  canSeeBoard,
  cardEvents,
  cardLabels,
  getAllUsers,
  getBoard,
  getCard,
  getCheckItems,
  getComments,
  getLabels,
  getList,
  getLists,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cardId = Number(id);
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const card = getCard(cardId);
  if (!card) redirect("/");
  const board = getBoard(card.boardId);
  // 看不见这块板，就当这张卡不存在
  if (!board || !canSeeBoard(board, user.id)) redirect("/");

  const list = getList(card.listId);
  const lists = getLists(board.id);
  const users = getAllUsers();
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const today = todayISO();

  const on = cardLabels(cardId);
  const items = getCheckItems(cardId);
  const comments = getComments(cardId);
  const events = cardEvents(cardId);

  const due = dueState(card.dueDate, today, list?.isDone ?? false);
  const aging = agingLevel(card, { isDone: list?.isDone ?? false }, board, today);
  const age = cardAgeDays(card, today);

  const box = "duo-card p-3.5";
  const h = "mb-2 text-[12px] font-black text-hare";

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
        <Link href={`/b/${board.id}`} className="text-hare">
          ← {board.name}
        </Link>
        <span className="text-hare">/</span>
        <span className="text-beetle-dark dark:text-beetle">{list?.name ?? "?"}</span>
        {card.archivedAt && (
          <span className="rounded-md bg-[var(--track)] px-1.5 py-0.5 text-[10px] text-mid">
            已归档
          </span>
        )}
      </div>

      <div className={box}>
        <CardTitleEditor cardId={card.id} title={card.title} />

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
          {card.dueDate && due !== "none" && (
            <span className={`rounded-md px-1.5 py-0.5 ${DUE_STYLE[due]}`}>
              {dueLabel(card.dueDate, today)}
            </span>
          )}
          <span className={aging === "stuck" ? "age-stuck" : aging === "slow" ? "age-slow" : "text-hare"}>
            ◷ 在「{list?.name}」待了 {age} 天
          </span>
          <span className="text-hare">
            {names.get(card.createdBy) ?? card.createdBy} 建于 {relTime(card.createdAt)}
          </span>
        </div>
      </div>

      <div className={box}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[12px] font-black text-hare">标签</h2>
          {/* 改名 / 换色 / 自定义颜色都在板设置里，这儿给条路过去 */}
          <Link
            href={`/b/${board.id}/settings`}
            className="text-[11px] font-bold text-beetle-dark dark:text-beetle"
          >
            编辑标签 →
          </Link>
        </div>
        <LabelPicker cardId={card.id} all={getLabels(board.id)} on={on} />
      </div>

      <div className={box}>
        <h2 className={h}>说明</h2>
        <CardBodyEditor cardId={card.id} body={card.body} />
      </div>

      <div className={box}>
        <h2 className={h}>拆步骤</h2>
        <Checklist cardId={card.id} items={items} />
      </div>

      <div className={box}>
        <CardControls
          card={card}
          lists={lists}
          users={users}
          canDelete={user.isAdmin || card.createdBy === user.id}
        />
      </div>

      <div className={box}>
        <h2 className={h}>说话（{comments.length}）</h2>
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar userId={c.userId} size="lg" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black">
                  {names.get(c.userId) ?? c.userId}
                  <span className="ml-1.5 font-bold text-hare">{relTime(c.createdAt)}</span>
                </p>
                <RichText text={c.text} />
              </div>
            </div>
          ))}
          <CommentBox cardId={card.id} />
        </div>
      </div>

      <div className={box}>
        <h2 className={h}>履历</h2>
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2 text-[12px] font-semibold">
              <span className="w-4 shrink-0 text-center text-hare">{EVENT_ICON[e.type]}</span>
              <span className="min-w-0 flex-1">
                <span className="font-black">{names.get(e.userId) ?? e.userId}</span>{" "}
                {describeEvent(e)}
              </span>
              <span className="shrink-0 text-[11px] font-bold text-hare">
                {relTime(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
