import express from 'express';
import { chromium } from 'playwright';
import { config } from './config';

const app = express();
const port = config.server.port;

// Função auxiliar para selecionar uma data no calendário
async function selecionarData(page: any, data: string, calendario: 'esquerda' | 'direita' = 'esquerda') {
  const [diaComZero, mesComZero] = data.split('/');
  const dia = diaComZero.replace(/^0+/, '');
  const mes = parseInt(mesComZero);
  console.log(`Procurando dia ${dia} do mês ${mes}...`);
  
  // Determina qual calendário usar
  const calendarIndex = calendario === 'esquerda' ? 0 : 1;
  const calendar = page.locator('.calendar-table').nth(calendarIndex);
  await calendar.waitFor({ state: 'visible' });
  
  // Pega o mês do calendário
  const mesAtual = await calendar.locator('.month').textContent();
  console.log(`Mês do calendário ${calendario}: ${mesAtual}`);
  
  // Encontra a célula do dia
  const cells = await calendar.locator('td.available').all();
  let targetCell;
  
  for (const cell of cells) {
    const text = await cell.textContent();
    if (text?.trim() === dia) {
      const classes = await cell.getAttribute('class');
      if (!classes?.includes('off')) {
        targetCell = cell;
        const dataTitle = await cell.getAttribute('data-title');
        console.log(`Encontrado dia ${dia} com data-title=${dataTitle}`);
        break;
      }
    }
  }
  
  if (!targetCell) {
    throw new Error(`Dia ${dia} não encontrado no calendário ${calendario}`);
  }
  
  await targetCell.click();
  return targetCell;
}

app.get('/agendamentos', async (req, res) => {
  const data = req.query.data as string; // Formato: DD/MM/YYYY
  
  try {
    const browser = await chromium.launch({
      headless: !data // modo visual quando uma data é especificada
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
    
    type Agendamento = {
      situacao: string;
      entrada: string;
      entrega: string;
      pet: {
        nome: string;
        codigo: string;
      };
      cliente: {
        nome: string;
        codigo: string;
      };
      servicos: string[];
    };

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

// Novo endpoint para buscar agendamentos em um período
app.get('/agendamentos/periodo', async (req, res) => {
  const dataInicial = req.query.dataInicial as string; // Formato: DD/MM/YYYY
  const dataFinal = req.query.dataFinal as string; // Formato: DD/MM/YYYY
  const codAnimal = req.query.codAnimal as string; // Opcional
  
  if (!dataInicial || !dataFinal) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer dataInicial e dataFinal'
    });
  }
  
  try {
    const browser = await chromium.launch({
      headless: !dataInicial // modo visual quando datas são especificadas
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
    
    type Agendamento = {
      situacao: string;
      entrada: string;
      entrega: string;
      pet: {
        nome: string;
        codigo: string;
      };
      cliente: {
        nome: string;
        codigo: string;
      };
      servicos: string[];
    };

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

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
