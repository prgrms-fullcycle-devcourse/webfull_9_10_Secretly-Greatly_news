// ─────────────────────────────────────────────────────────────
// Express 서버 + API 라우터 + 스케줄러 기동
// ─────────────────────────────────────────────────────────────

import express, { type Request, type Response } from "express";
import { env } from "./config/env.js";
import { supabase } from "./config/supabase.js";
import { startScheduler } from "./jobs/newsScheduler.js";
import type {
  NewsArticleRow,
  LatestNewsResponse,
  ErrorResponse,
} from "./interfaces/news.interface.js";

const app = express();
app.use(express.json());

// ── Health Check ─────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── GET /api/news/latest ─────────────────────────────────────
app.get(
  "/api/news/latest",
  async (
    req: Request<
      Record<string, never>,
      LatestNewsResponse | ErrorResponse,
      never,
      { keyword?: string; category?: string; limit?: string }
    >,
    res: Response<LatestNewsResponse | ErrorResponse>,
  ) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? "40", 10) || 40, 100);

      let query = supabase
        .from("news_articles")
        .select("*")
        .order("collected_at", { ascending: false })
        .limit(limit);

      // 키워드 필터
      const keyword = req.query.keyword;
      if (keyword && typeof keyword === "string") {
        query = query.eq("keyword", keyword);
      }

      // 카테고리 필터
      const category = req.query.category;
      if (category && typeof category === "string") {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) {
        res.status(500).json({
          success: false,
          error: `데이터 조회 실패: ${error.message}`,
        });
        return;
      }

      const rows = (data ?? []) as NewsArticleRow[];

      const response: LatestNewsResponse = {
        success: true,
        data: rows,
        count: rows.length,
        fetchedAt: new Date().toISOString(),
      };

      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ /api/news/latest 오류: ${message}`);
      res.status(500).json({ success: false, error: "내부 서버 오류" });
    }
  },
);

// ── 서버 시작 ────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`\n🌐 서버 실행 중: http://localhost:${env.PORT}`);
  console.log(`   📡 GET /api/news/latest`);
  console.log(`   📡 GET /api/news/latest?keyword=주식`);
  console.log(`   📡 GET /api/news/latest?category=stock`);
  console.log(`   💚 GET /health\n`);

  startScheduler();
});
