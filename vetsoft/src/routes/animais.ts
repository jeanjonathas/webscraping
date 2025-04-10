import { Router } from 'express';
import { chromium } from 'playwright';
import { config } from '../config';
import { selecionarDataPeriodo } from '../utils/calendar';

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
  
  if (!ano || isNaN(parseInt(ano))) {
    return res.status(400).json({
      success: false,
      error: 'É necessário fornecer um ano válido'
    });
  }
  
  try {
    console.log(`Iniciando extração de animais para o ano ${ano}`);
    
    const browser = await chromium.launch({
      headless: true
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
    await page.waitForSelector('.navbar-brand');
    console.log('Login realizado com sucesso');
    
    // Navegar para relatórios
    console.log('Acessando relatórios...');
    await page.getByRole('link', { name: ' Relatórios' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Lista de Animais' }).click();
    await page.waitForTimeout(2000);
    
    // Configurar visualização
    console.log('Configurando visualização...');
    await page.getByRole('button', { name: '+ ' }).click();
    await page.getByLabel('Visualizar').selectOption('3'); // Selecionar visualização completa
    
    // Selecionar período do ano
    console.log(`Selecionando período de 01/01/${ano} a 31/12/${ano}`);
    await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
    await page.getByText('Escolher período').click();
    
    // Selecionar data inicial e final
    await selecionarDataPeriodo(page, parseInt(ano));
    
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
