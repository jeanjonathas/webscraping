import { Router } from 'express';
import { Pool } from 'pg';

const router = Router();

// Interface para os dados de animais
interface Animal {
  id_vetsoft?: number;
  cliente_id?: number;
  nome: string;
  especie: string;
  raca?: string;
  sexo?: string;
  idade_anos?: number;
  idade_meses?: number;
  dt_nascimento?: string | null;
  porte?: string;
  pelagem?: string;
  microchip_anilha?: string;
  data_microchip?: string | null;
  pedigree?: string;
  esterilizacao?: string;
  observacoes?: string;
  data_cadastro?: string | null;
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

// Função para verificar se um animal existe
async function verificarAnimal(id_vetsoft: number): Promise<Animal | null> {
  const pool = getPool();
  try {
    const result = await pool.query(
      'SELECT * FROM public.pacientes WHERE id_vetsoft = $1',
      [id_vetsoft]
    );
    
    await pool.end();
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error: any) {
    console.error('Erro ao verificar animal:', error);
    await pool.end();
    throw error;
  }
}

// Função para buscar o ID do cliente pelo ID do VetSoft
async function buscarClienteId(id_vetsoft_cliente: number): Promise<number | null> {
  const pool = getPool();
  try {
    const result = await pool.query(
      'SELECT id FROM public.clientes WHERE id_vetsoft = $1',
      [id_vetsoft_cliente]
    );
    
    await pool.end();
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    return null;
  } catch (error: any) {
    console.error('Erro ao buscar cliente pelo ID VetSoft:', error);
    await pool.end();
    throw error;
  }
}

// Função para buscar o ID do cliente pelo nome
async function buscarClientePorNome(nome_cliente: string): Promise<number | null> {
  const pool = getPool();
  try {
    // Busca por nome exato primeiro
    let result = await pool.query(
      'SELECT id FROM public.clientes WHERE nome = $1',
      [nome_cliente]
    );
    
    // Se não encontrar com nome exato, tenta busca parcial
    if (result.rows.length === 0) {
      result = await pool.query(
        'SELECT id FROM public.clientes WHERE nome ILIKE $1 ORDER BY id DESC LIMIT 1',
        [`%${nome_cliente}%`]
      );
    }
    
    await pool.end();
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    return null;
  } catch (error: any) {
    console.error('Erro ao buscar cliente por nome:', error);
    await pool.end();
    throw error;
  }
}

// Rota para importar um único animal
router.post('/animais', async (req, res) => {
  const pool = getPool();
  try {
    const animal: Animal = req.body;
    
    console.log(`Importando animal: ${animal.nome}`);
    console.log('Dados do animal:', JSON.stringify(animal));
    
    // Verificar se o animal já existe
    let animalExistente = null;
    if (animal.id_vetsoft) {
      try {
        animalExistente = await verificarAnimal(animal.id_vetsoft);
      } catch (error: any) {
        console.error('Erro ao verificar animal existente:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao verificar animal existente: ${error.message}`
        });
      }
    }
    
    let resultado;
    
    if (animalExistente !== null) {
      // Atualizar animal existente
      const query = `
        UPDATE public.pacientes SET 
          cliente_id = $1, 
          nome = $2, 
          especie = $3, 
          raca = $4, 
          sexo = $5, 
          idade_anos = $6, 
          idade_meses = $7, 
          dt_nascimento = $8, 
          porte = $9, 
          pelagem = $10, 
          microchip_anilha = $11, 
          data_microchip = $12, 
          pedigree = $13, 
          esterilizacao = $14, 
          observacoes = $15,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_vetsoft = $16
        RETURNING *
      `;
      
      try {
        const result = await pool.query(query, [
          animal.cliente_id,
          animal.nome,
          animal.especie,
          animal.raca || null,
          animal.sexo || null,
          animal.idade_anos || null,
          animal.idade_meses || null,
          animal.dt_nascimento ? new Date(animal.dt_nascimento) : null,
          animal.porte || null,
          animal.pelagem || null,
          animal.microchip_anilha || null,
          animal.data_microchip ? new Date(animal.data_microchip) : null,
          animal.pedigree || null,
          animal.esterilizacao || null,
          animal.observacoes || null,
          animal.id_vetsoft
        ]);
        
        resultado = { data: result.rows[0], atualizado: true };
      } catch (error: any) {
        console.error('Erro ao atualizar animal:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao atualizar animal: ${error.message}`
        });
      }
    } else {
      // Inserir novo animal
      const query = `
        INSERT INTO public.pacientes (
          id_vetsoft, cliente_id, nome, especie, raca, sexo, idade_anos, idade_meses,
          dt_nascimento, porte, pelagem, microchip_anilha, data_microchip, pedigree,
          esterilizacao, data_cadastro, observacoes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        RETURNING *
      `;
      
      try {
        const result = await pool.query(query, [
          animal.id_vetsoft || null,
          animal.cliente_id,
          animal.nome,
          animal.especie,
          animal.raca || null,
          animal.sexo || null,
          animal.idade_anos || null,
          animal.idade_meses || null,
          animal.dt_nascimento ? new Date(animal.dt_nascimento) : null,
          animal.porte || null,
          animal.pelagem || null,
          animal.microchip_anilha || null,
          animal.data_microchip ? new Date(animal.data_microchip) : null,
          animal.pedigree || null,
          animal.esterilizacao || null,
          animal.data_cadastro ? new Date(animal.data_cadastro) : new Date(),
          animal.observacoes || null
        ]);
        
        resultado = { data: result.rows[0], atualizado: false };
      } catch (error: any) {
        console.error('Erro ao inserir animal:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao inserir animal: ${error.message}`
        });
      }
    }
    
