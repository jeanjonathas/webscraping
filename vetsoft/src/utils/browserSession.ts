import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { config } from '../config';

// Variáveis para armazenar a sessão do navegador
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let lastUsed: number = Date.now();
let isLoggedIn: boolean = false;
let browserStartTime: number = Date.now();

// Tempo máximo de inatividade antes de fechar o navegador (em milissegundos)
const MAX_IDLE_TIME = 6 * 60 * 60 * 1000; // 6 horas

// Tempo máximo de vida do navegador antes de reiniciar (em milissegundos)
const MAX_BROWSER_LIFETIME = 12 * 60 * 60 * 1000; // 12 horas

// Intervalo para verificar se o navegador deve ser fechado
const checkInterval = setInterval(async () => {
  if (browser) {
    // Verificar se o navegador está inativo por muito tempo
    if (Date.now() - lastUsed > MAX_IDLE_TIME) {
      console.log('Fechando navegador por inatividade (6 horas)...');
      await closeBrowser();
    }
    // Verificar se o navegador está aberto por muito tempo
    else if (Date.now() - browserStartTime > MAX_BROWSER_LIFETIME) {
      console.log('Reiniciando navegador após 12 horas de uso...');
      await resetSession();
      browserStartTime = Date.now();
    }
  }
}, 60 * 1000); // Verificar a cada minuto

// Função para inicializar o navegador se necessário
export async function getBrowser(headless: boolean = false): Promise<Browser> {
  if (!browser) {
    console.log('Iniciando nova instância do navegador...');
    browser = await chromium.launch({
      headless: headless,
      slowMo: headless ? 0 : 50 // Adiciona atraso apenas se não for headless
    });
    isLoggedIn = false;
    browserStartTime = Date.now();
  }
  
  lastUsed = Date.now();
  return browser;
}

// Função para obter o contexto do navegador
export async function getBrowserContext(headless: boolean = false): Promise<BrowserContext> {
  if (!context) {
    const browserInstance = await getBrowser(headless);
    console.log('Criando novo contexto do navegador...');
    context = await browserInstance.newContext();
    isLoggedIn = false;
  }
  
  lastUsed = Date.now();
  return context;
}

// Função para obter a página atual ou criar uma nova
export async function getPage(headless: boolean = false): Promise<Page> {
  if (!page) {
    const contextInstance = await getBrowserContext(headless);
    console.log('Criando nova página...');
    page = await contextInstance.newPage();
    isLoggedIn = false;
  }
  
  lastUsed = Date.now();
  return page;
}

// Função para verificar se está logado e fazer login se necessário
export async function ensureLoggedIn(headless: boolean = false): Promise<Page> {
  const currentPage = await getPage(headless);
  
  if (!isLoggedIn) {
    console.log('Realizando login...');
    
    try {
      // Acessar a página de login
      await currentPage.goto('https://dranimal.vetsoft.com.br/');
      console.log('Página de login carregada');
      
      // Verificar se já está na página inicial (já logado)
      const currentUrl = currentPage.url();
      if (currentUrl.includes('/home') || currentUrl.includes('/dashboard')) {
        console.log('Já está logado!');
        isLoggedIn = true;
        return currentPage;
      }
      
      // Realizar login
      console.log('Preenchendo credenciais...');
      await currentPage.getByRole('textbox', { name: 'Usuário *' }).fill(config.vetsoft.username || '');
      await currentPage.getByRole('textbox', { name: 'Senha * ' }).fill(config.vetsoft.password || '');
      await currentPage.getByRole('button', { name: 'Acessar ' }).click();
      console.log('Credenciais enviadas, aguardando navegação...');
      
      // Aguardar carregamento da página inicial após login
      await currentPage.waitForNavigation({ waitUntil: 'networkidle' });
      console.log('Login realizado com sucesso');
      
      isLoggedIn = true;
    } catch (error) {
      console.error('Erro ao realizar login:', error);
      // Se houver erro no login, resetar a sessão
      await resetSession();
      throw error;
    }
  } else {
    console.log('Usando sessão existente (já logado)');
  }
  
  lastUsed = Date.now();
  return currentPage;
}

