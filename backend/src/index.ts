import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import authRoutes from './routes/auth';
import itemRoutes from './routes/items';
import branchRoutes from './routes/branches';
import billRoutes from './routes/bills';
import userRoutes from './routes/users';
import reportRoutes from './routes/reports';
import categoryRoutes from './routes/categories';
import reportTemplateRoutes from './routes/report-templates';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/report-templates', reportTemplateRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
