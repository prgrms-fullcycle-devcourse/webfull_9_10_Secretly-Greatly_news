import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import type {
  NewsArticleRow,
  LatestNewsResponse,
  ErrorResponse,
  NewsTimelineItem,
  NewsTimelineResponse,
} from '../interfaces/news.interface.js';
import { env } from '../config/env.js';

/** 네이버 pub_date(RFC-822 등) 문자열을 ISO-8601로 변환. 파싱 실패 시 원본 유지 */
function toIsoDate(raw: string): string {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

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
 *         description: "검색 키워드 필터 (예: 국내증시, 해외증시, 경제)"
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
    { keyword?: string; limit?: string }
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

/**
 * @swagger
 * /api/v1/news-feed:
 *   get:
 *     summary: AI 분석 뉴스 타임라인 조회 (백엔드 프록시 전용)
 *     description: >
 *       백엔드(NestJS)가 프록시로 호출하는 엔드포인트.
 *       당일 수집된 뉴스를 최신순으로 반환한다.
 *       (DB는 매일 00시 KST에 전날 데이터가 삭제되므로 사실상 당일 한정 스냅샷)
 *     tags:
 *       - News
 *     responses:
 *       200:
 *         description: 타임라인 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count: { type: integer, example: 2 }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer, example: 1 }
 *                       title: { type: string, example: "코스피 상승 마감" }
 *                       tag: { type: string, nullable: true, example: "EARNINGS" }
 *                       source: { type: string, example: "연합뉴스" }
 *                       summary: { type: string, nullable: true, example: "코스피가 외국인 매수세에 상승 마감했다." }
 *                       link: { type: string, example: "https://news.naver.com/..." }
 *                       pub_date: { type: string, example: "2026-06-05T15:40:15.000Z" }
 *       500:
 *         description: 서버 조회 실패 또는 내부 서버 오류
 */
export async function getNewsTimeline(
  _req: Request,
  res: Response<NewsTimelineResponse | ErrorResponse>,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('news_articles')
      .select('id, title, tag, source, summary, link, pub_date')
      .order('collected_at', { ascending: false })
      .limit(env.MAX_RECORDS_KEEP);

    if (error) {
      res.status(500).json({
        success: false,
        error: `데이터 조회 실패: ${error.message}`,
      });
      return;
    }

    const rows = (data ?? []) as NewsArticleRow[];

    const items: NewsTimelineItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      tag: row.tag ?? null,
      source: row.source,
      summary: row.summary ?? null,
      link: row.link,
      pub_date: toIsoDate(row.pub_date),
    }));

    res.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ /api/news 오류: ${message}`);
    res.status(500).json({ success: false, error: '내부 서버 오류' });
  }
}
