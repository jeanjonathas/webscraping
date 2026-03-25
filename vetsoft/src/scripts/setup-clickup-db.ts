import { query } from '../lib/db';

async function setup() {
  try {
    console.log('Criando tabela clickup_config no PostgreSQL...');
    await query(`
      CREATE TABLE IF NOT EXISTS clickup_config (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabela criada com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('Erro ao criar tabela:', err);
    process.exit(1);
  }
}

setup();