// Função para navegar para a página de internação
export async function navigateToInternacao(headless: boolean = false, forceRefresh: boolean = false): Promise<Page> {
  // Obter a página atual ou criar uma nova
  const currentPage = await getPage(headless);
  
  try {
    // Se forceRefresh for true, sempre recarregar a página independentemente do estado de login
    if (forceRefresh) {
      console.log('Forçando atualização da página de internação...');
      await currentPage.goto('https://dranimal.vetsoft.com.br/m/internacoes/#list/page/1', { waitUntil: 'networkidle' });
      console.log('Página de internação recarregada');
      
      // Verificar se foi redirecionado para login
      const currentUrl = currentPage.url();
      if (currentUrl.includes('/login')) {
        console.log('Redirecionado para login, realizando login...');
        isLoggedIn = false;
        return await ensureLoggedInAndNavigate();
      }
      
      // Se chegou aqui, está logado
      isLoggedIn = true;
      lastUsed = Date.now();
      return currentPage;
    }
    // Se já estiver logado, navegar diretamente para a URL da internação
    else if (isLoggedIn) {
      console.log('Navegando diretamente para a página de internação...');
      
      // Verificar se já estamos na página de internação
      const currentUrl = currentPage.url();
      if (currentUrl.includes('/internacoes/')) {
        console.log('Já está na página de internação, atualizando...');
        await currentPage.reload({ waitUntil: 'networkidle' });
      } else {
        await currentPage.goto('https://dranimal.vetsoft.com.br/m/internacoes/#list/page/1', { waitUntil: 'networkidle' });
      }
      console.log('Página de internação carregada');
      
      // Confirmar que está logado
      lastUsed = Date.now();
      return currentPage;
    } else {
      // Se não estiver logado, fazer login primeiro e depois navegar
      return await ensureLoggedInAndNavigate();
    }
  } catch (error) {
    console.error('Erro ao navegar para a página de internação:', error);
    // Se houver erro na navegação, pode ser que a sessão tenha expirado
    isLoggedIn = false;
    // Tentar novamente com login
    await resetSession();
    return navigateToInternacao(headless, forceRefresh);
  }
  
  // Função auxiliar para fazer login e navegar
  async function ensureLoggedInAndNavigate(): Promise<Page> {
    await ensureLoggedIn(headless);
    console.log('Navegando para a página de internação após login...');
    await currentPage.goto('https://dranimal.vetsoft.com.br/m/internacoes/#list/page/1', { waitUntil: 'networkidle' });
    console.log('Página de internação carregada');
    lastUsed = Date.now();
    return currentPage;
  }
}

// Função para forçar atualização da página
export async function forceRefreshPage(headless: boolean = false): Promise<Page> {
  const currentPage = await getPage(headless);
  await currentPage.reload({ waitUntil: 'networkidle' });
  console.log('Página recarregada');
  lastUsed = Date.now();
  return currentPage;
}

// Função para resetar a sessão (fechar e recriar)
export async function resetSession(): Promise<void> {
  console.log('Resetando sessão do navegador...');
  await closeBrowser();
  
  // Atualizar o tempo de início do navegador
  browserStartTime = Date.now();
  
  // As próximas chamadas para getBrowser, getBrowserContext ou getPage criarão novas instâncias
}

// Função para fechar o navegador
export async function closeBrowser(): Promise<void> {
  if (browser) {
    console.log('Fechando navegador...');
    page = null;
    context = null;
    await browser.close();
    browser = null;
    isLoggedIn = false;
  }
}

// Função para navegar para a página de relatórios de animais
export async function navigateToRelatorioAnimais(headless: boolean = false, forceRefresh: boolean = false, ano: string = ''): Promise<Page> {
  // Obter a página atual ou criar uma nova
  const currentPage = await getPage(headless);
  
  try {
    // Se já estiver logado ou forceRefresh for true, navegar diretamente para a URL de relatórios
    if (isLoggedIn || forceRefresh) {
      console.log('Navegando diretamente para a página de relatórios...');
      await currentPage.goto('https://dranimal.vetsoft.com.br/m/relatorios/', { waitUntil: 'networkidle' });
      
      // Verificar se realmente está na página correta (pode ter sido redirecionado para login)
      const currentUrl = currentPage.url();
      if (currentUrl.includes('/login')) {
        console.log('Redirecionado para login, realizando login...');
        isLoggedIn = false;
        return await ensureLoggedInAndNavigate();
      }
      
      // Navegar para relatórios de animais
      console.log('Acessando relatórios de animais...');
      await currentPage.getByRole('link', { name: 'Animais' }).click();
      await currentPage.waitForTimeout(2000);
      await currentPage.getByRole('link', { name: 'Lista de Animais' }).click();
      await currentPage.waitForTimeout(2000);
      
      // Configurar visualização
      console.log('Configurando visualização...');
      await currentPage.getByRole('button', { name: ' Colunas' }).click();
      await currentPage.getByRole('checkbox', { name: '#' }).uncheck();
      await currentPage.getByRole('button', { name: '+ ' }).click();
      await currentPage.getByLabel('Visualizar').selectOption('3'); // Selecionar visualização completa
      
      // Se um ano foi especificado, configurar o período
      if (ano) {
        console.log(`Selecionando período de 01/01/${ano} a 31/12/${ano}`);
        
        try {
          // Abrir o selecionador de datas
          await currentPage.getByRole('textbox', { name: 'Data Cadastro' }).click();
          await currentPage.waitForTimeout(1000);
          
          // Clicar em "Escolher período"
          await currentPage.getByText('Escolher período').click();
          
          // Configurar as datas do período
          await configurarPeriodoAno(currentPage, ano);
          
          // Aplicar o filtro
          await currentPage.getByRole('button', { name: 'Filtrar' }).click();
          await currentPage.waitForTimeout(5000);
        } catch (error) {
          console.error('Erro ao selecionar datas:', error);
          throw error;
        }
      }
      
      console.log('Página de relatórios de animais carregada');
      
      // Confirmar que está logado
      isLoggedIn = true;
      lastUsed = Date.now();
      return currentPage;
    } else {
      // Se não estiver logado, fazer login primeiro e depois navegar
      return await ensureLoggedInAndNavigate();
    }
  } catch (error) {
    console.error('Erro ao navegar para a página de relatórios de animais:', error);
    // Se houver erro na navegação, pode ser que a sessão tenha expirado
    isLoggedIn = false;
    // Tentar novamente com login
    await resetSession();
    return navigateToRelatorioAnimais(headless, forceRefresh, ano);
  }
  
  // Função auxiliar para fazer login e navegar
  async function ensureLoggedInAndNavigate(): Promise<Page> {
    await ensureLoggedIn(headless);
    console.log('Navegando para a página de relatórios após login...');
    return navigateToRelatorioAnimais(headless, true, ano);
  }
}

