import { Router } from 'express';
import { getLatestNews } from '../controllers/newsController.js';

const router: Router = Router();

// GET /api/news/latest
router.get('/latest', getLatestNews);

export default router;
