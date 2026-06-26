import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { rateLimit } from './middleware/rate-limit.js';
import earthDataRouter from './routes/earth-data.js';
import healthRouter from './routes/health.js';
import issRouter from './routes/iss.js';

const app = express();
app.use(compression());
const port = Number(process.env.PORT) || 3000;

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET'],
  }),
);
app.use(express.json());
app.use(rateLimit);

app.use('/health', healthRouter);
app.use('/api/earth-data', earthDataRouter);
app.use('/api/iss', issRouter);

app.listen(port, () => {
  console.log(`Earth Live API → http://localhost:${port}`);
});
