import { Router } from 'express';
import { getLatestNews } from '../controllers/newsController.js';

const router: Router = Router();

// GET 최신 뉴스 조회 API (/api/news/latest)
router.get('/latest', getLatestNews);

export default router;
