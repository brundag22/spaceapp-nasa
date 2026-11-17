import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import authRoutes from './auth/routes.js';
import astronautRoutes from './controllers/astronauts.js';
import anatomyRoutes from './controllers/anatomy.js';
import emergencyRoutes from './controllers/emergency.js';
import reportRoutes from './controllers/reports.js';
import simulatorRoutes from './controllers/simulator.js';
import { HttpError } from './errors.js';
import { healthHandler } from './health.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    xFrameOptions: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: null,
      },
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get('/_app/health', healthHandler);
  app.use('/api/auth', authRoutes);
  app.use('/api', astronautRoutes);
  app.use('/api', anatomyRoutes);
  app.use('/api', emergencyRoutes);
  app.use('/api', reportRoutes);
  app.use('/api', simulatorRoutes);

  if (process.env.NODE_ENV === 'production') {
    const clientRoot = resolve(process.cwd(), 'dist/client');
    app.use(express.static(clientRoot, { index: false, maxAge: '1h' }));
    app.get('*path', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/_app/') || req.path === '/ws') return next();
      res.sendFile(resolve(clientRoot, 'index.html'));
    });
  }

  app.use((_req, res) => res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'Some submitted fields need attention.', code: 'VALIDATION_ERROR', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code ?? 'REQUEST_ERROR' });
      return;
    }
    console.error('Unhandled AstroCare API error:', error instanceof Error ? error.message : 'unknown error');
    res.status(500).json({ error: 'The request could not be completed. Please try again.', code: 'INTERNAL_ERROR' });
  };
  app.use(errors);
  return app;
}
