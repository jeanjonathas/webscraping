import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para autenticação via API Key
 * Verifica se a API Key fornecida na requisição corresponde à API Key configurada no ambiente
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): Response | void => {
  // Obter a API Key do ambiente
  const configuredApiKey = process.env.API_KEY;
  
  if (!configuredApiKey) {
    console.error('API_KEY não configurada no ambiente');
    return res.status(500).json({
      success: false,
      error: 'Configuração de segurança ausente no servidor'
    });
  }
  
  // Verificar a API Key do cabeçalho
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API Key não fornecida'
    });
  }
  
  // Comparar as chaves
  if (apiKey !== configuredApiKey) {
    return res.status(403).json({
      success: false,
      error: 'API Key inválida'
    });
  }
  
  // Se a API Key for válida, continua para a próxima função
  next();
};
