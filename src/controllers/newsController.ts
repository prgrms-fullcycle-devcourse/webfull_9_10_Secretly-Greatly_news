import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import type {
  NewsArticleRow,
  LatestNewsResponse,
  ErrorResponse,
} from '../interfaces/news.interface.js';

/**
 * 최신 뉴스 기사를 조회하는 컨트롤러
 * GET /api/news/latest
 */
export async function getLatestNews(
  req: Request<
    Record<string, never>,
    LatestNewsResponse | ErrorResponse,
    never,
    { keyword?: string; category?: string; limit?: string }
  >,
  res: Response<LatestNewsResponse | ErrorResponse>,
): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? '40', 10) || 40, 100);

    let query = supabase
      .from('news_articles')
      .select('*')
      .order('collected_at', { ascending: false })
      .limit(limit);

    // 키워드 필터
    const keyword = req.query.keyword;
    if (keyword && typeof keyword === 'string') {
      query = query.eq('keyword', keyword);
    }

    // 카테고리 필터
    const category = req.query.category;
    if (category && typeof category === 'string') {
      query = query.eq('category', category);
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
    res.status(500).json({ success: false, error: '내부 서버 오류' });
  }
}
