import { Router } from 'express';
import { getNewsTimeline } from '../controllers/newsController.js';

const router: Router = Router();

// GET /api/news — 백엔드(NestJS) 프록시가 호출하는 타임라인 조회
router.get('/', getNewsTimeline);

export default router;