// Função auxiliar para configurar o período do ano nos relatórios
async function configurarPeriodoAno(page: Page, ano: string): Promise<void> {
  try {
    // Vamos obter o mês e ano atuais para calcular quantos meses precisamos navegar
    const mesAnoAtual = await page.locator('.drp-calendar.left .month').textContent();
    console.log(`Mês e ano atuais: ${mesAnoAtual}`);
    
    // Navegar para janeiro do ano desejado
    const anoDesejado = parseInt(ano);
    
    // Clicar no seletor de mês/ano
    await page.locator('.drp-calendar.left .month').click();
    await page.waitForTimeout(500);
    
    // Clicar no seletor de ano
    await page.locator('.drp-calendar.left .yearselect').click();
    await page.waitForTimeout(500);
    
    // Selecionar o ano desejado
    await page.locator(`.drp-calendar.left .yearselect option[value="${anoDesejado}"]`).click();
    await page.waitForTimeout(500);
    
    // Selecionar janeiro
    await page.locator('.drp-calendar.left .monthselect option[value="0"]').click();
    await page.waitForTimeout(500);
    
    console.log(`Clicando no dia 1 de janeiro de ${anoDesejado}...`);
    
    try {
      // Tentar clicar no dia 1
      await page.locator('.drp-calendar.left td.available').filter({ hasText: '1' }).first().click();
      console.log('Clicado no dia 1 de janeiro');
    } catch (error) {
      console.log('Erro ao clicar no dia 1, tentando outro dia disponível...');
      try {
        await page.locator('.drp-calendar.left td.available').first().click();
        console.log('Clicado em um dia disponível de janeiro');
      } catch (error) {
        console.log('Erro ao clicar em qualquer dia disponível:', error);
        throw error;
      }
    }
    
    // Agora vamos para dezembro do mesmo ano
    // Clicar no seletor de mês/ano
    await page.locator('.drp-calendar.right .month').click();
    await page.waitForTimeout(500);
    
    // Clicar no seletor de ano
    await page.locator('.drp-calendar.right .yearselect').click();
    await page.waitForTimeout(500);
    
    // Selecionar o ano desejado
    await page.locator(`.drp-calendar.right .yearselect option[value="${anoDesejado}"]`).click();
    await page.waitForTimeout(500);
    
    // Selecionar dezembro
    await page.locator('.drp-calendar.right .monthselect option[value="11"]').click();
    await page.waitForTimeout(500);
    
    console.log(`Clicando no dia 31 de dezembro de ${anoDesejado}...`);
    
    try {
      // Tentar clicar no dia 31
      await page.locator('.drp-calendar.right td.available').filter({ hasText: '31' }).first().click();
      console.log('Clicado no dia 31 de dezembro');
    } catch (error) {
      console.log('Erro ao clicar no dia 31, tentando o último dia disponível...');
      try {
        // Tentar clicar no último dia disponível
        const diasDisponiveis = await page.locator('.drp-calendar.right td.available').count();
        if (diasDisponiveis > 0) {
          await page.locator('.drp-calendar.right td.available').nth(diasDisponiveis - 1).click();
          console.log('Clicado no último dia disponível de dezembro');
        } else {
          throw new Error('Nenhum dia disponível em dezembro');
        }
      } catch (error) {
        console.log('Erro ao clicar em qualquer dia disponível:', error);
        throw error;
      }
    }
    
    // Clicar no botão Aplicar
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.waitForTimeout(2000);
    
    console.log(`Período configurado para o ano ${anoDesejado}`);
  } catch (error) {
    console.log(`Erro ao tentar ajustar o ano: ${error}`);
    throw error;
  }
}

// Garantir que o navegador seja fechado quando a aplicação for encerrada
process.on('exit', async () => {
  clearInterval(checkInterval);
  await closeBrowser();
});

process.on('SIGINT', async () => {
  clearInterval(checkInterval);
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  clearInterval(checkInterval);
  await closeBrowser();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('Erro não tratado:', error);
  clearInterval(checkInterval);
  await closeBrowser();
  process.exit(1);
});
