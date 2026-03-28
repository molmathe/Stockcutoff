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

  // Use pg_dump and pipe to gzip, then to response
  const pgDump = spawn('pg_dump', [dbUrl]);
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

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const filePath = req.file.path;

  try {
    // Restore using gunzip and psql
    // We use --clean and --if-exists to drop existing objects if they are in the dump
    // However, if the dump is just a standard pg_dump, we might need to drop the schema first
    // For a more robust restore, we can drop and recreate the public schema
    
    const gunzip = spawn('gunzip', ['-c', filePath]);
    const psql = spawn('psql', [dbUrl]);

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
