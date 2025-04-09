import { test, expect, chromium } from '@playwright/test';

test('test', async () => {
  const browser = await chromium.launch({
    headless: false
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Iniciando navegação...');
    await page.goto('https://dranimal.vetsoft.com.br/', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    
    await page.waitForTimeout(2000);
    
    console.log('Página carregada, realizando login...');
    await page.getByRole('textbox', { name: 'Usuário *' }).fill('jeanvet');
    await page.getByRole('textbox', { name: 'Senha * ' }).fill('Je@nfree16');
    await page.getByRole('textbox', { name: 'Senha * ' }).press('Enter');
    
    console.log('Login realizado, acessando Estética...');
    await page.waitForTimeout(3000);
    await page.getByRole('link', { name: ' Estética' }).click();
    
    console.log('Aguardando tabela carregar...');
    // Aguarda a tabela aparecer
    await page.locator('#grid_Agenda').waitFor({ timeout: 30000 });
    
    // Aguarda um pouco mais para garantir que os dados carregaram
    await page.waitForTimeout(2000);

    // Extrai os dados da tabela
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
      
      // Extrai informações do pet e cliente
      const linkFicha = await row.locator('td:nth-child(4) a.ficha-cliente').first();
      const href = await linkFicha.getAttribute('href') || '';
      const urlParams = new URLSearchParams(href.split('?')[1]);
      const codAnimal = urlParams.get('cod_animal') || '';
      const codCliente = urlParams.get('cod_cliente')?.split('#')[0] || ''; // Remove o #historico
      
      const nomePet = await row.locator('td:nth-child(4) b').textContent() || '';
      const nomeCliente = await row.locator('td:nth-child(4) small a').textContent() || '';
      
      // Captura todos os serviços através dos tooltips dos ícones
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

    console.log('Agendamentos encontrados:', JSON.stringify(agendamentos, null, 2));
    
    // Pausa para inspeção manual
    await page.pause();
    
  } catch (error) {
    console.error('Erro durante a execução:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
});