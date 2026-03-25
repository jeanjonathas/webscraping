import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { apiKeyAuth } from '../middlewares/apiKeyAuth';

const router = Router();

// GET /api/clickup-config - Público (usado pela extensão)
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('clickup_config')
      .select('value')
      .eq('key', 'settings')
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Registro não encontrado
        return res.json({
          categories: ["Suporte", "Reembolso", "Exames", "Veterinário"],
          categoryToListMapping: {},
          userMapping: {},
          allowedLists: []
        });
      }
      throw error;
    }
    return res.json(data.value);
  } catch (err: any) {
    console.error('Erro ao buscar config ClickUp:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/clickup-config - Protegido (usado pelo admin)
router.post('/', apiKeyAuth, async (req, res) => {
  try {
    // No frontend o body será { value: { ... } }
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: 'Configurações não fornecidas' });

    const { data, error } = await supabase
      .from('clickup_config')
      .upsert({ key: 'settings', value: settings, updated_at: new Date() })
      .select();

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Erro ao salvar config ClickUp:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
