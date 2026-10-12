import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    fileParallelism: false,
    // 碰数据库的测试写到这个临时目录，绝不碰 data/kanban.db
    env: { KANBAN_SECRET: "test-only-secret-at-least-32-characters", KANBAN_DATA_DIR: process.env.KANBAN_DATA_DIR ?? path.resolve(__dirname, "tests/.tmp") },
  },
});
