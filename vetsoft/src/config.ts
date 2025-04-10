import dotenv from 'dotenv';

dotenv.config();

export const config = {
  vetsoft: {
    username: process.env.VETSOFT_USERNAME,
    password: process.env.VETSOFT_PASSWORD
  },
  server: {
    port: process.env.SERVER_PORT || 3000
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_KEY!
  }
};
