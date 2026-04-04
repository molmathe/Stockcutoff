import express, { Response } from 'express';
import { spawn } from 'child_process';
import multer from 'multer';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/temp/' });

/**
 * GET /api/database/export
 * Dumps the database + uploads directory into a single .tar.gz archive and streams it to the client.
 * Archive layout:
 *   database.sql   — full pg_dump output
 *   uploads/       — all uploaded files (slip images, item images); temp/ excluded
 */
router.get('/export', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `stockcutoff_backup_${timestamp}.tar.gz`;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const tmpDir = path.join('/tmp', `stockcutoff_export_${Date.now()}`);
  const sqlPath = path.join(tmpDir, 'database.sql');

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Parse DATABASE_URL into individual flags so credentials never appear in the process list
    const url = new URL(dbUrl);
    const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const pgArgs = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1)];

    // Step 1: dump database to temp file — wait for completion before streaming response
    await new Promise<void>((resolve, reject) => {
      const pgDump = spawn('pg_dump', pgArgs, { env: pgEnv });
      const sqlWrite = fs.createWriteStream(sqlPath);
      pgDump.stdout.pipe(sqlWrite);
      pgDump.stderr.on('data', (d) => console.error(`pg_dump stderr: ${d}`));
      pgDump.on('close', (code) => {
        if (code !== 0) reject(new Error(`pg_dump exited with code ${code}`));
        else resolve();
      });
    });

    // Audit log — recorded after successful dump, before streaming
    await logAudit({
      userId: req.user!.id,
      action: 'DATABASE_EXPORT',
      entity: 'DATABASE',
      ip: getClientIp(req),
      detail: { filename }
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Step 2: stream tar.gz of database.sql + uploads/ to response
    // --exclude=uploads/temp skips the multer temp upload directory
    const tar = spawn('tar', [
      '-czf', '-',
      '--exclude=uploads/temp',
      '-C', tmpDir, 'database.sql',
      '-C', '/app', 'uploads',
    ]);

    tar.stdout.pipe(res);
    tar.stderr.on('data', (d) => console.error(`tar stderr: ${d}`));
    tar.on('close', () => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

  } catch (err: any) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.error('Export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed', details: err.message });
    }
  }
});

/**
 * POST /api/database/import
 * Restores the database and uploads from a .tar.gz backup archive produced by the export endpoint.
 */
router.post('/import', authenticate, requireSuperAdmin, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Strict file validation: require .tar.gz extension
  const originalName = req.file.originalname.toLowerCase();
  if (!originalName.endsWith('.tar.gz')) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only .tar.gz backup files are accepted for database restore' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const filePath = req.file.path;
  const extractDir = path.join('/tmp', `stockcutoff_import_${Date.now()}`);

  try {
    fs.mkdirSync(extractDir, { recursive: true });

    // Step 1: extract the tar.gz archive
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', filePath, '-C', extractDir]);
      tar.stderr.on('data', (d) => console.error(`tar extract stderr: ${d}`));
      tar.on('close', (code) => {
        if (code !== 0) reject(new Error(`tar exited with code ${code}`));
        else resolve();
      });
    });

    // Step 2: restore database from database.sql
    const sqlPath = path.join(extractDir, 'database.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error('database.sql not found in backup archive');
    }

    const url = new URL(dbUrl);
    const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const pgArgs = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1)];

    await new Promise<void>((resolve, reject) => {
      const psql = spawn('psql', pgArgs, { env: pgEnv });
      fs.createReadStream(sqlPath).pipe(psql.stdin);
      let stderr = '';
      psql.stderr.on('data', (d) => { stderr += d.toString(); });
      psql.on('close', (code) => {
        if (code !== 0) reject(new Error(`psql exited with code ${code}: ${stderr}`));
        else resolve();
      });
    });

    // Step 3: restore uploads — copy files from archive into /app/uploads/, skip temp/
    const extractedUploads = path.join(extractDir, 'uploads');
    if (fs.existsSync(extractedUploads)) {
      const files = fs.readdirSync(extractedUploads);
      for (const file of files) {
        if (file === 'temp') continue;
        const src = path.join(extractedUploads, file);
        const dest = path.join('/app/uploads', file);
        if (fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dest);
        }
      }
    }

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'DATABASE_IMPORT',
      entity: 'DATABASE',
      ip: getClientIp(req),
      detail: { filename: req.file!.originalname }
    });

    // Cleanup
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(filePath);

    console.log('Database and uploads restored successfully');
    res.json({ message: 'Database and uploads restored successfully' });

  } catch (error: any) {
    console.error('Import error:', error);
    fs.rmSync(extractDir, { recursive: true, force: true });
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Restore failed', details: error.message });
  }
});

export default router;
