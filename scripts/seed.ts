/**
 * 建一块示例板，让新装的实例不是一片空白。
 * 幂等：已经有板了就什么都不做——绝不在别人用了一阵之后再塞一块板进去。
 *
 *   npx tsx scripts/seed.ts [用户id]
 */
import { addDays, todayISO } from "../src/lib/dates";
import { createBoard, createCard, getLists, listBoards, updateCard } from "../src/lib/queries";

const uid = process.argv[2] ?? "admin";

if (listBoards(uid, true).length > 0) {
  console.log("已经有板了，不动。");
  process.exit(0);
}

const boardId = createBoard({
  name: "示例板",
  description: "拿它熟悉一下：拖一张卡、给一列设上限、看看卡龄标记",
  createdBy: uid,
});
const [todo, doing, done] = getLists(boardId);

const add = (listId: number, title: string, due?: string) => {
  const id = createCard({ listId, title, createdBy: uid });
  if (due) updateCard(id, { dueDate: due, assigneeId: uid });
  return id;
};

add(todo.id, "把「进行中」的上限从 3 改成你真正扛得住的数字");
add(todo.id, "在设置里发一条邀请链接给伙伴");
add(doing.id, "试着把这张卡拖到「完成」", addDays(todayISO(), 2));
add(done.id, "读一遍 README 里「为什么要有上限」那一段");

console.log(`示例板建好了（id=${boardId}）`);
