import { Router } from 'express';
import { chromium } from 'playwright';
import { config } from '../config';
import { Agendamento } from '../types/agendamento';
import { selecionarData } from '../utils/calendar';

const router = Router();

router.get('/', async (req, res) => {
  const data = req.query.data as string; // Formato: DD/MM/YYYY
  
  try {
    const browser = await chromium.launch({
      headless: !data
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
    
    // Se uma data foi especificada, seleciona ela no calendário
    if (data) {
      console.log(`Selecionando data: ${data}`);
      
      // Clica no seletor de data e seleciona "Hoje" primeiro
      await page.locator('#daterange').getByText('Hoje').click();
      await page.waitForTimeout(1000);
      
      // Seleciona "Escolher período"
      await page.getByRole('listitem').filter({ hasText: 'Escolher período' }).click();
      await page.waitForTimeout(1000);
      
      // Clica duas vezes no mesmo dia
      await selecionarData(page, data);
      await page.waitForTimeout(500);
      await selecionarData(page, data);
      
      // Aguarda a tabela atualizar
      await page.waitForTimeout(3000);
    }
    
    console.log('Aguardando tabela carregar...');
    await page.locator('#grid_Agenda').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);

    const rows = await page.locator('#grid_Agenda tbody tr').all();
    const agendamentos: Agendamento[] = [];
    
    for (const row of rows) {
      const situacao = await row.locator('td:nth-child(1) .label').textContent() || '';
      const entrada = await row.locator('td:nth-child(2)').textContent() || '';
      const entrega = await row.locator('td:nth-child(3)').textContent() || '';
      
      const linkFicha = await row.locator('td:nth-child(4) a.ficha-cliente').first();
      const href = await linkFicha.getAttribute('href') || '';
      const urlParams = new URLSearchParams(href.split('?')[1]);
      const codAnimal = urlParams.get('cod_animal') || '';
      const codCliente = urlParams.get('cod_cliente')?.split('#')[0] || '';
      
      const nomePet = await row.locator('td:nth-child(4) b').textContent() || '';
      const nomeCliente = await row.locator('td:nth-child(4) small a').textContent() || '';
      
      const servicosIcons = await row.locator('td.icones-servicos i.ttip').all();
      const servicos = await Promise.all(
        servicosIcons.map(async (icon) => {
          return (await icon.getAttribute('data-original-title')) || '';
        })
      );

      agendamentos.push({
        situacao: situacao.trim(),
        entrada: entrada.trim(),
        entrega: entrega.trim(),
        pet: {
          nome: nomePet.trim(),
          codigo: codAnimal
        },
        cliente: {
          nome: nomeCliente.trim(),
          codigo: codCliente
        },
        servicos: servicos.filter(s => s !== '')
      });
    }

    await browser.close();
    
    res.json({
      success: true,
      data: agendamentos
    });

  } catch (error: any) {
    console.error('Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

router.get('/periodo', async (req, res) => {
  const dataInicial = req.query.dataInicial as string;
  const dataFinal = req.query.dataFinal as string;
  const codAnimal = req.query.codAnimal as string;
  
  if (!dataInicial || !dataFinal) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer dataInicial e dataFinal'
    });
  }
  
  try {
    const browser = await chromium.launch({
      headless: !dataInicial
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
    
    console.log(`Selecionando período: ${dataInicial} até ${dataFinal}`);
    
    // Clica no seletor de data e seleciona "Hoje" primeiro
    await page.locator('#daterange').getByText('Hoje').click();
    await page.waitForTimeout(1000);
    
    // Seleciona "Escolher período"
    await page.getByRole('listitem').filter({ hasText: 'Escolher período' }).click();
    await page.waitForTimeout(1000);
    
    // Seleciona a data inicial no calendário da esquerda
    await selecionarData(page, dataInicial, 'esquerda');
    await page.waitForTimeout(500);
    
    // Seleciona a data final no calendário apropriado
    const [, mesInicial] = dataInicial.split('/');
    const [, mesFinal] = dataFinal.split('/');
    const calendario = parseInt(mesFinal) > parseInt(mesInicial) ? 'direita' : 'esquerda';
    await selecionarData(page, dataFinal, calendario);
    
    // Aguarda a tabela atualizar
    await page.waitForTimeout(3000);
    
    console.log('Aguardando tabela carregar...');
    await page.locator('#grid_Agenda').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);

    const rows = await page.locator('#grid_Agenda tbody tr').all();
    const agendamentos: Agendamento[] = [];
    
    for (const row of rows) {
      const situacao = await row.locator('td:nth-child(1) .label').textContent() || '';
      const entrada = await row.locator('td:nth-child(2)').textContent() || '';
      const entrega = await row.locator('td:nth-child(3)').textContent() || '';
      
      const linkFicha = await row.locator('td:nth-child(4) a.ficha-cliente').first();
      const href = await linkFicha.getAttribute('href') || '';
      const urlParams = new URLSearchParams(href.split('?')[1]);
      const codAnimal = urlParams.get('cod_animal') || '';
      const codCliente = urlParams.get('cod_cliente')?.split('#')[0] || '';
      
      const nomePet = await row.locator('td:nth-child(4) b').textContent() || '';
      const nomeCliente = await row.locator('td:nth-child(4) small a').textContent() || '';
      
      const servicosIcons = await row.locator('td.icones-servicos i.ttip').all();
      const servicos = await Promise.all(
        servicosIcons.map(async (icon) => {
          return (await icon.getAttribute('data-original-title')) || '';
        })
      );

      // Se um código de animal foi especificado, filtra apenas os agendamentos desse animal
      if (!codAnimal || codAnimal === urlParams.get('cod_animal')) {
        agendamentos.push({
          situacao: situacao.trim(),
          entrada: entrada.trim(),
          entrega: entrega.trim(),
          pet: {
            nome: nomePet.trim(),
            codigo: codAnimal
          },
          cliente: {
            nome: nomeCliente.trim(),
            codigo: codCliente
          },
          servicos: servicos.filter(s => s !== '')
        });
      }
    }

    await browser.close();
    
    res.json({
      success: true,
      data: agendamentos
    });

  } catch (error: any) {
    console.error('Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

export default router;
