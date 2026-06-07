import express from 'express';
import { env } from './config/env.js';
import { startScheduler } from './jobs/newsScheduler.js';
import newsRouter from './routes/newsRouter.js';
import healthRouter from './routes/healthRouter.js';

const app = express();
app.use(express.json());

// ── 라우터 등록 ──────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/api/news', newsRouter);

// ── 서버 시작 ────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`\n🌐 서버 실행 중: http://localhost:${env.PORT}`);
  console.log(`   📡 GET /api/news/latest`);
  console.log(`   📡 GET /api/news/latest?keyword=주식`);
  console.log(`   📡 GET /api/news/latest?category=stock`);
  console.log(`   💚 GET /health\n`);

  startScheduler();
});

