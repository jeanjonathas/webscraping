import { Router } from 'express';
import { query } from '../lib/db';
import { apiKeyAuth } from '../middlewares/apiKeyAuth';

const router = Router();

// GET /api/clickup-config - Público (usado pela extensão)
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      "SELECT value FROM clickup_config WHERE key = $1",
      ['settings']
    );

    if (result.rows.length === 0) {
      // Registro não encontrado - Retorna valores padrão
      return res.json({
        categories: ["Suporte", "Reembolso", "Exames", "Veterinário"],
        categoryToListMapping: {},
        userMapping: {},
        allowedLists: []
      });
    }

    return res.json(result.rows[0].value);
  } catch (err: any) {
    console.error('Erro ao buscar config ClickUp:', err);
    
    // Se a tabela não existir, retorna os dados padrão para não quebrar o frontend
    if (err.message.includes('relation "clickup_config" does not exist')) {
      return res.json({
        categories: ["Suporte", "Reembolso", "Exames", "Veterinário"],
        categoryToListMapping: {},
        userMapping: {},
        allowedLists: []
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

// POST /api/clickup-config - Protegido (usado pelo admin)
router.post('/', apiKeyAuth, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: 'Configurações não fornecidas' });

    // Upsert no PostgreSQL
    await query(`
      INSERT INTO clickup_config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = NOW()
    `, ['settings', JSON.stringify(settings)]);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Erro ao salvar config ClickUp:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
