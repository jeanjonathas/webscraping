import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// Busca clientes por nome ou código
router.get('/busca', async (req, res) => {
  const { termo } = req.query;
  
  if (!termo) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer um termo de busca'
    });
  }

  try {
    // Busca clientes que correspondam ao termo (nome ou código)
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select(`
        id,
        codigo,
        nome,
        animais (
          id,
          codigo,
          nome
        )
      `)
      .or(`nome.ilike.%${termo}%,codigo.eq.${termo}`);

    if (clientesError) {
      throw clientesError;
    }

    res.json({
      success: true,
      data: clientes.map(cliente => ({
        codigo: cliente.codigo,
        nome: cliente.nome,
        animais: cliente.animais
      }))
    });

  } catch (error: any) {
    console.error('Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

export default router;
