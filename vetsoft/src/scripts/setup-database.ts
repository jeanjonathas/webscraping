import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
  {
    db: {
      schema: 'dranimal'
    }
  }
);

async function setupDatabase() {
  try {
    console.log('Iniciando configuração do banco de dados...');

    // Verificar se as tabelas já existem
    const { data: existingTables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'dranimal');

    if (tablesError) {
      console.error('Erro ao verificar tabelas existentes:', tablesError.message);
      return;
    }

    const tables = existingTables?.map(t => t.table_name) || [];
    console.log('Tabelas existentes:', tables);

    // Como não podemos usar query diretamente, vamos usar funções SQL no Supabase
    // Isso é apenas um esboço, já que o script não é crítico para a funcionalidade atual
    console.log('Nota: A criação de tabelas precisa ser feita manualmente no Supabase');
    console.log('Estrutura da tabela clientes:');
    console.log(`
      CREATE TABLE IF NOT EXISTS dranimal.clientes (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE,
        nome VARCHAR(255) NOT NULL,
        cpf_cnpj VARCHAR(20),
        contatos TEXT,
        endereco TEXT,
        data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        usuario_cadastro VARCHAR(100),
        data_atualizacao TIMESTAMP WITH TIME ZONE,
        usuario_atualizacao VARCHAR(100),
        grupos TEXT[],
        origem VARCHAR(100),
        situacao VARCHAR(50)
      );
    `);

    console.log('Estrutura da tabela animais:');
    console.log(`
      CREATE TABLE IF NOT EXISTS dranimal.animais (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE,
        nome VARCHAR(255) NOT NULL,
        especie VARCHAR(100),
        raca VARCHAR(100),
        data_nascimento DATE,
        sexo VARCHAR(20),
        cor VARCHAR(50),
        peso DECIMAL(10,2),
        microchip VARCHAR(100),
        observacoes TEXT,
        data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        data_obito DATE,
        cliente_id INTEGER REFERENCES dranimal.clientes(id),
        tutor_codigo VARCHAR(50),
        tutor_nome VARCHAR(255),
        codigo_internacao VARCHAR(50)
      );
    `);

    console.log('Configuração do banco de dados concluída!');
  } catch (error: any) {
    console.error('Erro durante a configuração do banco de dados:', error.message);
  }
}

setupDatabase();
