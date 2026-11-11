// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { errorHandler } from './errors.js';
import { licenseGate } from './license.js';
import interviewerRoutes from './routes/interviewer.js';
import sessionRoutes from './routes/session.js';
import studentRoutes from './routes/student.js';
import teamRoutes from './routes/team.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(process.env.PUBLIC_DIR || path.join(here, '../../client/dist'));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use(licenseGate);
  app.use('/api', loadUser);
  app.use('/api', sessionRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/interviewer', interviewerRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
