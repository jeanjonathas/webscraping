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
async function verificarCliente(id_vetsoft: number): Promise<number | null> {
  const pool = getPool();
  try {
    console.log(`Verificando cliente com id_vetsoft ${id_vetsoft}`);
    
    // Garantir que id_vetsoft seja um número inteiro
    const id_vetsoft_int = parseInt(String(id_vetsoft), 10);
    if (isNaN(id_vetsoft_int)) {
      console.error(`ID VetSoft inválido: ${id_vetsoft}`);
      return null;
    }
    
    console.log(`Executando consulta para id_vetsoft = ${id_vetsoft_int}`);
    const result = await pool.query(
      'SELECT id FROM public.clientes WHERE id_vetsoft = $1',
      [id_vetsoft_int]
    );
    
    if (result.rows.length > 0) {
      console.log(`Cliente encontrado: id interno = ${result.rows[0].id}`);
      return result.rows[0].id;
    } else {
      console.log(`Nenhum cliente encontrado com id_vetsoft ${id_vetsoft_int}`);
      return null;
    }
  } catch (error: any) {
    console.error(`Erro ao verificar cliente com id_vetsoft ${id_vetsoft}:`, error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Rota para importar um único cliente
router.post('/tutores', async (req, res) => {
  const pool = getPool();
  try {
    const cliente: Cliente = req.body;
    
    console.log(`Importando tutor: ${cliente.nome}`);
    console.log('Dados do tutor:', JSON.stringify(cliente));
    
    // Tratar espaços extras em todos os campos de texto
    if (cliente.nome) cliente.nome = cliente.nome.trim();
    if (cliente.endereco_logradouro) cliente.endereco_logradouro = cliente.endereco_logradouro.trim();
    if (cliente.bairro) cliente.bairro = cliente.bairro.trim();
    if (cliente.cidade) cliente.cidade = cliente.cidade.trim();
    if (cliente.estado) cliente.estado = cliente.estado.trim();
    if (cliente.endereco_complemento) cliente.endereco_complemento = cliente.endereco_complemento.trim();
    if (cliente.local_trabalho) cliente.local_trabalho = cliente.local_trabalho.trim();
    if (cliente.grupo) cliente.grupo = cliente.grupo.trim();
    if (cliente.como_conheceu) cliente.como_conheceu = cliente.como_conheceu.trim();
    if (cliente.observacoes) cliente.observacoes = cliente.observacoes.trim();
    
    // Verificar se o ID VetSoft está presente
    if (!cliente.id_vetsoft) {
      console.error('Tentativa de importar tutor sem ID VetSoft:', cliente.nome);
      return res.status(400).json({
        success: false,
        error: 'O ID VetSoft (campo id_vetsoft) é obrigatório para importação de tutores'
      });
    }
    
    console.log(`Processando tutor: ${cliente.nome}, ID VetSoft: ${cliente.id_vetsoft}`);
    
    // Verificar se o cliente já existe
    let clienteId = null;
    try {
      clienteId = await verificarCliente(cliente.id_vetsoft);
    } catch (error: any) {
      console.error('Erro ao verificar cliente existente:', error);
      return res.status(500).json({
        success: false,
        error: `Erro ao verificar cliente existente: ${error.message}`
      });
    }
    
    let resultado;
    
    if (clienteId !== null) {
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
        // Tratar espaços extras em todos os campos de texto
        if (cliente.nome) cliente.nome = cliente.nome.trim();
        if (cliente.endereco_logradouro) cliente.endereco_logradouro = cliente.endereco_logradouro.trim();
        if (cliente.bairro) cliente.bairro = cliente.bairro.trim();
        if (cliente.cidade) cliente.cidade = cliente.cidade.trim();
        if (cliente.estado) cliente.estado = cliente.estado.trim();
        if (cliente.endereco_complemento) cliente.endereco_complemento = cliente.endereco_complemento.trim();
        if (cliente.local_trabalho) cliente.local_trabalho = cliente.local_trabalho.trim();
        if (cliente.grupo) cliente.grupo = cliente.grupo.trim();
        if (cliente.como_conheceu) cliente.como_conheceu = cliente.como_conheceu.trim();
        if (cliente.observacoes) cliente.observacoes = cliente.observacoes.trim();
        
        console.log(`Processando cliente: ${cliente.nome}`);
        
        // Verificar se o ID VetSoft está presente
        if (!cliente.id_vetsoft) {
          console.error('Tentativa de importar tutor sem ID VetSoft:', cliente.nome);
          throw new Error('O ID VetSoft (campo id_vetsoft) é obrigatório para importação de tutores');
        }
        
        // Verificar se o cliente já existe
        let clienteId = null;
        try {
          clienteId = await verificarCliente(cliente.id_vetsoft);
        } catch (error: any) {
          console.error('Erro ao verificar cliente existente:', error);
          throw new Error(`Erro ao verificar cliente existente: ${error.message}`);
        }
        
        let resultado;
        
        if (clienteId !== null) {
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
            console.log(`Atualizando cliente existente com id_vetsoft ${cliente.id_vetsoft}`);
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
            console.log(`Cliente atualizado com sucesso: ${cliente.nome}, id_vetsoft: ${cliente.id_vetsoft}`);
          } catch (error: any) {
            console.error('Erro ao atualizar cliente:', error);
            throw new Error(`Erro ao atualizar cliente: ${error.message}`);
          }
        } else {
          // Inserir novo cliente
          const query = `
            INSERT INTO public.clientes (
              id_vetsoft, tipo, nome, cpf, rg, nascimento, cep, estado, cidade, bairro,
              endereco_tipo, endereco_logradouro, endereco_numero, endereco_complemento,
              local_trabalho, grupo, como_conheceu, observacoes, data_cadastro
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP
            )
            RETURNING *
          `;
          
          try {
            // Garantir que id_vetsoft seja um número inteiro
            const id_vetsoft_int = parseInt(String(cliente.id_vetsoft), 10);
            if (isNaN(id_vetsoft_int)) {
              throw new Error(`ID VetSoft inválido: ${cliente.id_vetsoft}`);
            }
            
            console.log(`Inserindo cliente: ${cliente.nome}, ID VetSoft: ${id_vetsoft_int}`);
            
            const result = await pool.query(query, [
              id_vetsoft_int,
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
            console.log(`Cliente inserido com sucesso: ${cliente.nome}, ID VetSoft: ${id_vetsoft_int}, ID interno: ${result.rows[0].id}`);
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
