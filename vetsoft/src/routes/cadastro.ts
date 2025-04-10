import { Router } from 'express';
import { chromium } from 'playwright';
import { config } from '../config';

const router = Router();

// Rota para adicionar um novo agendamento
router.post('/', async (req, res) => {
  const {
    data,          // DD/MM/YYYY
    hora,          // HH:mm
    codAnimal,     // Código do animal
    codCliente,    // Código do cliente
    servicos,      // Array de serviços (ex: ["Banho", "Tosa"])
  } = req.body;

  // Validação dos campos obrigatórios
  if (!data || !hora || !codAnimal || !codCliente || !servicos || !servicos.length) {
    return res.status(400).json({
      success: false,
      error: 'Campos obrigatórios: data, hora, codAnimal, codCliente, servicos'
    });
  }

  try {
    const browser = await chromium.launch({
      headless: false // Modo visual para desenvolvimento
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('Iniciando navegação...');
    await page.goto('https://dranimal.vetsoft.com.br/', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    
    await page.waitForTimeout(2000);
    
    console.log('Página carregada, realizando login...');
    await page.getByRole('textbox', { name: 'Usuário *' }).fill(config.vetsoft.username!);
    await page.getByRole('textbox', { name: 'Senha * ' }).fill(config.vetsoft.password!);
    await page.getByRole('textbox', { name: 'Senha * ' }).press('Enter');
    
    console.log('Login realizado, acessando Estética...');
    await page.waitForTimeout(3000);
    await page.getByRole('link', { name: ' Estética' }).click();

    // Implementar a lógica de adicionar agendamento
    return res.json({
      success: false,
      error: 'Funcionalidade ainda não implementada'
    });

    await browser.close();
  } catch (error: any) {
    console.error('Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

export default router;
