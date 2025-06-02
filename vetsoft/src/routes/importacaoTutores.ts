import { Router } from 'express';
import { Pool } from 'pg';

const router = Router();

// Interface para os dados de clientes
interface Cliente {
  id_vetsoft?: number;
  tipo: string;
  nome: string;
  cpf?: string;
  rg?: string;
  nascimento?: string | null;
  cep?: string;
  estado?: string;
  cidade?: string;
  bairro?: string;
  endereco_tipo?: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  local_trabalho?: string;
  grupo?: string;
  como_conheceu?: string;
  observacoes?: string;
  situacao?: string;
}

// Configuração do cliente PostgreSQL
const getPool = () => {
  // Determina se estamos em ambiente de produção ou local
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!process.env.PG_USER || !process.env.PG_PASSWORD) {
    throw new Error('Credenciais do PostgreSQL não configuradas nas variáveis de ambiente');
  }
  
  return new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: isProduction ? process.env.PG_HOST : process.env.PG_HOST_LOCAL,
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE
  });
};

// Função para verificar se um cliente existe
async function verificarCliente(id_vetsoft: number): Promise<Cliente | null> {
  const pool = getPool();
  try {
    const result = await pool.query(
      'SELECT * FROM public.clientes WHERE id_vetsoft = $1',
      [id_vetsoft]
    );
    
    await pool.end();
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error: any) {
    console.error('Erro ao verificar cliente:', error);
    await pool.end();
    throw error;
  }
}

// Rota para importar um único cliente
router.post('/tutores', async (req, res) => {
  const pool = getPool();
  try {
    const cliente: Cliente = req.body;
    
    console.log(`Importando tutor: ${cliente.nome}`);
    console.log('Dados do tutor:', JSON.stringify(cliente));
    
    // Verificar se o cliente já existe
    let clienteExistente = null;
    if (cliente.id_vetsoft) {
      try {
        clienteExistente = await verificarCliente(cliente.id_vetsoft);
      } catch (error: any) {
        console.error('Erro ao verificar cliente existente:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao verificar cliente existente: ${error.message}`
        });
      }
    }
    
    let resultado;
    
    if (clienteExistente !== null) {
      // Atualizar cliente existente
      const query = `
        UPDATE public.clientes SET 
          tipo = $1, 
          nome = $2, 
          cpf = $3, 
          rg = $4, 
          nascimento = $5, 
          cep = $6, 
          estado = $7, 
          cidade = $8, 
          bairro = $9, 
          endereco_tipo = $10, 
          endereco_logradouro = $11, 
          endereco_numero = $12, 
          endereco_complemento = $13, 
          local_trabalho = $14, 
          grupo = $15, 
          como_conheceu = $16, 
          observacoes = $17,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_vetsoft = $18
        RETURNING *
      `;
      
      try {
        const result = await pool.query(query, [
          cliente.tipo,
          cliente.nome,
          cliente.cpf || null,
          cliente.rg || null,
          cliente.nascimento ? new Date(cliente.nascimento) : null,
          cliente.cep || null,
          cliente.estado || null,
          cliente.cidade || null,
          cliente.bairro || null,
          cliente.endereco_tipo || null,
          cliente.endereco_logradouro || null,
          cliente.endereco_numero || null,
          cliente.endereco_complemento || null,
          cliente.local_trabalho || null,
          cliente.grupo || null,
          cliente.como_conheceu || null,
          cliente.observacoes || null,
          cliente.id_vetsoft
        ]);
        
        resultado = { data: result.rows[0], atualizado: true };
      } catch (error: any) {
        console.error('Erro ao atualizar cliente:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao atualizar cliente: ${error.message}`
        });
      }
    } else {
      // Inserir novo cliente
      const query = `
        INSERT INTO public.clientes (
          id_vetsoft, tipo, nome, cpf, rg, nascimento, cep, estado, cidade, 
          bairro, endereco_tipo, endereco_logradouro, endereco_numero, 
          endereco_complemento, local_trabalho, grupo, como_conheceu, observacoes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        RETURNING *
      `;
      
      try {
        // Verificar se id_vetsoft é um número válido
        console.log(`Processando cliente: ${cliente.nome}, ID VetSoft: ${cliente.id_vetsoft}`);
        
        const result = await pool.query(query, [
          cliente.id_vetsoft,
          cliente.tipo,
          cliente.nome,
          cliente.cpf || null,
          cliente.rg || null,
          cliente.nascimento ? new Date(cliente.nascimento) : null,
          cliente.cep || null,
          cliente.estado || null,
          cliente.cidade || null,
          cliente.bairro || null,
          cliente.endereco_tipo || null,
          cliente.endereco_logradouro || null,
          cliente.endereco_numero || null,
          cliente.endereco_complemento || null,
          cliente.local_trabalho || null,
          cliente.grupo || null,
          cliente.como_conheceu || null,
          cliente.observacoes || null
        ]);
        
        resultado = { data: result.rows[0], atualizado: false };
      } catch (error: any) {
        console.error('Erro ao inserir cliente:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao inserir cliente: ${error.message}`
        });
      }
    }
    
    await pool.end();
    
    return res.status(200).json({
      success: true,
      data: resultado
    });
    
  } catch (error: any) {
    console.error('Erro ao processar importação de cliente:', error);
    console.error('Detalhes do erro:', JSON.stringify(error));
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão com o banco:', e);
    }
    
    return res.status(500).json({
      success: false,
      error: `Erro ao processar importação: ${error.message}`
    });
  }
});

