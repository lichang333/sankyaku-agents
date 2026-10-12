"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useOutsideClose } from "@/components/useOutsideClose";
import { archiveListAction, moveListAction, updateListAction } from "@/app/actions";
import { isOverWip, wipCount } from "@/lib/board";
import { useAutoFocus } from "@/components/useAutoFocus";
import type { ListView } from "@/lib/types";

/**
 * 列头：名字、张数 / 上限、一个 ⋯ 菜单，同时也是拖动整列的抓手。
 *
 * 抓手就是列头本身，不额外画一个小握把：列头是这一列唯一「不是卡片」的地方，
 * 手指按上去除了拖它也没别的意思。点一下（没挪动）仍然是改名——
 * 靠的是和卡片同一套阈值判定，挪够了才算拖，没挪就当点击。
 *
 * ⋯ 菜单和改名输入框标了 data-nodrag：那两处是要点、要输入的，
 * 从它们身上起拖只会让人点不中菜单。
 *
 * 菜单里的「← →」保留着，不因为能拖了就删掉：手机上单手把一列拖过两屏很难受，
 * 而且那是键盘和读屏能走通的唯一一条路。
 */
export default function ListHeader({
  list,
  index,
  total,
  onPointerDown,
  suppressClick,
}: {
  list: ListView;
  index: number;
  total: number;
  onPointerDown?: (e: React.PointerEvent) => void;
  /** 刚拖完那一下要吞掉，否则松手就弹出改名框 */
  suppressClick?: React.RefObject<boolean>;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [limitOpen, setLimitOpen] = useState(false);
  const [limit, setLimit] = useState(list.wipLimit?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const focusRef = useAutoFocus<HTMLInputElement>();

  useEffect(() => setName(list.name), [list.name]);
  useOutsideClose(ref, () => {
    setMenu(false);
    setLimitOpen(false);
  });

  const n = wipCount(list);
  const over = isOverWip(list);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      setMenu(false);
      setLimitOpen(false);
      setRenaming(false);
    });

  const item =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold hover:bg-polar dark:hover:bg-[#37464f] disabled:opacity-40";

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className="lane-head relative flex items-center gap-1.5 px-3 pt-2.5 pb-1.5"
    >
      {renaming ? (
        <input
          ref={focusRef}
          data-nodrag
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => run(async () => updateListAction(list.id, { name }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing)
              run(async () => updateListAction(list.id, { name }));
            if (e.key === "Escape") (setName(list.name), setRenaming(false));
          }}
          className="min-w-0 flex-1 rounded-lg border-2 border-beetle bg-[var(--card)] px-2 py-1 text-[13px] font-black outline-none"
        />
      ) : (
        <button
          onClick={() => {
            if (suppressClick?.current) return; // 刚拖完，不是要改名
            setRenaming(true);
          }}
          className="min-w-0 flex-1 truncate text-left text-[13px] font-black"
          title="拖动可以换位置，点一下改名"
        >
          {list.name}
          {list.isDone && <span className="ml-1 text-[10px] text-feather">✓</span>}
        </button>
      )}

      {/* 张数 / 上限。超了就是红的——这是整块板上唯一需要一眼看到的数字 */}
      <span
        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
          over ? "bg-cardinal text-white" : "text-hare"
        }`}
        title={list.wipLimit != null ? `在制品上限 ${list.wipLimit}` : "没设上限"}
      >
        {n}
        {list.wipLimit != null && `/${list.wipLimit}`}
      </span>

      <button
        data-nodrag
        onClick={() => setMenu((m) => !m)}
        className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm font-black text-hare"
        aria-label="这一列的更多操作"
      >
        ⋯
      </button>

      {menu && (
        <div data-nodrag className="duo-card absolute top-9 right-2 z-40 w-52 p-2 shadow-xl">
          {limitOpen ? (
            <div className="space-y-2 p-1">
              <p className="text-[11px] font-bold text-hare">
                同时进行几张就算多了？留空 = 不限
              </p>
              <input
                ref={focusRef}
                inputMode="numeric"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
                placeholder="不限"
                className="w-full rounded-lg border-2 border-swan bg-transparent px-2 py-1 text-sm font-bold outline-none focus:border-beetle dark:border-[#37464f]"
              />
              <button
                disabled={pending}
                onClick={() =>
                  run(async () =>
                    updateListAction(list.id, { wipLimit: limit === "" ? null : Number(limit) })
                  )
                }
                className="btn3d w-full bg-beetle py-1.5 text-xs text-white [--sh:#a568cc]"
              >
                存下
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              <button className={item} onClick={() => (setRenaming(true), setMenu(false))}>
                ✏️ 改名
              </button>
              <button className={item} onClick={() => setLimitOpen(true)}>
                ▨ 在制品上限{list.wipLimit != null ? `（现在 ${list.wipLimit}）` : "（未设）"}
              </button>
              <button
                className={item}
                disabled={pending}
                onClick={() => run(async () => updateListAction(list.id, { isDone: !list.isDone }))}
              >
                {list.isDone ? "↩︎ 取消「完成列」" : "✓ 标为「完成列」"}
              </button>
              <div className="my-1 border-t-2 border-swan dark:border-[#37464f]" />
              <button
                className={item}
                disabled={pending || index === 0}
                onClick={() => run(async () => moveListAction(list.id, index - 1))}
              >
                ← 往左挪
              </button>
              <button
                className={item}
                disabled={pending || index >= total - 1}
                onClick={() => run(async () => moveListAction(list.id, index + 1))}
              >
                → 往右挪
              </button>
              <div className="my-1 border-t-2 border-swan dark:border-[#37464f]" />
              <button
                className={`${item} text-cardinal`}
                disabled={pending || n > 0}
                title={n > 0 ? "先把卡片挪走或归档" : undefined}
                onClick={() => run(async () => archiveListAction(list.id, true))}
              >
                🗄 归档这一列{n > 0 && `（还有 ${n} 张）`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
