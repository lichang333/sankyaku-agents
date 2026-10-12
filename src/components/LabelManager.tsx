"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createLabelAction, deleteLabelAction, updateLabelAction } from "@/app/actions";
import { isHexColor, LABEL_COLORS, labelStyle, type Label } from "@/lib/types";

/**
 * 自定义颜色的小圆点：点开是系统取色器。
 * 没选中自定义色时显示一圈彩虹示意「这里能选任何颜色」，选中后显示当前色。
 * 系统取色器拖动时会连发 change，攒 400ms 再提交，不然一次拖动打出去几十个请求。
 */
function CustomColorDot({
  active,
  current,
  disabled,
  size = "h-3.5 w-3.5",
  immediate,
  onPick,
}: {
  active: boolean;
  current: string | null;
  disabled?: boolean;
  size?: string;
  /**
   * 新建行传 true：onPick 只是改本地 state，不打服务器，没有防抖的理由——
   * 反而防抖会让「选完色 400ms 内点了加上」用旧颜色建出标签。
   */
  immediate?: boolean;
  onPick: (hex: string) => void;
}) {
  const [v, setV] = useState(current ?? "#ce82ff");
  const timer = useRef<number | null>(null);
  // 卸载时把没打完的那一发掐掉：行被删了还去 update 一个不存在的标签没有意义
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  // 颜色被别处改了（另一台设备、并发刷新）就跟上，别抱着开面板那一刻的旧值
  useEffect(() => {
    if (current) setV(current);
  }, [current]);
  return (
    <label
      title="自定义颜色"
      className={`relative shrink-0 cursor-pointer overflow-hidden rounded-full ${size} ${
        active ? "ring-2 ring-[var(--text)] ring-offset-1" : "opacity-80"
      }`}
      style={{
        background: active
          ? v
          : "conic-gradient(#ff4b4b,#ffc800,#58cc02,#1cb0f6,#ce82ff,#ff4b4b)",
      }}
    >
      <input
        type="color"
        value={v}
        disabled={disabled}
        onChange={(e) => {
          const hex = e.target.value;
          setV(hex);
          if (immediate) {
            onPick(hex);
            return;
          }
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onPick(hex), 400);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

export default function LabelManager({ boardId, labels }: { boardId: number; labels: Label[] }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("macaw");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    const n = name.trim();
    if (!n) return;
    setName("");
    startTransition(async () => void (await createLabelAction(boardId, n, color)));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {labels.map((l) => {
          const s = labelStyle(l.color);
          return (
            <div key={l.id} className="flex items-center gap-2">
              <span
                className={`h-4 w-6 shrink-0 rounded-full ${s.bar}`}
                style={s.custom ? { backgroundColor: s.custom } : undefined}
              />
              {editing === l.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() =>
                    startTransition(async () => {
                      // 空名不提交：无名色块在卡上认不出是什么，直接还原
                      if (editName.trim()) await updateLabelAction(boardId, l.id, { name: editName });
                      setEditing(null);
                    })
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    startTransition(async () => {
                      if (editName.trim()) await updateLabelAction(boardId, l.id, { name: editName });
                      setEditing(null);
                    })
                  }
                  className="min-w-0 flex-1 rounded-lg border-2 border-beetle bg-[var(--card)] px-2 py-1 text-[13px] font-bold outline-none"
                />
              ) : (
                <button
                  onClick={() => (setEditing(l.id), setEditName(l.name))}
                  className="min-w-0 flex-1 truncate text-left text-[13px] font-bold"
                  title="点一下改名"
                >
                  {l.name}
                </button>
              )}

              {/* 换色：七个预设点 + 一个自定义取色器 */}
              <span className="flex shrink-0 items-center gap-1">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.key}
                    disabled={pending}
                    onClick={() =>
                      startTransition(
                        async () => void (await updateLabelAction(boardId, l.id, { color: c.key }))
                      )
                    }
                    title={c.label}
                    className={`h-3.5 w-3.5 rounded-full ${c.dot} ${
                      l.color === c.key ? "ring-2 ring-[var(--text)] ring-offset-1" : "opacity-45"
                    }`}
                  />
                ))}
                <CustomColorDot
                  active={isHexColor(l.color)}
                  current={isHexColor(l.color) ? l.color : null}
                  disabled={pending}
                  onPick={(hex) =>
                    startTransition(
                      async () => void (await updateLabelAction(boardId, l.id, { color: hex }))
                    )
                  }
                />
              </span>

              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => void (await deleteLabelAction(boardId, l.id)))
                }
                className="shrink-0 px-1 text-[11px] font-bold text-hare"
                aria-label="删掉这个标签"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-swan pt-3 dark:border-[#37464f]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.repeat && !e.nativeEvent.isComposing && add()}
          placeholder="新标签的名字"
          className="min-w-0 flex-1 rounded-xl border-2 border-swan bg-transparent px-2.5 py-1.5 text-[13px] font-bold outline-none focus:border-beetle dark:border-[#37464f]"
        />
        <span className="flex items-center gap-1">
          {LABEL_COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => setColor(c.key)}
              title={c.label}
              className={`h-4 w-4 rounded-full ${c.dot} ${
                color === c.key ? "ring-2 ring-[var(--text)] ring-offset-1" : "opacity-45"
              }`}
            />
          ))}
          <CustomColorDot
            active={isHexColor(color)}
            current={isHexColor(color) ? color : null}
            size="h-4 w-4"
            immediate
            onPick={setColor}
          />
        </span>
        <button
          disabled={pending || !name.trim()}
          onClick={add}
          className="btn3d bg-beetle px-3 py-1.5 text-xs text-white [--sh:#a568cc]"
        >
          加上
        </button>
      </div>
      <p className="text-[11px] font-bold text-hare">
        标签的改名、换色在这里，卡片上只负责贴。彩虹点是自定义颜色。
        删掉标签会从所有卡上一并摘掉。少而管用比多而无用强——超过七八个就没人分得清了。
      </p>
    </div>
  );
}