// Rota para importar múltiplos clientes de uma vez
router.post('/tutores/batch', async (req, res) => {
  const pool = getPool();
  try {
    const clientes: Cliente[] = req.body.clientes;
    
    if (!Array.isArray(clientes)) {
      return res.status(400).json({
        success: false,
        error: 'O corpo da requisição deve conter um array de clientes'
      });
    }
    
    console.log(`Iniciando importação em lote de ${clientes.length} clientes`);
    
    const resultados = {
      total: clientes.length,
      sucessos: 0,
      erros: 0,
      detalhes: [] as any[]
    };
    
    for (const cliente of clientes) {
      try {
        console.log(`Processando cliente: ${cliente.nome}`);
        
        // Verificar se o cliente já existe
        let clienteExistente = null;
        if (cliente.id_vetsoft) {
          try {
            clienteExistente = await verificarCliente(cliente.id_vetsoft);
          } catch (error: any) {
            console.error('Erro ao verificar cliente existente:', error);
            throw new Error(`Erro ao verificar cliente existente: ${error.message}`);
          }
        }
        
        let resultado;
        
        if (clienteExistente !== null) {
          // Atualizar cliente existente
          const query = `
            UPDATE public.clientes SET 
              tipo = $1, 
              nome = $2, 
              cpf = $3, 
              rg = $4, 
              nascimento = $5, 
              cep = $6, 
              estado = $7, 
              cidade = $8, 
              bairro = $9, 
              endereco_tipo = $10, 
              endereco_logradouro = $11, 
              endereco_numero = $12, 
              endereco_complemento = $13, 
              local_trabalho = $14, 
              grupo = $15, 
              como_conheceu = $16, 
              observacoes = $17,
              data_atualizacao = CURRENT_TIMESTAMP
            WHERE id_vetsoft = $18
            RETURNING *
          `;
          
          try {
            const result = await pool.query(query, [
              cliente.tipo,
              cliente.nome,
              cliente.cpf || null,
              cliente.rg || null,
              cliente.nascimento ? new Date(cliente.nascimento) : null,
              cliente.cep || null,
              cliente.estado || null,
              cliente.cidade || null,
              cliente.bairro || null,
              cliente.endereco_tipo || null,
              cliente.endereco_logradouro || null,
              cliente.endereco_numero || null,
              cliente.endereco_complemento || null,
              cliente.local_trabalho || null,
              cliente.grupo || null,
              cliente.como_conheceu || null,
              cliente.observacoes || null,
              cliente.id_vetsoft
            ]);
            
            resultado = { data: result.rows[0], atualizado: true };
          } catch (error: any) {
            console.error('Erro ao atualizar cliente:', error);
            throw new Error(`Erro ao atualizar cliente: ${error.message}`);
          }
        } else {
          // Inserir novo cliente
          const query = `
            INSERT INTO public.clientes (
              id_vetsoft, tipo, nome, cpf, rg, nascimento, cep, estado, cidade, 
              bairro, endereco_tipo, endereco_logradouro, endereco_numero, 
              endereco_complemento, local_trabalho, grupo, como_conheceu, observacoes
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
          `;
          
          try {
            // Verificar se id_vetsoft é um número válido
            console.log(`Inserindo cliente: ${cliente.nome}, ID VetSoft: ${cliente.id_vetsoft}`);
            
            const result = await pool.query(query, [
              cliente.id_vetsoft,
              cliente.tipo,
              cliente.nome,
              cliente.cpf || null,
              cliente.rg || null,
              cliente.nascimento ? new Date(cliente.nascimento) : null,
              cliente.cep || null,
              cliente.estado || null,
              cliente.cidade || null,
              cliente.bairro || null,
              cliente.endereco_tipo || null,
              cliente.endereco_logradouro || null,
              cliente.endereco_numero || null,
              cliente.endereco_complemento || null,
              cliente.local_trabalho || null,
              cliente.grupo || null,
              cliente.como_conheceu || null,
              cliente.observacoes || null
            ]);
            
            resultado = { data: result.rows[0], atualizado: false };
          } catch (error: any) {
            console.error('Erro ao inserir cliente:', error);
            throw new Error(`Erro ao inserir cliente: ${error.message}`);
          }
        }
        
        resultados.sucessos++;
        resultados.detalhes.push({
          id_vetsoft: cliente.id_vetsoft,
          nome: cliente.nome,
          sucesso: true,
          atualizado: resultado.atualizado
        });
        
      } catch (error: any) {
        console.error(`Erro ao processar cliente ${cliente.nome}: ${error.message}`);
        console.error('Detalhes do erro:', JSON.stringify(error));
        resultados.erros++;
        resultados.detalhes.push({
          id_vetsoft: cliente.id_vetsoft,
          nome: cliente.nome,
          sucesso: false,
          erro: error.message
        });
      }
    }
    
    await pool.end();
    
    return res.status(200).json({
      success: true,
      resultados
    });
    
  } catch (error: any) {
    console.error('Erro ao processar importação em lote:', error);
    console.error('Detalhes do erro:', JSON.stringify(error));
    
    try {
      await pool.end();
    } catch (e) {
      console.error('Erro ao fechar conexão com o banco:', e);
    }
    
    return res.status(500).json({
      success: false,
      error: `Erro ao processar importação em lote: ${error.message}`
    });
  }
});

export default router;
