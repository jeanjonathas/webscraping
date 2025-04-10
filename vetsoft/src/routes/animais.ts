import { Router } from 'express';
import { chromium } from 'playwright';
import { config } from '../config';

const router = Router();

interface Animal {
  codigo: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  data_nascimento: string | null;
  data_cadastro: string;
  tutor_codigo: string;
  tutor_nome: string;
}

// Rota para buscar animais por ano
router.get('/ano/:ano', async (req, res) => {
  const ano = req.params.ano;
  
  console.log(`Rota /animais/ano/${ano} foi chamada`);
  
  if (!ano || isNaN(parseInt(ano))) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer um ano válido'
    });
  }
  
  try {
    console.log(`Iniciando extração de animais para o ano ${ano}`);
    
    const browser = await chromium.launch({
      headless: false
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Login
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
    
    // Aguardar carregamento da página após login
    await page.waitForNavigation({ timeout: 30000 });
    console.log('Login realizado com sucesso');
    
    // Navegar para relatórios
    console.log('Acessando relatórios...');
    await page.locator('a[href="/m/relatorios/"]').click();
    await page.waitForTimeout(2000);
    await page.getByRole('link', { name: 'Animais' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Lista de Animais' }).click();
    await page.waitForTimeout(2000);
    
    // Configurar visualização
    console.log('Configurando visualização...');
    await page.getByRole('button', { name: ' Colunas' }).click();
    await page.getByRole('checkbox', { name: '#' }).uncheck();
    await page.getByRole('button', { name: '+ ' }).click();
    await page.getByLabel('Visualizar').selectOption('3'); // Selecionar visualização completa
    
    // Selecionar período do ano
    console.log(`Selecionando período de 01/01/${ano} a 31/12/${ano}`);
    
    // Abrir o selecionador de datas
    await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
    await page.waitForTimeout(1000);
    
    // Clicar em "Escolher período"
    await page.getByText('Escolher período').click();
    await page.waitForTimeout(1000);
    
    // Navegar para janeiro de 2022 (clicando nas setas para voltar)
    console.log('Navegando para janeiro de 2022...');
    
    // Clicar repetidamente na seta para a esquerda até chegar em janeiro de 2022
    // Usar o seletor exato baseado na estrutura HTML
    const prevButton = page.locator('th.prev.available');
    
    // Clicar na seta para esquerda várias vezes para voltar até janeiro de 2022
    // Vamos clicar um número fixo de vezes para garantir que chegamos em janeiro de 2022
    // Assumindo que estamos em 2025, precisamos voltar 3 anos (36 meses)
    console.log('Clicando na seta para esquerda para voltar até janeiro de 2022...');
    for (let i = 0; i < 40; i++) {
      await prevButton.first().click();
      await page.waitForTimeout(100);
    }
    
    // Agora devemos estar em algum mês de 2021 ou antes
    // Vamos avançar mês a mês até chegarmos em janeiro de 2022
    const nextButton = page.locator('th.next.available');
    
    // Avançar até janeiro de 2022
    console.log('Ajustando para janeiro de 2022...');
    for (let i = 0; i < 12; i++) {
      // Verificar o mês e ano atual
      const mesAnoTexto = await page.locator('.datepicker-switch').first().textContent();
      console.log(`Mês e ano atual: ${mesAnoTexto}`);
      
      if (mesAnoTexto && mesAnoTexto.includes('jan 2022')) {
        console.log('Chegamos em janeiro de 2022!');
        break;
      }
      
      await nextButton.first().click();
      await page.waitForTimeout(100);
    }
    
    // Selecionar o dia 1
    await page.locator('td.available').filter({ hasText: '1' }).first().click();
    await page.waitForTimeout(1000);
    
    // Agora, navegar para dezembro de 2022 no segundo calendário
    console.log('Navegando para dezembro de 2022...');
    
    // Clicar na seta para direita várias vezes para avançar até dezembro de 2022
    for (let i = 0; i < 11; i++) {
      await nextButton.nth(1).click();
      await page.waitForTimeout(100);
    }
    
    // Selecionar o dia 31
    await page.locator('td.available').filter({ hasText: '31' }).first().click();
    await page.waitForTimeout(1000);
    
    // Filtrar
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(3000); // Aguardar carregamento dos resultados
    
    // Aguardar carregamento da tabela
    console.log('Aguardando tabela carregar...');
    await page.waitForSelector('#datagrid_RelatorioAnimais', { timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Extrair dados
    console.log('Extraindo dados da tabela...');
    const animais = await extrairDadosDaTabela(page);
    console.log(`Extraídos ${animais.length} animais`);
    
    await browser.close();
    
    return res.json({
      success: true,
      data: animais
    });
    
  } catch (error: any) {
    console.error('Erro durante a extração:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

async function extrairDadosDaTabela(page: any): Promise<Animal[]> {
  return await page.evaluate(() => {
    const animais: any[] = [];
    const tabela = document.querySelector('#datagrid_RelatorioAnimais');
    if (!tabela) return animais;
    
    const linhas = tabela.querySelectorAll('tbody tr');
    
    linhas.forEach(linha => {
      const colunas = linha.querySelectorAll('td');
      if (colunas.length < 8) return;
      
      // Extrair código do animal do link
      const linkAnimal = colunas[1].querySelector('a');
      const codigoAnimal = linkAnimal ? 
        new URLSearchParams(linkAnimal.getAttribute('href')?.split('?')[1] || '').get('codigo') || '' : '';
      
      // Extrair código do tutor do link
      const linkTutor = colunas[7].querySelector('a');
      const codigoTutor = linkTutor ? 
        new URLSearchParams(linkTutor.getAttribute('href')?.split('?')[1] || '').get('codigo') || '' : '';
      
      const animal = {
        codigo: codigoAnimal,
        nome: colunas[1].textContent?.trim() || '',
        especie: colunas[2].textContent?.trim() || '',
        raca: colunas[3].textContent?.trim() || '',
        sexo: colunas[4].textContent?.trim() || '',
        data_nascimento: colunas[5].textContent?.trim() || null,
        data_cadastro: colunas[6].textContent?.trim() || '',
        tutor_codigo: codigoTutor,
        tutor_nome: colunas[7].textContent?.trim() || ''
      };
      
      animais.push(animal);
    });
    
    return animais;
  });
}

export default router;
