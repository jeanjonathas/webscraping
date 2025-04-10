import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

async function setupDatabase() {
  try {
    // Criar schema
    const { error: schemaError } = await supabase
      .from('_schema')
      .insert([{ name: 'dranimal' }]);

    if (schemaError) {
      console.log('Schema já existe ou erro ao criar:', schemaError.message);
    }

    // Criar tabela de clientes
    const { error: clientesError } = await supabase
      .from('dranimal')
      .rpc('create_table', {
        table_sql: `
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
        `
      });

    if (clientesError) {
      console.error('Erro ao criar tabela clientes:', clientesError.message);
      return;
    }

    // Criar tabela de animais
    const { error: animaisError } = await supabase
      .from('dranimal')
      .rpc('create_table', {
        table_sql: `
          CREATE TABLE IF NOT EXISTS dranimal.animais (
            id SERIAL PRIMARY KEY,
            codigo VARCHAR(50) UNIQUE,
            nome VARCHAR(255) NOT NULL,
            especie VARCHAR(100),
            raca VARCHAR(100),
            data_nascimento DATE,
            cliente_id INTEGER REFERENCES dranimal.clientes(id),
            data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            usuario_cadastro VARCHAR(100),
            data_atualizacao TIMESTAMP WITH TIME ZONE,
            usuario_atualizacao VARCHAR(100),
            situacao VARCHAR(50)
          );
        `
      });

    if (animaisError) {
      console.error('Erro ao criar tabela animais:', animaisError.message);
      return;
    }

    console.log('Schema e tabelas criados com sucesso!');
  } catch (error: any) {
    console.error('Erro ao configurar o banco de dados:', error.message);
    process.exit(1);
  }
}

setupDatabase();
