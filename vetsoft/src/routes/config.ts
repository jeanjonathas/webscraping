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

// Rota para obter a API key para o frontend
router.get('/api-key', (_req, res) => {
  res.json({
    apiKey: process.env.API_KEY || 'supervet_vetsoft_api_2025'
  });
});

export default router;
