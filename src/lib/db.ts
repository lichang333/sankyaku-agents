import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { USERS } from "./types";

/*
 * 一个 SQLite 文件装下全部：板、列、卡、评论、履历。
 * 没有附件、没有大字段，所以整个库几 MB 顶天——每日快照做起来毫无负担，
 * 而快照是这套东西最要紧的一环：卡片没了就是真没了，别处没有源。
 *
 * 几个刻意的地方：
 * - 卡片和列的排序用 REAL 的 `pos`（见 lib/rank.ts），不用整数序号。
 *   整数序号意味着往中间插一张就要重写整列，拖拽时那一下会很难看。
 * - 归档是把 archived_at 写上时间，不是 DELETE。看板上「删掉的卡」
 *   十有八九是「先收起来」，真删只留给管理员。
 * - ON DELETE CASCADE 一路带下去：删一块板要能把它的列、卡、评论、履历一起带走，
 *   不然会留下一地孤儿行。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  avatar TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  -- group（全组可见）| private（只有创建者）
  visibility TEXT NOT NULL DEFAULT 'group',
  -- 同一列待过几天算「躺太久」
  aging_days INTEGER NOT NULL DEFAULT 7,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pos REAL NOT NULL,
  -- 在制品上限，NULL = 不限
  wip_limit INTEGER,
  -- 完成列：进了这列停止计龄，也不算在制品
  is_done INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(board_id, pos);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- board_id 是 list_id 的冗余（列已经知道自己属于哪块板）。
  -- 留着它是为了「这块板上所有卡」不必每次都 join 一次 lists，
  -- 首页要同时算好几块板的逾期数，那个 join 会出现在每一条查询里。
  -- 代价是移动卡片时两个字段要一起写，只在 moveCard 一处发生。
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  pos REAL NOT NULL,
  assignee_id TEXT REFERENCES users(id),
  due_date TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  entered_list_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(list_id, pos);
CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labels_board ON labels(board_id);

CREATE TABLE IF NOT EXISTS card_labels (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_card_labels_label ON card_labels(label_id);

CREATE TABLE IF NOT EXISTS check_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  pos REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_check_card ON check_items(card_id, pos);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, created_at);

-- 卡片履历 + 全站动态流。移动的来去列存名字而不是 id：
-- 列改了名或删了，这条历史还得读得懂。
CREATE TABLE IF NOT EXISTS card_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  from_list TEXT,
  to_list TEXT,
  text TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_card ON card_events(card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_time ON card_events(created_at DESC);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  used_by TEXT
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;
let _stmts = new Map<string, Database.Statement>();

/**
 * 按 SQL 字符串缓存的 prepare。better-sqlite3 自己不缓存，
 * 同一条语句每次调用都重新编译——单次是微秒级，但热路径上纯属白扔。
 * 库重开（测试换库）时缓存必须一起清，旧 Statement 绑着旧连接。
 */
export function q(sql: string): Database.Statement {
  let s = _stmts.get(sql);
  if (!s) {
    s = db().prepare(sql);
    _stmts.set(sql, s);
  }
  return s;
}

export function db(): Database.Database {
  if (_db) return _db;
  // 测试用临时库靠这个环境变量指过去，生产走 cwd/data
  const dir = process.env.KANBAN_DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  _db = new Database(path.join(dir, "agents.db"));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);

  // 种子成员每次启动同步（只补不覆盖，免得把改过的显示名冲掉）
  const ins = _db.prepare(
    "INSERT OR IGNORE INTO users (id, display_name, is_admin, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const u of USERS) ins.run(u.id, u.displayName, u.isAdmin ? 1 : 0, new Date().toISOString());

  return _db;
}

/** 测试用：换库之后要能重新打开 */
export function resetDbForTests() {
  _db?.close();
  _db = null;
  _stmts = new Map();
}