    await pool.end();
    
    return res.status(200).json({
      success: true,
      data: resultado
    });
    
  } catch (error: any) {
    console.error('Erro ao processar importação de animal:', error);
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

// Rota para importar múltiplos animais de uma vez
router.post('/animais/batch', async (req, res) => {
  const pool = getPool();
  try {
    const animais: Animal[] = req.body.animais;
    
    if (!Array.isArray(animais)) {
      return res.status(400).json({
        success: false,
        error: 'O corpo da requisição deve conter um array de animais'
      });
    }
    
    console.log(`Iniciando importação em lote de ${animais.length} animais`);
    
    const resultados = {
      total: animais.length,
      sucessos: 0,
      erros: 0,
      detalhes: [] as any[]
    };
    
    for (const animal of animais) {
      try {
        console.log(`Processando animal: ${animal.nome}`);
        
        // Verificar se o animal já existe
        let animalExistente = null;
        if (animal.id_vetsoft) {
          try {
            animalExistente = await verificarAnimal(animal.id_vetsoft);
          } catch (error: any) {
            console.error('Erro ao verificar animal existente:', error);
            throw new Error(`Erro ao verificar animal existente: ${error.message}`);
          }
        }
        
        let resultado;
        
        if (animalExistente !== null) {
          // Atualizar animal existente
          const query = `
            UPDATE public.pacientes SET 
              cliente_id = $1, 
              nome = $2, 
              especie = $3, 
              raca = $4, 
              sexo = $5, 
              idade_anos = $6, 
              idade_meses = $7, 
              dt_nascimento = $8, 
              porte = $9, 
              pelagem = $10, 
              microchip_anilha = $11, 
              data_microchip = $12, 
              pedigree = $13, 
              esterilizacao = $14, 
              observacoes = $15,
              data_atualizacao = CURRENT_TIMESTAMP
            WHERE id_vetsoft = $16
            RETURNING *
          `;
          
          try {
            const result = await pool.query(query, [
              animal.cliente_id,
              animal.nome,
              animal.especie,
              animal.raca || null,
              animal.sexo || null,
              animal.idade_anos || null,
              animal.idade_meses || null,
              animal.dt_nascimento ? new Date(animal.dt_nascimento) : null,
              animal.porte || null,
              animal.pelagem || null,
              animal.microchip_anilha || null,
              animal.data_microchip ? new Date(animal.data_microchip) : null,
              animal.pedigree || null,
              animal.esterilizacao || null,
              animal.observacoes || null,
              animal.id_vetsoft
            ]);
            
            resultado = { data: result.rows[0], atualizado: true };
          } catch (error: any) {
            console.error('Erro ao atualizar animal:', error);
            throw new Error(`Erro ao atualizar animal: ${error.message}`);
          }
        } else {
          // Inserir novo animal
          const query = `
            INSERT INTO public.pacientes (
              id_vetsoft, cliente_id, nome, especie, raca, sexo, idade_anos, idade_meses,
              dt_nascimento, porte, pelagem, microchip_anilha, data_microchip, pedigree,
              esterilizacao, status, data_cadastro, observacoes
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
          `;
          
          try {
            const result = await pool.query(query, [
              animal.id_vetsoft || null,
              animal.cliente_id,
              animal.nome,
              animal.especie,
              animal.raca || null,
              animal.sexo || null,
              animal.idade_anos || null,
              animal.idade_meses || null,
              animal.dt_nascimento ? new Date(animal.dt_nascimento) : null,
              animal.porte || null,
              animal.pelagem || null,
              animal.microchip_anilha || null,
              animal.data_microchip ? new Date(animal.data_microchip) : null,
              animal.pedigree || null,
              animal.esterilizacao || null,
              animal.data_cadastro ? new Date(animal.data_cadastro) : new Date(),
              animal.observacoes || null
            ]);
            
            resultado = { data: result.rows[0], atualizado: false };
          } catch (error: any) {
            console.error('Erro ao inserir animal:', error);
            throw new Error(`Erro ao inserir animal: ${error.message}`);
          }
        }
        
        resultados.sucessos++;
        resultados.detalhes.push({
          id_vetsoft: animal.id_vetsoft,
          nome: animal.nome,
          sucesso: true,
          atualizado: resultado.atualizado
        });
        
      } catch (error: any) {
        console.error(`Erro ao processar animal ${animal.nome}: ${error.message}`);
        console.error('Detalhes do erro:', JSON.stringify(error));
        resultados.erros++;
        resultados.detalhes.push({
          id_vetsoft: animal.id_vetsoft,
          nome: animal.nome,
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

// Rota para processar o CSV e importar animais
router.post('/animais/csv', async (req, res) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData) {
      return res.status(400).json({
        success: false,
        error: 'Dados CSV não fornecidos'
      });
    }
    
    // Processar o CSV usando PapaParse no backend
    const Papa = require('papaparse');
    const parsedResult = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true
    });
    
    if (parsedResult.errors && parsedResult.errors.length > 0) {
      console.error('Erros ao processar CSV:', parsedResult.errors);
      return res.status(400).json({
        success: false,
        error: 'Erro ao processar o arquivo CSV: ' + parsedResult.errors[0].message
      });
    }
    
    const dadosCsv = parsedResult.data;
    console.log(`CSV processado com ${dadosCsv.length} linhas`);
    
    const animais: Animal[] = [];
    
    // Processar cada linha do CSV
    for (const linha of dadosCsv) {
      const animal: any = {};
      
      // Mapear colunas para campos do banco
      Object.keys(linha).forEach(coluna => {
        const valor = linha[coluna];
        if (valor !== undefined && valor !== '') {
          animal[mapearColuna(coluna)] = valor;
        }
      });
      
      // Converter campos numéricos
      if (animal.id_vetsoft) animal.id_vetsoft = parseInt(animal.id_vetsoft);
      if (animal.idade_anos) animal.idade_anos = parseInt(animal.idade_anos);
      if (animal.idade_meses) animal.idade_meses = parseInt(animal.idade_meses);
      
      // Converter campo de esterilização para o formato esperado
      if (animal.esterilizacao === 'Sim') {
        animal.esterilizacao = 'SIM';
      } else if (animal.esterilizacao === 'Não') {
        animal.esterilizacao = 'NAO';
      }
      
      // Buscar o ID do cliente pelo ID do VetSoft e/ou nome
      try {
        let clienteId = null;
        
        // Primeiro tentar pelo ID do VetSoft
        if (animal.tutor_id) {
          clienteId = await buscarClienteId(parseInt(animal.tutor_id));
          if (clienteId) {
            console.log(`Cliente com ID VetSoft ${animal.tutor_id} encontrado`);
          } else {
            console.warn(`Cliente com ID VetSoft ${animal.tutor_id} não encontrado, tentando pelo nome...`);
          }
        }
        
        // Se não encontrou pelo ID ou não tinha ID, tentar pelo nome
        if (!clienteId && animal.tutor_nome) {
          clienteId = await buscarClientePorNome(animal.tutor_nome);
          if (clienteId) {
            console.log(`Cliente com nome "${animal.tutor_nome}" encontrado`);
          } else {
            console.warn(`Cliente com nome "${animal.tutor_nome}" não encontrado`);
          }
        }
        
        if (clienteId) {
          animal.cliente_id = clienteId;
        } else {
          console.warn(`Não foi possível encontrar o cliente para o animal ${animal.nome}`);
        }
        
        // Remover campos temporários
        delete animal.tutor_id;
        delete animal.tutor_nome;
      } catch (error) {
        console.error(`Erro ao buscar cliente para o animal ${animal.nome}:`, error);
      }
      
      animais.push(animal);
    }
    
    console.log(`Processados ${animais.length} animais do CSV`);
    
    // Processar os animais diretamente sem fazer uma chamada HTTP
    const pool = getPool();
    
    try {
      const resultados = {
        total: animais.length,
        sucessos: 0,
        erros: 0,
        tutoresCriados: 0,
        detalhes: [] as any[]
      };
      
      // Processar cada animal
      for (const animal of animais) {
        try {
          // Verificar se o animal já existe
          let animalExistente = null;
          if (animal.id_vetsoft) {
            animalExistente = await verificarAnimal(animal.id_vetsoft);
          }
          
          let resultado;
          
          if (animalExistente !== null) {
            // Atualizar animal existente
            const query = `
              UPDATE public.pacientes SET 
                cliente_id = $1, 
                nome = $2, 
                especie = $3, 
                raca = $4, 
                sexo = $5, 
                idade_anos = $6, 
                idade_meses = $7, 
                dt_nascimento = $8, 
                porte = $9, 
                pelagem = $10, 
                microchip_anilha = $11, 
                data_microchip = $12, 
                pedigree = $13, 
                esterilizacao = $14, 
                status = $15,
                observacoes = $16,
                data_atualizacao = CURRENT_TIMESTAMP
              WHERE id_vetsoft = $17
              RETURNING *
            `;
            
            const result = await pool.query(query, [
              animal.cliente_id,
              animal.nome,
              animal.especie,
              animal.raca || null,
              animal.sexo || null,
              animal.idade_anos || null,
              animal.idade_meses || null,
              animal.dt_nascimento ? new Date(animal.dt_nascimento) : null,
              animal.porte || null,
              animal.pelagem || null,
              animal.microchip_anilha || null,
              animal.data_microchip ? new Date(animal.data_microchip) : null,
              animal.pedigree || null,
              animal.esterilizacao || null,
              animal.observacoes || null,
              animal.id_vetsoft
            ]);
            
            resultado = { data: result.rows[0], atualizado: true };
          } else {
            // Inserir novo animal
            const query = `
              INSERT INTO public.pacientes (
                id_vetsoft, cliente_id, nome, especie, raca, sexo, idade_anos, idade_meses,
                dt_nascimento, porte, pelagem, microchip_anilha, data_microchip, pedigree,
                esterilizacao, status, data_cadastro, observacoes
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
              )
              RETURNING *
            `;
            
            const result = await pool.query(query, [
              animal.id_vetsoft || null,
              animal.cliente_id,
              animal.nome,
              animal.especie,
              animal.raca || null,
              animal.sexo || null,
              animal.idade_anos || null,
              animal.idade_meses || null,
              animal.dt_nascimento ? new Date(animal.dt_nascimento) : null,
              animal.porte || null,
              animal.pelagem || null,
              animal.microchip_anilha || null,
              animal.data_microchip ? new Date(animal.data_microchip) : null,
              animal.pedigree || null,
              animal.esterilizacao || null,
              animal.data_cadastro ? new Date(animal.data_cadastro) : new Date(),
              animal.observacoes || null
            ]);
            
            resultado = { data: result.rows[0], atualizado: false };
          }
          
          resultados.sucessos++;
          resultados.detalhes.push({
            id_vetsoft: animal.id_vetsoft,
            nome: animal.nome,
            sucesso: true,
            atualizado: resultado.atualizado
          });
          
        } catch (error: any) {
          console.error(`Erro ao processar animal ${animal.nome}: ${error.message}`);
          resultados.erros++;
          resultados.detalhes.push({
            id_vetsoft: animal.id_vetsoft,
            nome: animal.nome,
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
    
  } catch (error: any) {
    console.error('Erro ao processar CSV:', error);
    return res.status(500).json({
      success: false,
      error: `Erro ao processar CSV: ${error.message}`
    });
  }
});

// Função para mapear colunas do CSV para campos do banco de dados
function mapearColuna(coluna: string): string {
  const mapeamento: Record<string, string> = {
    'ID': 'id_vetsoft',
    'Nome': 'nome',
    'Espécie': 'especie',
    'Raça': 'raca',
    'Sexo': 'sexo',
    'Idade': 'idade_texto', // Campo temporário para processamento
    'Data Cadastro': 'data_cadastro',
    'Peso': 'peso', // Não usado no banco, apenas informativo
    'Data Peso': 'data_peso', // Não usado no banco, apenas informativo
    'Porte': 'porte',
    'Data Nascimento': 'dt_nascimento',
    'Data Óbito': 'data_obito', // Não usado no banco, apenas informativo
    'Esterilizado': 'esterilizacao',
    'Pelagem': 'pelagem',
    // Removido 'Status Cadastro': 'status' - coluna não existe na tabela pacientes
    'Tutor ID': 'tutor_id', // Campo temporário para buscar cliente_id
    'Tutor Nome': 'tutor_nome', // Não usado no banco, apenas informativo
    'Telefone': 'telefone' // Não usado no banco, apenas informativo
  };
  
  return mapeamento[coluna] || coluna.toLowerCase().replace(/ /g, '_');
}

export default router;
