import express from 'express';
import { config } from './config';
import consultaRoutes from './routes/consulta';
import cadastroRoutes from './routes/cadastro';

const app = express();
const port = config.server.port;

// Middleware para processar JSON
app.use(express.json());

// Rotas
app.use('/agendamentos', consultaRoutes);
app.use('/agendamentos/novo', cadastroRoutes);

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
