import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Criando o cliente Supabase
export const supabase = createClient(
  config.supabase.url,
  config.supabase.key,
  {
    auth: {
      persistSession: false // desabilita persistência de sessão pois é um script
    }
  }
);
