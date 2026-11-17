import type { RequestHandler } from 'express';

export const healthHandler: RequestHandler = (_req, res) => {
  res.status(200).json({ ok: true, service: 'astrocare-api', status: 'ready', timestamp: new Date().toISOString() });
};
