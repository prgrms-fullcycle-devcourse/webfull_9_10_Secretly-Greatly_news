import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import type {
  NewsArticleRow,
  LatestNewsResponse,
  ErrorResponse,
} from '../interfaces/news.interface.js';

/**
 * @swagger
 * /news/latest:
 *   get:
 *     summary: 최신 뉴스 기사 조회
 *     description: 데이터베이스에 적재된 최신 경제 뉴스 기사 목록을 키워드/카테고리 필터와 개수 제한을 설정하여 조회합니다.
 *     tags:
 *       - News
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: "검색 키워드 필터 (예: 주식, 코인, 암호화폐, 경제)"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [stock, coin, crypto, economy, general]
 *         description: 기사 카테고리 필터
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 40
 *         description: 조회할 기사 최대 개수 (최소 1, 최대 100)
 *     responses:
 *       200:
 *         description: 최신 뉴스 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 123
 *                       keyword:
 *                         type: string
 *                         example: "주식"
 *                       title:
 *                         type: string
 *                         example: "코스피 상승 마감"
 *                       link:
 *                         type: string
 *                         example: "https://news.naver.com/..."
 *                       description:
 *                         type: string
 *                         example: "오늘 코스피가..."
 *                       pub_date:
 *                         type: string
 *                         example: "Mon, 08 Jun 2026 09:00:00 +0900"
 *                       source:
 *                         type: string
 *                         example: "연합뉴스"
 *                       category:
 *                         type: string
 *                         example: "stock"
 *                       summary:
 *                         type: string
 *                         nullable: true
 *                         example: "• 코스피 상승.\n• 외국인 매수세."
 *                       collected_at:
 *                         type: string
 *                         example: "2026-06-08T09:00:00.000Z"
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 fetchedAt:
 *                   type: string
 *                   example: "2026-06-08T09:51:00.000Z"
 *       500:
 *         description: 서버 조회 실패 또는 내부 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "데이터 조회 실패: Database error"
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
