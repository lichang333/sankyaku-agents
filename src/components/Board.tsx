"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { moveCardAction, moveListAction } from "@/app/actions";
import AddCard from "@/components/AddCard";
import AddList from "@/components/AddList";
import BoardFilters, { type Filter } from "@/components/BoardFilters";
import CardTile from "@/components/CardTile";
import ListHeader from "@/components/ListHeader";
import { isOverWip, wipCount } from "@/lib/board";
import type { BoardView, CardView, ListView, User } from "@/lib/types";

/* ── 拖拽为什么是自己写的 ──
 *
 * HTML5 那套 draggable + dragstart 在手机浏览器上根本不触发（触摸不产生 drag 事件），
 * 而看板一半以上的使用发生在手机上。所以这里走 Pointer Events，鼠标和手指同一套代码。
 *
 * 触摸上真正的难点是「拖拽」和「滚动」抢同一个手势。做法：
 *   · 手指按住不动 220ms 才进入拖拽；这期间手指移开超过 8px 就判定为滚动，放弃拖拽。
 *   · 一旦进入拖拽，挂一个 passive:false 的 touchmove 把默认行为按住。
 *     能按住的前提正是「手指刚才是静止的」——浏览器还没开始滚，滚起来之后就拦不住了，
 *     这也是长按门槛不能省的原因，它不只是个防误触。
 *
 * 鼠标不需要长按，移动 6px 就进入拖拽——鼠标没有「滚动手势」这个竞争者。
 *
 * 卡片和列共用这一套：区别只在「落点算什么」和「松手调哪个 action」，
 * 门槛、自动滚动、点击抑制、乐观更新全是同一份代码。
 */

const HOLD_MS = 220; // 触摸：按住多久算「要拖」
const HOLD_SLOP = 8; // 触摸：按住期间挪超过这些像素就当成滚动
const MOUSE_SLOP = 6; // 鼠标：挪超过这些像素才算拖
const EDGE = 56; // 横向：离板边缘多近开始自动滚
const EDGE_Y = 36; // 竖向：列内的触发带窄一些，大约是列头的高度
const EDGE_SPEED = 16;

type DragKind = "card" | "list";

interface Press {
  kind: DragKind;
  /** 卡片 id 或 列 id */
  id: number;
  /** 卡片：它所在的列；列：它自己 */
  listId: number;
  card: CardView | null;
  list: ListView | null;
  x0: number;
  y0: number;
  dx: number; // 指针在被拖元素内的偏移，拖起来才不会跳到手指下面
  dy: number;
  w: number;
  pointerType: string;
  timer: number | null;
  started: boolean;
}

interface DragState {
  kind: DragKind;
  id: number;
  fromListId: number;
  card: CardView | null;
  list: ListView | null;
  w: number;
  dx: number;
  dy: number;
  x: number;
  y: number;
  /** 卡片落点：哪一列的第几个缝 */
  cardTarget: { listId: number; index: number } | null;
  /** 列落点：在「除自己以外的那些列」里排第几 */
  listTarget: number | null;
}

