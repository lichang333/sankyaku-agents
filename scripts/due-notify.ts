/**
 * 每天早上推一条「今天到期」。由 systemd timer 在东京时间 08:00 触发。
 *
 * 为什么是汇总一条而不是每张卡一条：三张卡响三声，第二天就会有人把通知关掉，
 * 然后连真正要紧的那条也收不到了。
 * 没有到期的卡就一条都不发——「今天没有到期的卡」是不值得占用一次通知的。
 *
 *   npx tsx scripts/due-notify.ts
 */
import { todayISO } from "../src/lib/dates";
import { pushEnabled, pushTo } from "../src/lib/notify";
import { dueTodayFor, getAllUsers } from "../src/lib/queries";

/*
 * 不用顶层 await：package.json 没有 "type": "module"，tsx 按 CJS 转换，
 * esbuild 对 CJS 里的顶层 await 直接报编译错——脚本一行都跑不到，
 * systemd 定时器每天准点失败还没有任何推送。包在 main() 里最稳。
 */
async function main() {
  if (!pushEnabled) {
    console.log("没配 VAPID 密钥，跳过");
    return;
  }

  const today = todayISO();
  let sent = 0;

  for (const u of getAllUsers()) {
    const cards = dueTodayFor(u.id, today);
    if (!cards.length) continue;
    await pushTo([u.id], {
      title: `今天到期 ${cards.length} 张`,
      body:
        cards.length === 1
          ? cards[0].title
          : `${cards[0].title} 等 ${cards.length} 张`,
      url: "/mine",
      tag: `due-${today}`,
    });
    sent++;
    console.log(`${u.id}: ${cards.length} 张`);
  }

  console.log(`${today} 推给了 ${sent} 个人`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
