import express from 'express';
import { Pool } from 'pg';

const router = express.Router();

// Configuração do cliente PostgreSQL
const getPool = () => {
  // Determina se estamos em ambiente de produção ou local
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!process.env.PG_USER || !process.env.PG_PASSWORD) {
    throw new Error('Credenciais do PostgreSQL não configuradas nas variáveis de ambiente');
  }
  
  console.log('Conectando ao banco de dados:');
  console.log(`Host: ${isProduction ? process.env.PG_HOST : process.env.PG_HOST_LOCAL}`);
  console.log(`Database: ${process.env.PG_DATABASE}`);
  
  return new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: isProduction ? process.env.PG_HOST : process.env.PG_HOST_LOCAL,
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE
  });
};

// Rota para testar conexão com o banco
router.get('/conexao', async (_req, res) => {
  const pool = getPool();
  try {
    const result = await pool.query('SELECT NOW()');
    await pool.end();
    
    res.json({
      success: true,
      message: 'Conexão com o banco de dados estabelecida com sucesso',
      timestamp: result.rows[0].now
    });
  } catch (error: any) {
    console.error('Erro ao conectar ao banco de dados:', error);
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão:', e);
    }
    
    res.status(500).json({
      success: false,
      error: `Erro ao conectar ao banco de dados: ${error.message}`
    });
  }
});

// Rota para buscar tutores específicos
router.get('/tutores-especificos', async (_req, res) => {
  const pool = getPool();
  const tutorIds = [14, 48, 24, 29]; // IDs mencionados no erro
  
  try {
    // Buscar no schema public
    try {
      const result = await pool.query(`
        SELECT id, id_vetsoft, nome
        FROM public.clientes
        WHERE id_vetsoft = ANY($1::int[])
      `, [tutorIds]);
      
      if (result.rows.length > 0) {
        await pool.end();
        return res.json({
          success: true,
          schema: 'public',
          tutores: result.rows,
          mensagem: `Encontrados ${result.rows.length} tutores de ${tutorIds.length} buscados`
        });
      } else {
        console.log('Nenhum tutor encontrado no schema public, tentando schema dranimal');
      }
    } catch (publicError: any) {
      console.error('Erro ao buscar tutores no schema public:', publicError);
    }
    
    // Tentar com schema dranimal
    try {
      const result = await pool.query(`
        SELECT id, id_vetsoft, nome
        FROM dranimal.clientes
        WHERE id_vetsoft = ANY($1::int[])
      `, [tutorIds]);
      
      await pool.end();
      
      return res.json({
        success: true,
        schema: 'dranimal',
        tutores: result.rows,
        mensagem: `Encontrados ${result.rows.length} tutores de ${tutorIds.length} buscados`
      });
    } catch (drAnimalError: any) {
      console.error('Erro ao buscar tutores no schema dranimal:', drAnimalError);
      await pool.end();
      
      return res.status(500).json({
        success: false,
        error: `Erro ao buscar tutores no schema dranimal: ${drAnimalError.message}`
      });
    }
  } catch (error: any) {
    console.error('Erro ao buscar tutores específicos:', error);
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão:', e);
    }
    
    return res.status(500).json({
      success: false,
      error: `Erro ao buscar tutores específicos: ${error.message}`
    });
  }
});

// Rota para listar todos os tutores
router.get('/todos-tutores', async (_req, res) => {
  const pool = getPool();
  
  try {
    // Tentar primeiro com schema public
    try {
      const result = await pool.query(`
        SELECT id, id_vetsoft, nome
        FROM public.clientes
        ORDER BY id
        LIMIT 20
      `);
      
      await pool.end();
      
      return res.json({
        success: true,
        schema: 'public',
        tutores: result.rows,
        total: result.rows.length
      });
    } catch (publicError: any) {
      console.error('Erro ao buscar tutores no schema public:', publicError);
      
      // Tentar com schema dranimal
      try {
        const result = await pool.query(`
          SELECT id, id_vetsoft, nome
          FROM dranimal.clientes
          ORDER BY id
          LIMIT 20
        `);
        
        await pool.end();
        
        return res.json({
          success: true,
          schema: 'dranimal',
          tutores: result.rows,
          total: result.rows.length
        });
      } catch (drAnimalError: any) {
        console.error('Erro ao buscar tutores no schema dranimal:', drAnimalError);
        await pool.end();
        
        return res.status(500).json({
          success: false,
          error: `Erro ao buscar tutores: ${publicError.message} / ${drAnimalError.message}`
        });
      }
    }
  } catch (error: any) {
    console.error('Erro ao listar tutores:', error);
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão:', e);
    }
    
    return res.status(500).json({
      success: false,
      error: `Erro ao listar tutores: ${error.message}`
    });
  }
});

export default router;
