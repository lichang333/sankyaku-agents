"use client";

import { agingLevel, cardAgeDays, DUE_STYLE, dueLabel, dueState } from "@/lib/board";
import Avatar from "@/components/Avatar";
import { labelStyle, type CardView } from "@/lib/types";

/**
 * 板上的一张卡。纯展示——拖拽、点击、导航都由外面包着的 Board 负责，
 * 这样拖起来跟着手指飞的那张和留在列里的那张能是同一段代码，长得绝不会不一样。
 */
export default function CardTile({
  card,
  agingDays,
  listIsDone,
  today,
}: {
  card: CardView;
  agingDays: number;
  listIsDone: boolean;
  today: string;
}) {
  const due = dueState(card.dueDate, today, listIsDone);
  const aging = agingLevel(card, { isDone: listIsDone }, { agingDays }, today);
  const age = cardAgeDays(card, today);

  return (
    <div className="kcard">
      {/*
        * 标签色条贯穿卡片顶边（负外边距吃掉卡片自己的内边距，顶到边框内缘）。
        * 比一排小药丸更有版面感，扫一眼就能按颜色分拣。
        * 多个标签平分宽度；没贴标签就没有线——颜色是信号，不是装饰。
        */}
      {card.labels.length > 0 && (
        <div className="-mx-2.5 -mt-2 mb-2 flex h-1.5 overflow-hidden rounded-t-[10px]">
          {card.labels.map((l) => {
            const s = labelStyle(l.color);
            return (
              <span
                key={l.id}
                title={l.name}
                className={`h-full flex-1 ${s.bar}`}
                style={
                  s.custom
                    ? {
                        backgroundColor: s.custom,
                        // 极浅的自定义色在浅色卡面上会隐形，描一线半透明边兜底
                        boxShadow: "inset 0 -1px 0 rgb(0 0 0 / 0.10)",
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      <p className="clamp-3 text-[13px] leading-snug font-bold">{card.title}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold">
        {card.dueDate && due !== "none" && (
          <span className={`rounded-md px-1.5 py-0.5 ${DUE_STYLE[due]}`}>
            {dueLabel(card.dueDate, today)}
          </span>
        )}

        {card.checkTotal > 0 && (
          <span
            className={
              card.checkDone === card.checkTotal ? "text-feather-dark dark:text-feather" : "text-hare"
            }
          >
            ☑ {card.checkDone}/{card.checkTotal}
          </span>
        )}

        {card.commentCount > 0 && <span className="text-hare">💬 {card.commentCount}</span>}

        {/* 躺太久的标记。只在真的躺久了才出现——每张卡都挂个天数等于没标 */}
        {aging !== "fresh" && (
          <span
            className={aging === "stuck" ? "age-stuck" : "age-slow"}
            title={`在这一列待了 ${age} 天`}
          >
            ◷ {age}d
          </span>
        )}

        {card.assigneeId && (
          <Avatar userId={card.assigneeId} size="sm" className="ml-auto" />
        )}
      </div>
    </div>
  );
}
