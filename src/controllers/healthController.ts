import type { Request, Response } from 'express';

/**
 * @swagger
 * /health:
 *   get:
 *     summary: 서버 상태 점검 (Health Check)
 *     description: 서버 구동 상태(상태, 타임스탬프, 업타임)를 점검하여 Render 인스턴스 활성화 유지를 돕습니다.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: 서버가 정상 작동 중임
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   example: "2026-06-08T09:00:00.000Z"
 *                 uptime:
 *                   type: number
 *                   example: 1234.56
 */
export function getHealth(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
