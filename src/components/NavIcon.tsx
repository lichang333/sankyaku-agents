export type IconName = "board" | "mine" | "activity" | "archive" | "collab" | "agents";

/**
 * 导航图标。统一 24 网格、2.2px 圆头描边、currentColor——
 * 跟界面其余部分的粗圆角语言一致，也避免 emoji 在各平台字形不一。
 */
export default function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (name) {
    // 看板：三列，高矮不一——高矮正是这个 App 要你看见的东西
    case "board":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="5" height="16" rx="1.6" />
          <rect x="9.5" y="4" width="5" height="10.5" rx="1.6" />
          <rect x="16" y="4" width="5" height="6.5" rx="1.6" />
        </svg>
      );

    // 协作：对话气泡
    case "collab":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="13" height="11" rx="2" />
          <path d="M7 15v3.5l4-3.5h5a2 2 0 0 0 2-2V9" />
        </svg>
      );

    // Agents：小机器人 / 智能体
    case "agents":
      return (
        <svg {...common}>
          <rect x="4" y="8" width="16" height="12" rx="3" />
          <path d="M12 3v5" />
          <circle cx="12" cy="2.5" r="1" fill="currentColor" />
          <circle cx="9" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
          <path d="M9 17h6" />
        </svg>
      );

    // 我的：一张卡上打了勾
    case "mine":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
          <path d="M8 12.4l2.8 2.8L16.5 9.5" />
        </svg>
      );

    // 动态：一条条事件，前面点着头像
    case "activity":
      return (
        <svg {...common}>
          <circle cx="5.5" cy="7" r="2.2" />
          <circle cx="5.5" cy="16.5" r="2.2" />
          <path d="M11 5.8h9M11 8.6h6M11 15.3h9M11 18.1h6" />
        </svg>
      );

    // 归档：一个盖着盖子的箱子
    case "archive":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="4.4" rx="1.4" />
          <path d="M5 8.4v10a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-10" />
          <path d="M10 12.4h4" />
        </svg>
      );
  }
}
