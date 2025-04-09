import express from 'express';
import { chromium } from 'playwright';
import { config } from './config';

const app = express();
const port = config.server.port;

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
      
      // Extrai dia e mês da data fornecida e remove zeros à esquerda
      const [diaComZero, mesComZero] = data.split('/');
      const dia = diaComZero.replace(/^0+/, '');
      const mes = parseInt(mesComZero);
      console.log(`Procurando dia ${dia} do mês ${mes}...`);
      
      // Espera o calendário ficar visível
      const calendar = page.locator('.calendar-table').first();
      await calendar.waitFor({ state: 'visible' });
      
      // Pega o mês do calendário da esquerda
      const mesEsquerda = await calendar.locator('.month').textContent();
      console.log(`Mês do calendário esquerdo: ${mesEsquerda}`);
      
      // Determina qual calendário usar baseado no mês
      let targetCalendar = calendar;
      if (mesEsquerda?.includes('abr') && mes === 5) { // Se estamos em abril e queremos maio
        console.log('Usando calendário da direita...');
        targetCalendar = page.locator('.calendar-table').nth(1);
        await targetCalendar.waitFor({ state: 'visible' });
      }
      
      // Primeiro encontra todas as células disponíveis com o dia que queremos
      const cells = await targetCalendar.locator('td.available').all();
      let targetCell;
      
      for (const cell of cells) {
        const text = await cell.textContent();
        if (text?.trim() === dia) {
          // Verifica se a célula não é do mês anterior/próximo
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
        throw new Error(`Dia ${dia} não encontrado no calendário`);
      }
      
      // Clica duas vezes no mesmo dia para selecionar período único
      await targetCell.click();
      await page.waitForTimeout(500);
      await targetCell.click();
      
      // Aguarda a tabela atualizar
      await page.waitForTimeout(1000);
    }
    
    console.log('Aguardando tabela carregar...');
    await page.locator('#grid_Agenda').waitFor({ timeout: 1000 });
    await page.waitForTimeout(1000);

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

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