export default function Board({
  board,
  users,
  today,
}: {
  board: BoardView;
  users: User[];
  today: string;
}) {
  const router = useRouter();
  const [lists, setLists] = useState<ListView[]>(board.lists);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [filter, setFilter] = useState<Filter>({ assignee: null, labelId: null });
  const [error, setError] = useState("");
  const [movePending, startTransition] = useTransition();

  /*
   * 服务端每次重新渲染都以它为准，乐观更新只活到下一次 RSC 回来为止。
   * 但有两个时刻不能收：
   *  · 拖拽进行中——板面在指尖下被整个换掉，落点直接作废；
   *  · 移动请求在途——并发操作的 RSC 载荷是在移动落库前渲染的，
   *    收下它卡会先跳回原位、等移动自己的 revalidate 到了再跳回去，闪两下。
   * movePending 翻回 false 时这个 effect 会带着最新的 board 再跑一遍，
   * 所以「先不收」不会漏掉任何一次对齐。
   */
  useEffect(() => {
    if (!dragRef.current && !movePending) setLists(board.lists);
  }, [board, movePending]);

  // 命中判定（算落点、算 sameSpot）读这个镜像，不直接闭包 lists：
  // 否则三个 useCallback 都依赖 lists，每次乐观更新都要把 window 监听器拆了重挂
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  const scroller = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null); // 拖拽浮层：跟手不走 React
  const laneBoxEls = useRef(new Map<number, HTMLDivElement>()); // 整列（算列的落点）
  const laneEls = useRef(new Map<number, HTMLDivElement>()); // 列里装卡的那块（算卡的落点、竖向自动滚）
  const cardEls = useRef(new Map<number, HTMLElement>());
  const press = useRef<Press | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const didDrag = useRef(false); // 拖完那一下的 click 要吞掉，否则会跳进详情 / 触发改名
  const raf = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const filtering = filter.assignee !== null || filter.labelId !== null;

  const visible = useCallback(
    (l: ListView) =>
      l.cards.filter(
        (c) =>
          (filter.assignee === null || c.assigneeId === filter.assignee) &&
          (filter.labelId === null || c.labels.some((x) => x.id === filter.labelId))
      ),
    [filter]
  );

  /* ── 卡片落点：指针在哪一列的第几个缝 ── */
  const computeCardTarget = useCallback(
    (x: number, y: number, cardId: number): DragState["cardTarget"] => {
      const lists = listsRef.current;
      let listId: number | null = null;
      let best = Infinity;
      for (const l of lists) {
        const el = laneEls.current.get(l.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right) {
          listId = l.id;
          break;
        }
        // 拖到板外面时吸到最近的一列，而不是判成「没有落点」
        const d = x < r.left ? r.left - x : x - r.right;
        if (d < best) {
          best = d;
          listId = l.id;
        }
      }
      if (listId == null) return null;

      const cards = (lists.find((l) => l.id === listId)?.cards ?? []).filter(
        (c) => c.id !== cardId
      );
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const el = cardEls.current.get(cards[i].id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { listId, index };
    },
    []
  );

  /* ── 列落点：把指针横坐标和「其余各列的中线」比一比 ── */
  const computeListTarget = useCallback(
    (x: number, listId: number): number => {
      const others = listsRef.current.filter((l) => l.id !== listId);
      let index = others.length;
      for (let i = 0; i < others.length; i++) {
        const el = laneBoxEls.current.get(others[i].id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          index = i;
          break;
        }
      }
      return index;
    },
    []
  );

  /* ── 自动滚动：拖到边上时板横着走、列竖着走 ── */
  const tick = useCallback(() => {
    const { x, y } = pointer.current;
    const sc = scroller.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (x < r.left + EDGE) sc.scrollLeft -= EDGE_SPEED;
      else if (x > r.right - EDGE) sc.scrollLeft += EDGE_SPEED;
    }
    // 竖向只在拖卡片时有意义——列是横着排的，拖列不需要滚某一列的内部
    if (dragRef.current?.kind === "card") {
      const lid = dragRef.current.cardTarget?.listId;
      const lane = lid != null ? laneEls.current.get(lid) : null;
      if (lane) {
        const r = lane.getBoundingClientRect();
        if (y < r.top + EDGE_Y) lane.scrollTop -= EDGE_SPEED;
        else if (y > r.bottom - EDGE_Y) lane.scrollTop += EDGE_SPEED;
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  const blockTouch = useCallback((e: TouchEvent) => e.preventDefault(), []);

  const endDrag = useCallback(() => {
    press.current = null;
    dragRef.current = null;
    setDrag(null);
    document.body.classList.remove("dragging-active");
    window.removeEventListener("touchmove", blockTouch);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, [blockTouch]);

  const beginDrag = useCallback(
    (p: Press, x: number, y: number) => {
      p.started = true;
      if (p.timer) window.clearTimeout(p.timer);
      p.timer = null;
      const d: DragState = {
        kind: p.kind,
        id: p.id,
        fromListId: p.listId,
        card: p.card,
        list: p.list,
        w: p.w,
        dx: p.dx,
        dy: p.dy,
        x,
        y,
        cardTarget: p.kind === "card" ? computeCardTarget(x, y, p.id) : null,
        listTarget: p.kind === "list" ? computeListTarget(x, p.id) : null,
      };
      dragRef.current = d;
      setDrag(d);
      didDrag.current = true;
      document.body.classList.add("dragging-active");
      // 拖起来之后才拦触摸滚动。此刻手指是静止的，浏览器还没接管这个手势。
      window.addEventListener("touchmove", blockTouch, { passive: false });
      raf.current = requestAnimationFrame(tick);
    },
    [blockTouch, computeCardTarget, computeListTarget, tick]
  );

  /* ── 落下：先本地挪好，再让服务端坐实 ── */
  const commit = useCallback(() => {
    const d = dragRef.current;
    if (!d) return endDrag();

    if (d.kind === "list") {
      const index = d.listTarget;
      const from = listsRef.current.findIndex((l) => l.id === d.id);
      // index 是在「除自己以外」那串里的下标，等于原下标就是没动
      if (index == null || index === from) return endDrag();

      setLists((prev) => {
        const moved = prev.find((l) => l.id === d.id);
        if (!moved) return prev;
        const rest = prev.filter((l) => l.id !== d.id);
        rest.splice(index, 0, moved);
        return rest;
      });
      endDrag();

      startTransition(async () => {
        const res = await moveListAction(d.id, index);
        if (res?.error) {
          setError(res.error);
          router.refresh();
        }
      });
      return;
    }

    if (!d.cardTarget) return endDrag();
    const { listId, index } = d.cardTarget;

    const fromList = listsRef.current.find((l) => l.id === d.fromListId);
    const oldIndex = fromList?.cards.findIndex((c) => c.id === d.id) ?? -1;
    /*
     * 原地没动就别往服务器发——拖拽点一下就松手是很常见的动作。
     * 注意坐标系：computeCardTarget 的 index 是「除被拖那张之外」数的，
     * 在这套坐标里原地只有 index === oldIndex 一种写法；
     * oldIndex + 1 是「往下挪一格」，是真实的移动（这里曾把它误当成原地吞掉，
     * 表现为同列下移一格永远拖不动、卡片弹回去还不报错）。
     */
    const sameSpot = listId === d.fromListId && index === oldIndex;
    if (sameSpot) return endDrag();

    setLists((prev) => {
      const next = prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== d.id) }));
      const li = next.findIndex((l) => l.id === listId);
      if (li < 0 || !d.card) return prev;
      next[li].cards.splice(index, 0, { ...d.card, listId });
      return next;
    });
    endDrag();

    startTransition(async () => {
      const res = await moveCardAction(d.id, listId, index);
      if (res?.error) {
        setError(res.error);
        router.refresh(); // 回到服务端的版本，不留一个假的排列在屏幕上
      }
    });
  }, [endDrag, router]);

  /* ── 指针事件 ── */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      pointer.current = { x: e.clientX, y: e.clientY };

      if (!p.started) {
        const dist = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
        if (p.pointerType === "mouse") {
          if (dist > MOUSE_SLOP) beginDrag(p, e.clientX, e.clientY);
        } else if (dist > HOLD_SLOP) {
          // 长按还没到就动了：这是在滚页面，把这次按下作废
          if (p.timer) window.clearTimeout(p.timer);
          press.current = null;
        }
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      /*
       * 指针事件是设备刷新率级别的（常见 120+/s）。跟手这件事不劳 React：
       * 坐标直接写到浮层的 style 上；React 只在「落点变了」的那一下重渲染
       * （落点线是唯一需要它重画的东西）。不然整块板每秒重渲染上百次，
       * 卡一多手机上拖起来就是一格一格的。
       */
      d.x = e.clientX;
      d.y = e.clientY;
      if (layerRef.current) {
        layerRef.current.style.left = `${e.clientX - d.dx}px`;
        layerRef.current.style.top = `${e.clientY - d.dy}px`;
      }
      const cardTarget =
        d.kind === "card" ? computeCardTarget(e.clientX, e.clientY, d.id) : null;
      const listTarget = d.kind === "list" ? computeListTarget(e.clientX, d.id) : null;
      const changed =
        d.kind === "card"
          ? cardTarget?.listId !== d.cardTarget?.listId ||
            cardTarget?.index !== d.cardTarget?.index
          : listTarget !== d.listTarget;
      d.cardTarget = cardTarget;
      d.listTarget = listTarget;
      if (changed) setDrag({ ...d });
    };

    const up = () => {
      const p = press.current;
      if (p?.timer) window.clearTimeout(p.timer);
      if (p?.started) commit();
      else endDrag();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      // 拖到一半组件被卸载（比如并发操作触发的整页刷新）：长按计时器和
      // endDrag 里那套（touchmove 拦截、body 类、rAF）都得拆干净，
      // 否则 passive:false 的拦截器会留在 window 上，整站触摸滚动全部失灵
      if (press.current?.timer) window.clearTimeout(press.current.timer);
      endDrag();
    };
  }, [beginDrag, commit, computeCardTarget, computeListTarget, endDrag]);

  /** 起拖的公共部分：记下按点，触摸再挂一个长按计时器 */
  const startPress = (e: React.PointerEvent, p: Omit<Press, "timer" | "started">) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    didDrag.current = false;
    const full: Press = { ...p, timer: null, started: false };
    pointer.current = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== "mouse") {
      full.timer = window.setTimeout(() => {
        if (press.current === full) beginDrag(full, pointer.current.x, pointer.current.y);
      }, HOLD_MS);
    }
    press.current = full;
  };

  const onCardPointerDown = (e: React.PointerEvent, card: CardView, listId: number) => {
    if (filtering) return; // 筛选时不给拖卡片，理由见下面渲染处的提示
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    startPress(e, {
      kind: "card",
      id: card.id,
      listId,
      card,
      list: null,
      x0: e.clientX,
      y0: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width,
      pointerType: e.pointerType,
    });
  };

  const onListPointerDown = (e: React.PointerEvent, list: ListView) => {
    // ⋯ 菜单和改名输入框上不起拖，那两处是要点的
    if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
    const box = laneBoxEls.current.get(list.id);
    if (!box) return;
    const r = box.getBoundingClientRect();
    startPress(e, {
      kind: "list",
      id: list.id,
      listId: list.id,
      card: null,
      list,
      x0: e.clientX,
      y0: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width,
      pointerType: e.pointerType,
    });
  };

  const cardCount = lists.reduce((n, l) => n + wipCount(l), 0);

  /*
   * 列的落点线画在哪一格：listTarget 是「除被拖那列之外」的下标，
   * 而屏幕上被拖的那列还占着位置（只是变淡了），所以要换算回显示下标。
   */
  const draggedListIdx = drag?.kind === "list" ? lists.findIndex((l) => l.id === drag.id) : -1;
  const listLineAt =
    drag?.kind === "list" && drag.listTarget != null && drag.listTarget !== draggedListIdx
      ? drag.listTarget < draggedListIdx
        ? drag.listTarget
        : drag.listTarget + 1
      : null;

  return (
    <>
      <BoardFilters
        users={users}
        labels={board.labels}
        value={filter}
        onChange={setFilter}
        total={cardCount}
      />

      {error && (
        <p className="mt-2 rounded-xl bg-cardinal/15 px-3 py-2 text-xs font-bold text-cardinal">
          {error}
        </p>
      )}

      {filtering && (
        <p className="mt-2 text-[11px] font-bold text-hare">
          筛选开着的时候不能拖卡片、也不能加卡片——半数卡片是藏起来的，
          「放在这两张中间」也就没有意义了。清掉筛选再拖，或者进卡片里用「移动到」。
          （拖列不受影响。）
        </p>
      )}

      <div ref={scroller} className="board-scroll mt-3">
        {lists.map((list, i) => {
          const cards = visible(list);
          const over = isOverWip(list);
          const dropHere = drag?.kind === "card" && drag.cardTarget?.listId === list.id;
          const ghost = drag?.kind === "list" && drag.id === list.id;
          /*
           * cardTarget.index 是「不含被拖那张」的下标，而这里渲染的 cards
           * 在源列里还带着幽灵卡。画线要换算回显示下标：落点在幽灵之后的整体 +1。
           * 别的列没有幽灵，两套坐标重合。（列拖拽的 listLineAt 一直有这步换算，
           * 卡的路径此前漏了，症状是同列拖动时线画在上一条缝里。）
           */
          const ghostIdx =
            dropHere && drag!.fromListId === list.id
              ? cards.findIndex((c) => c.id === drag!.id)
              : -1;
          const lineAt = dropHere
            ? ghostIdx >= 0 && drag!.cardTarget!.index >= ghostIdx
              ? drag!.cardTarget!.index + 1
              : drag!.cardTarget!.index
            : null;
          return (
            <Fragment key={list.id}>
              {listLineAt === i && <div className="drop-col" />}
              <div
                ref={(el) => {
                  if (el) laneBoxEls.current.set(list.id, el);
                  else laneBoxEls.current.delete(list.id);
                }}
                className={`lane ${over ? "lane-over" : ""} ${ghost ? "lane-ghost" : ""}`}
              >
                <ListHeader
                  list={list}
                  index={i}
                  total={lists.length}
                  onPointerDown={(e) => onListPointerDown(e, list)}
                  suppressClick={didDrag}
                />

                <div
                  ref={(el) => {
                    if (el) laneEls.current.set(list.id, el);
                    else laneEls.current.delete(list.id);
                  }}
                  className="lane-cards"
                >
                  {cards.length === 0 && !dropHere && (
                    <p className="px-1 py-3 text-center text-[11px] font-bold text-hare">
                      {filtering ? "这一列没有符合的卡" : "空的"}
                    </p>
                  )}

                  {cards.map((c, idx) => (
                    <div key={c.id}>
                      {lineAt === idx && <div className="drop-line" />}
                      <Link
                        href={`/c/${c.id}`}
                        ref={(el) => {
                          if (el) cardEls.current.set(c.id, el);
                          else cardEls.current.delete(c.id);
                        }}
                        onPointerDown={(e) => onCardPointerDown(e, c, list.id)}
                        /*
                         * 卡片包在 <a> 里（为了能新标签页打开、能被键盘聚焦），
                         * 而 <a> 默认是「可原生拖拽」的：手一动浏览器就接管成拖链接，
                         * 从那一刻起 pointermove / pointerup 全都不再送到页面上，
                         * 我们的拖拽会停在半空——卡片不动，也不报错。
                         * 所以这里必须明确关掉原生拖拽。
                         */
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onClick={(e) => {
                          // 刚拖完的那一下不该跳页
                          if (didDrag.current) e.preventDefault();
                        }}
                        className={`block ${
                          drag?.kind === "card" && drag.id === c.id ? "kcard-ghost" : ""
                        }`}
                      >
                        <CardTile
                          card={c}
                          agingDays={board.agingDays}
                          listIsDone={list.isDone}
                          today={today}
                        />
                      </Link>
                    </div>
                  ))}

                  {lineAt != null && lineAt >= cards.length && <div className="drop-line" />}
                </div>

                <AddCard listId={list.id} disabled={filtering} />
              </div>
            </Fragment>
          );
        })}

        {listLineAt === lists.length && <div className="drop-col" />}

        <AddList boardId={board.id} />
      </div>

      {/* 跟着手指走的那一个。卡片用同一个 CardTile，长相一定对得上。 */}
      {drag && (
        <div
          ref={layerRef}
          className="drag-layer"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            ["--dw" as string]: `${drag.w}px`,
          }}
        >
          {drag.kind === "card" && drag.card ? (
            <CardTile
              card={drag.card}
              agingDays={board.agingDays}
              listIsDone={false}
              today={today}
            />
          ) : (
            <div className="lane-chip">
              <span className="truncate">{drag.list?.name}</span>
              <span className="text-hare">{drag.list ? wipCount(drag.list) : ""}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
