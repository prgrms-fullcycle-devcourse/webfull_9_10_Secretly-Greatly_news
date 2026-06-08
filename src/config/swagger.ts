import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env.js';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '경제 뉴스 수집 API 명세서',
      version: '1.0.0',
      description: '경제 뉴스를 수집, 적재 및 조회하는 서비스의 API 명세서입니다.',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: '로컬 개발 서버',
      },
    ],
  },
  apis: [
    './src/controllers/*.ts',
    './src/routes/*.ts',
    './dist/controllers/*.js',
    './dist/routes/*.js',
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
