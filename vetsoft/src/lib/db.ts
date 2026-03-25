import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Usamos as mesmas variáveis que já estão sendo usadas no testeDB.ts
// Adicionamos fallback para valores padrão se for ambiente local
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  host: isProduction ? process.env.PG_HOST : (process.env.PG_HOST_LOCAL || 'localhost'),
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'vetsoft'
};

console.log('PG Config:', { ...pgConfig, password: '***' });

export const pool = new Pool(pgConfig);

// Helper para executar queries sem precisar gerenciar o cliente manualmente em cada rota
export const query = (text: string, params?: any[]) => pool.query(text, params);
