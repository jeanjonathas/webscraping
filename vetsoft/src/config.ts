import dotenv from 'dotenv';

dotenv.config();

export const config = {
  vetsoft: {
    username: process.env.VETSOFT_USERNAME,
    password: process.env.VETSOFT_PASSWORD
  },
  server: {
    port: process.env.SERVER_PORT || 3000
  }
};
