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

// Rota para listar schemas
router.get('/schemas', async (_req, res) => {
  const pool = getPool();
  try {
    const result = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg_%' 
      AND schema_name != 'information_schema'
    `);
    
    await pool.end();
    
    res.json({
      success: true,
      schemas: result.rows.map(row => row.schema_name)
    });
  } catch (error: any) {
    console.error('Erro ao listar schemas:', error);
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão:', e);
    }
    
    res.status(500).json({
      success: false,
      error: `Erro ao listar schemas: ${error.message}`
    });
  }
});

// Rota para listar tabelas de um schema
router.get('/tabelas/:schema', async (req, res) => {
  const { schema } = req.params;
  const pool = getPool();
  
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `, [schema]);
    
    await pool.end();
    
    res.json({
      success: true,
      schema,
      tabelas: result.rows.map(row => row.table_name)
    });
  } catch (error: any) {
    console.error(`Erro ao listar tabelas do schema ${schema}:`, error);
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão:', e);
    }
    
    res.status(500).json({
      success: false,
      error: `Erro ao listar tabelas: ${error.message}`
    });
  }
});

// Rota para listar tutores
router.get('/tutores', async (_req, res) => {
  const pool = getPool();
  try {
    // Tentar primeiro com schema public
    try {
      const result = await pool.query(`
        SELECT id, id_vetsoft, nome
        FROM public.clientes
        ORDER BY id
        LIMIT 10
      `);
      
      await pool.end();
      
      return res.json({
        success: true,
        schema: 'public',
        tutores: result.rows
      });
    } catch (publicError: any) {
      console.error('Erro ao buscar tutores no schema public:', publicError);
      
      // Tentar com schema dranimal
      try {
        const result = await pool.query(`
          SELECT id, id_vetsoft, nome
          FROM dranimal.clientes
          ORDER BY id
          LIMIT 10
        `);
        
        await pool.end();
        
        return res.json({
          success: true,
          schema: 'dranimal',
          tutores: result.rows
        });
      } catch (drAnimalError: any) {
        console.error('Erro ao buscar tutores no schema dranimal:', drAnimalError);
        await pool.end();
        throw new Error(`Erro ao buscar tutores: ${publicError.message} / ${drAnimalError.message}`);
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
