import { Router } from 'express';
import { config } from '../config';

const router = Router();

// Rota para obter configurações do Supabase para o frontend
router.get('/supabase', (_req, res) => {
  res.json({
    url: config.supabase.url,
    key: config.supabase.key,
    schema: 'dranimal'
  });
});

export default router;
