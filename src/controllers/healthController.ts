import type { Request, Response } from 'express';

/**
 * 서버 상태 점검 컨트롤러
 * GET /health
 */
export function getHealth(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
