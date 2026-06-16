import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { startScheduler } from './jobs/newsScheduler.js';
import { swaggerSpec } from './config/swagger.js';
import newsRouter from './routes/newsRouter.js';
import newsApiRouter from './routes/newsApiRouter.js';
import healthRouter from './routes/healthRouter.js';

const app = express();
app.use(express.json());

// ── 라우터 등록 ──────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/health', healthRouter);
app.use('/api/news', newsApiRouter);
app.use('/news', newsRouter);

// ── 서버 시작 ────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`\n🌐 서버 실행 중: http://localhost:${env.PORT}`);
  console.log(`   📡 GET /api/news        (백엔드 프록시용 타임라인)`);
  console.log(`   📡 GET /news/latest`);
  console.log(`   📡 GET /news/latest?keyword=주식`);
  console.log(`   💚 GET /health`);
  console.log(`   📖 Swagger API Docs: http://localhost:${env.PORT}/docs\n`);

  startScheduler();
});
