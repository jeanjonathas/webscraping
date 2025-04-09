import dotenv from 'dotenv';
import path from 'path';

// Carrega o arquivo .env
dotenv.config({ path: path.join(__dirname, '.env') });

export const config = {
  vetsoft: {
    username: process.env.VETSOFT_USERNAME,
    password: process.env.VETSOFT_PASSWORD
  },
  server: {
    port: process.env.PORT || 3000
  }
};
