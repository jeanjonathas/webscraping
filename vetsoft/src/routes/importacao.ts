import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const router = Router();

// Configuração do Supabase com schema específico
const supabase = createClient(
  config.supabase.url,
  config.supabase.key,
  {
    db: {
      schema: 'dranimal'
    }
  }
);

// Interface para os dados de animais
interface Animal {
  codigo: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  data_nascimento: string | null;
  data_cadastro: string;
  data_obito: string | null;
  tutor_codigo: string;
  tutor_nome: string;
  codigo_internacao: string | null;
}

// Interface para os dados de clientes
interface Cliente {
  codigo: string;
  nome: string;
  cpf_cnpj?: string;
  contatos?: string;
  endereco?: string;
  data_cadastro?: string | null;
  data_atualizacao?: string | null;
  grupos?: string[];
  origem?: string;
  situacao?: string;
}

// Função para verificar se um cliente existe
async function verificarCliente(codigo: string): Promise<Cliente | null> {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle();
    
    if (error) {
      console.error('Erro ao verificar cliente:', error);
      throw new Error(`Erro ao verificar cliente: ${error.message}`);
    }
    
    return data;
  } catch (error: any) {
    console.error('Erro ao verificar cliente:', error);
    throw error;
  }
}

// Função para criar um cliente básico
async function criarClienteBasico(cliente: Cliente): Promise<Cliente> {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .insert([cliente])
      .select();
    
    if (error) {
      console.error('Erro ao criar cliente básico:', error);
      throw new Error(`Erro ao criar cliente básico: ${error.message}`);
    }
    
    return data[0];
  } catch (error: any) {
    console.error('Erro ao criar cliente básico:', error);
    throw error;
  }
}

// Rota para importar um animal
router.post('/animais', async (req, res) => {
  try {
    const animal: Animal = req.body;
    
    console.log(`Importando animal: ${animal.nome}`);
    console.log('Dados do animal:', JSON.stringify(animal));
    
    // Verificar se o tutor existe
    try {
      const tutorExistente = await verificarCliente(animal.tutor_codigo);
      
      if (!tutorExistente) {
        console.log(`Tutor não encontrado. Criando tutor básico: ${animal.tutor_nome} (${animal.tutor_codigo})`);
        
        // Criar tutor básico
        await criarClienteBasico({
          codigo: animal.tutor_codigo,
          nome: animal.tutor_nome,
          origem: 'Importação de Animais',
          situacao: 'ATIVO'
        });
        
        console.log(`Tutor básico criado: ${animal.tutor_nome}`);
      } else {
        console.log(`Tutor encontrado: ${tutorExistente.nome}`);
      }
      
      // Verificar se o animal já existe
      const { data: animalExistente, error: errorBusca } = await supabase
        .from('animais')
        .select('codigo')
        .eq('codigo', animal.codigo)
        .maybeSingle();
      
      if (errorBusca) {
        console.error('Erro ao verificar animal existente:', errorBusca);
        console.error('Detalhes do erro:', JSON.stringify(errorBusca));
        return res.status(500).json({
          success: false,
          error: `Erro ao verificar animal existente: ${errorBusca.message}`
        });
      }
      
      let resultado;
      
      if (animalExistente !== null) {
        // Atualizar animal existente
        const { data, error } = await supabase
          .from('animais')
          .update(animal)
          .eq('codigo', animal.codigo)
          .select();
          
        if (error) {
          console.error('Erro ao atualizar animal:', error);
          console.error('Detalhes do erro:', JSON.stringify(error));
          return res.status(500).json({
            success: false,
            error: `Erro ao atualizar animal: ${error.message}`
          });
        }
        
        resultado = { data, atualizado: true };
      } else {
        // Inserir novo animal
        const { data, error } = await supabase
          .from('animais')
          .insert([animal])
          .select();
          
        if (error) {
          console.error('Erro ao inserir animal:', error);
          console.error('Detalhes do erro:', JSON.stringify(error));
          return res.status(500).json({
            success: false,
            error: `Erro ao inserir animal: ${error.message}`
          });
        }
        
        resultado = { data, atualizado: false };
      }
      
      return res.status(200).json({
        success: true,
        data: resultado
      });
    } catch (error: any) {
      console.error('Erro ao processar importação de animal:', error);
      console.error('Detalhes do erro:', JSON.stringify(error));
      return res.status(500).json({
        success: false,
        error: `Erro ao processar importação: ${error.message}`
      });
    }
  } catch (error: any) {
    console.error('Erro ao processar importação de animal:', error);
    console.error('Detalhes do erro:', JSON.stringify(error));
    return res.status(500).json({
      success: false,
      error: `Erro ao processar importação: ${error.message}`
    });
  }
});

