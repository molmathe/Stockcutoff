import express, { Response } from 'express';
import { spawn } from 'child_process';
import multer from 'multer';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth';
import prisma from '../lib/prisma';
import { logAudit, getClientIp } from '../lib/audit';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/temp/' });

/**
 * GET /api/database/export
 * Dumps the database to a compressed SQL file and streams it to the client.
 */
router.get('/export', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `stockcutoff_backup_${timestamp}.sql.gz`;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  // Audit log
  await logAudit({
    userId: req.user!.id,
    action: 'DATABASE_EXPORT',
    entity: 'DATABASE',
    ip: getClientIp(req),
    detail: { filename }
  });

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Parse DATABASE_URL into individual flags so credentials never appear in the process list
  const url = new URL(dbUrl);
  const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const pgArgs = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1)];

  const pgDump = spawn('pg_dump', pgArgs, { env: pgEnv });
  const gzip = spawn('gzip');

  pgDump.stdout.pipe(gzip.stdin);
  gzip.stdout.pipe(res);

  pgDump.stderr.on('data', (data) => {
    console.error(`pg_dump stderr: ${data}`);
  });

  gzip.stderr.on('data', (data) => {
    console.error(`gzip stderr: ${data}`);
  });

  gzip.on('close', (code) => {
    if (code !== 0) {
      console.error(`gzip process exited with code ${code}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Backup failed' });
      }
    }
  });
});

/**
 * POST /api/database/import
 * Restores the database from a provided .sql.gz file.
 */
router.post('/import', authenticate, requireSuperAdmin, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Strict file validation: only accept .sql.gz with gzip mimetype
  const originalName = req.file.originalname.toLowerCase();
  const mimeType = req.file.mimetype;
  if (!originalName.endsWith('.sql.gz') || !['application/gzip', 'application/x-gzip'].includes(mimeType)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only .sql.gz files are accepted for database restore' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const filePath = req.file.path;

  try {
    // Parse DATABASE_URL into individual flags so credentials never appear in the process list
    const url = new URL(dbUrl);
    const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const pgArgs = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1)];

    const gunzip = spawn('gunzip', ['-c', filePath]);
    const psql = spawn('psql', pgArgs, { env: pgEnv });

    gunzip.stdout.pipe(psql.stdin);

    let stderr = '';
    psql.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    psql.on('close', async (code) => {
      // Delete temp file
      fs.unlinkSync(filePath);

      if (code === 0) {
        // Audit log
        await logAudit({
          userId: req.user!.id,
          action: 'DATABASE_IMPORT',
          entity: 'DATABASE',
          ip: getClientIp(req),
          detail: { filename: req.file!.originalname }
        });

        console.log('Database restored successfully');
        res.json({ message: 'Database restored successfully' });
      } else {
        console.error(`psql process exited with code ${code}: ${stderr}`);
        res.status(500).json({ error: 'Restore failed', details: stderr });
      }
    });
  } catch (error: any) {
    console.error('Import error:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Import failed', details: error.message });
  }
});

export default router;