// Rota para importar múltiplos animais de uma vez
router.post('/animais/batch', async (req, res) => {
  try {
    const animais: Animal[] = req.body.animais;
    
    if (!Array.isArray(animais)) {
      return res.status(400).json({
        success: false,
        error: 'O corpo da requisição deve conter um array de animais'
      });
    }
    
    console.log(`Importando lote de ${animais.length} animais`);
    
    const resultados = {
      total: animais.length,
      sucessos: 0,
      erros: 0,
      tutoresCriados: 0,
      detalhes: [] as any[]
    };
    
    // Cache para evitar verificações repetidas de tutores
    const tutoresVerificados: Record<string, boolean> = {};
    
    for (const animal of animais) {
      try {
        console.log(`Processando animal: ${animal.nome} (${animal.codigo})`);
        
        // Verificar se o tutor existe (usando cache para evitar consultas repetidas)
        if (!tutoresVerificados[animal.tutor_codigo]) {
          try {
            const tutorExistente = await verificarCliente(animal.tutor_codigo);
            
            if (!tutorExistente) {
              console.log(`Tutor não encontrado. Criando tutor básico: ${animal.tutor_nome} (${animal.tutor_codigo})`);
              
              // Criar tutor básico
              await criarClienteBasico({
                codigo: animal.tutor_codigo,
                nome: animal.tutor_nome,
                origem: 'Importação de Animais',
                situacao: 'ATIVO'
              });
              
              resultados.tutoresCriados++;
              console.log(`Tutor básico criado: ${animal.tutor_nome}`);
            } else {
              console.log(`Tutor encontrado: ${tutorExistente.nome}`);
            }
            
            // Marcar tutor como verificado no cache
            tutoresVerificados[animal.tutor_codigo] = true;
          } catch (error: any) {
            console.error(`Erro ao verificar/criar tutor ${animal.tutor_nome}: ${error.message}`);
            throw new Error(`Erro ao verificar/criar tutor: ${error.message}`);
          }
        }
        
        // Verificar se o animal já existe
        const { data: animalExistente, error: errorBusca } = await supabase
          .from('animais')
          .select('codigo')
          .eq('codigo', animal.codigo)
          .maybeSingle();
        
        if (errorBusca) {
          console.error('Erro ao verificar animal existente:', errorBusca);
          throw new Error(`Erro ao verificar animal existente: ${errorBusca.message}`);
        }
        
        let resultado;
        
        if (animalExistente !== null) {
          // Atualizar animal existente
          const { data, error } = await supabase
            .from('animais')
            .update(animal)
            .eq('codigo', animal.codigo)
            .select();
            
          if (error) {
            console.error('Erro ao atualizar animal:', error);
            throw new Error(`Erro ao atualizar animal: ${error.message}`);
          }
          
          resultado = { data, atualizado: true };
        } else {
          // Inserir novo animal
          const { data, error } = await supabase
            .from('animais')
            .insert([animal])
            .select();
            
          if (error) {
            console.error('Erro ao inserir animal:', error);
            throw new Error(`Erro ao inserir animal: ${error.message}`);
          }
          
          resultado = { data, atualizado: false };
        }
        
        resultados.sucessos++;
        resultados.detalhes.push({
          codigo: animal.codigo,
          nome: animal.nome,
          tutor: animal.tutor_nome,
          sucesso: true,
          atualizado: resultado.atualizado
        });
        
      } catch (error: any) {
        console.error(`Erro ao processar animal ${animal.nome || animal.codigo}: ${error.message}`);
        console.error('Detalhes do erro:', JSON.stringify(error));
        resultados.erros++;
        resultados.detalhes.push({
          codigo: animal.codigo,
          nome: animal.nome,
          tutor: animal.tutor_nome,
          sucesso: false,
          erro: error.message
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      resultados
    });
    
  } catch (error: any) {
    console.error('Erro ao processar importação em lote:', error);
    console.error('Detalhes do erro:', JSON.stringify(error));
    return res.status(500).json({
      success: false,
      error: `Erro ao processar importação em lote: ${error.message}`
    });
  }
});

export default router;
