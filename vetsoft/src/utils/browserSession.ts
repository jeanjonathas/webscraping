import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { config } from '../config';
import { withLockWait } from './requestSemaphore';

// Variáveis para armazenar a sessão do navegador
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let lastUsed: number = Date.now();
let isLoggedIn: boolean = false;
let browserStartTime: number = Date.now();
let loginAttempts: number = 0;
let navigationAttempts: number = 0;

// Número máximo de tentativas de login e navegação
const MAX_LOGIN_ATTEMPTS = 3;
const MAX_NAVIGATION_ATTEMPTS = 3;

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
    
    // Configurar listener para capturar mensagens e erros do console
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || text.includes('401') || text.includes('Unauthorized')) {
        console.log(`Erro no console do navegador: ${text}`);
        if (text.includes('401') || text.includes('Unauthorized')) {
          console.log('Detectado erro 401 no console, marcando sessão como expirada');
          isLoggedIn = false;
        }
      }
    });
    
    // Configurar listener para tratar diálogos (alerts, confirms, prompts)
    page.on('dialog', async dialog => {
      const message = dialog.message();
      console.log(`Diálogo detectado: ${dialog.type()}, mensagem: ${message}`);
      
      // Verificar se é o alerta de sessão expirada
      if (message.includes('usuário está logado em outro navegador') || 
          message.includes('sessão foi finalizada')) {
        console.log('Detectado alerta de sessão expirada em outro navegador');
        
        try {
          // Aceitar o diálogo
          await dialog.accept();
          console.log('Diálogo aceito automaticamente');
          
          // Marcar sessão como expirada
          isLoggedIn = false;
          
          // Resetar a sessão (fechar e recriar o navegador)
          await resetSession();
        } catch (error) {
          console.error('Erro ao tentar aceitar diálogo:', error);
          // Se não conseguir aceitar o diálogo, forçar o fechamento do navegador
          await closeBrowser();
        }
      } else {
        // Para outros tipos de diálogos, apenas aceitar
        try {
          await dialog.accept();
          console.log('Diálogo aceito automaticamente');
        } catch (error) {
          console.error('Erro ao tentar aceitar diálogo:', error);
        }
      }
    });
    
    isLoggedIn = false;
  }
  
  lastUsed = Date.now();
  return page;
}

// Função para verificar se está logado e fazer login se necessário
export async function ensureLoggedIn(headless: boolean = false): Promise<Page> {
  const operationId = `login-${Date.now()}`;
  
  return withLockWait(operationId, async () => {
    // Obter a página atual ou criar uma nova
    const currentPage = await getPage(headless);
    
    // Se não estiver logado, fazer login
    if (!isLoggedIn) {
      console.log('Não está logado, realizando login...');
      
      try {
        // Incrementar contador de tentativas
        loginAttempts++;
        console.log(`Tentativa de login ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}`);
        
        // Verificar se excedeu o número máximo de tentativas
        if (loginAttempts > MAX_LOGIN_ATTEMPTS) {
          console.error(`Número máximo de tentativas de login (${MAX_LOGIN_ATTEMPTS}) excedido. Desistindo.`);
          // Resetar contadores para permitir novas tentativas no futuro
          loginAttempts = 0;
          throw new Error(`Falha no login após ${MAX_LOGIN_ATTEMPTS} tentativas.`);
        }
        
        // Navegar para a página de login
        await currentPage.goto('https://dranimal.vetsoft.com.br/', { waitUntil: 'networkidle' });
        console.log('Página de login carregada');
        
        // Preencher credenciais
        console.log('Preenchendo credenciais...');
        await currentPage.fill('input[name="user"]', config.vetsoft.username || '');
        await currentPage.fill('input[name="pwd"]', config.vetsoft.password || '');
        
        // Enviar formulário
        console.log('Credenciais enviadas, aguardando navegação...');
        await currentPage.press('input[name="pwd"]', 'Enter');
        
        // Aguardar navegação após login
        await currentPage.waitForNavigation({ waitUntil: 'networkidle' });
        console.log('Navegação após login concluída');
        
        // Verificar se o login foi bem-sucedido
        const currentUrl = currentPage.url();
        if (currentUrl.includes('/login') || await checkSessionExpired(currentPage)) {
          console.error('Falha no login, ainda na página de login ou sessão expirada');
          isLoggedIn = false;
          throw new Error('Falha no login, credenciais inválidas ou sessão expirada');
        }
        
        console.log('Login bem-sucedido');
      } catch (error) {
        console.error('Erro ao realizar login:', error);
        // Se houver erro no login, resetar a sessão
        await resetSession();
        throw error;
      }
      
      isLoggedIn = true;
      browserStartTime = Date.now(); // Atualizar o tempo de início do navegador após login bem-sucedido
      loginAttempts = 0; // Resetar contador de tentativas após login bem-sucedido
    } else {
      console.log('Usando sessão existente (já logado)');
    }
    
    lastUsed = Date.now();
    return currentPage;
  }, 120000); // Aguardar até 2 minutos pelo bloqueio
}

// Função para navegar para a página de internação
export async function navigateToInternacao(headless: boolean = false, forceRefresh: boolean = false): Promise<Page> {
  const operationId = `internacao-${Date.now()}`;
  
  return withLockWait(operationId, async () => {
    // Obter a página atual ou criar uma nova
    const currentPage = await getPage(headless);
    
    try {
      // Se já estiver logado, navegar diretamente para a URL de internação
      if (isLoggedIn || forceRefresh) {
        console.log('Navegando diretamente para a página de internação...');
        
        // Verificar se excedeu o número máximo de tentativas
        if (navigationAttempts >= MAX_NAVIGATION_ATTEMPTS) {
          console.error(`Número máximo de tentativas de navegação (${MAX_NAVIGATION_ATTEMPTS}) excedido. Desistindo.`);
          // Resetar contadores para permitir novas tentativas no futuro
          navigationAttempts = 0;
          throw new Error(`Falha na navegação após ${MAX_NAVIGATION_ATTEMPTS} tentativas.`);
        }
        
        navigationAttempts++; // Incrementar contador de tentativas
        console.log(`Tentativa de navegação ${navigationAttempts}/${MAX_NAVIGATION_ATTEMPTS}`);
        
        // Configurar listener para detectar respostas com erro 401
        currentPage.on('response', async response => {
          if (response.status() === 401) {
            console.log('Detectada resposta 401 (Unauthorized), sessão expirada');
            isLoggedIn = false;
          }
        });
        
        // Verificar se já estamos na página de internação
        const currentUrl = currentPage.url();
        if (currentUrl.includes('/internacoes/')) {
          console.log('Já está na página de internação, atualizando...');
          await currentPage.reload({ waitUntil: 'networkidle' });
        } else {
          await currentPage.goto('https://dranimal.vetsoft.com.br/m/internacoes/#list/page/1', { waitUntil: 'networkidle' });
        }
        console.log('Página de internação carregada');
        
        // Verificar se a sessão expirou após a navegação
        if (await checkSessionExpired(currentPage)) {
          console.log('Sessão expirada após navegação, realizando login novamente...');
          isLoggedIn = false;
          return await ensureLoggedInAndNavigate();
        }
        
        // Confirmar que está logado
        lastUsed = Date.now();
        navigationAttempts = 0; // Resetar contador após sucesso
        return currentPage;
      } else {
        // Se não estiver logado, fazer login primeiro e depois navegar
        return await ensureLoggedInAndNavigate();
      }
    } catch (error) {
      console.error('Erro ao navegar para a página de internação:', error);
      // Se houver erro na navegação, pode ser que a sessão tenha expirado
      isLoggedIn = false;
      // Tentar novamente com login, se não excedeu o número máximo de tentativas
      await resetSession();
      
      // Não incrementar navigationAttempts aqui, pois a próxima chamada já vai incrementar
      return navigateToInternacao(headless, forceRefresh);
    }
  }, 120000); // Aguardar até 2 minutos pelo bloqueio
  
  // Função auxiliar para fazer login e navegar
  async function ensureLoggedInAndNavigate(): Promise<Page> {
    await ensureLoggedIn(headless);
    console.log('Navegando para a página de internação após login...');
    const currentPage = await getPage(headless);
    await currentPage.goto('https://dranimal.vetsoft.com.br/m/internacoes/#list/page/1', { waitUntil: 'networkidle' });
    console.log('Página de internação carregada');
    lastUsed = Date.now();
    return currentPage;
  }
}

// Função para navegar para a página de relatório de animais
export async function navigateToRelatorioAnimais(headless: boolean = false, forceRefresh: boolean = false, ano: string = ''): Promise<Page> {
  const operationId = `relatorio-animais-${Date.now()}`;
  
  return withLockWait(operationId, async () => {
    // Obter a página atual ou criar uma nova
    const currentPage = await getPage(headless);
    
    try {
      // Se já estiver logado, navegar diretamente para a URL de relatório de animais
      if (isLoggedIn || forceRefresh) {
        console.log('Navegando diretamente para a página de relatório de animais...');
        
        // Verificar se excedeu o número máximo de tentativas
        if (navigationAttempts >= MAX_NAVIGATION_ATTEMPTS) {
          console.error(`Número máximo de tentativas de navegação (${MAX_NAVIGATION_ATTEMPTS}) excedido. Desistindo.`);
          // Resetar contadores para permitir novas tentativas no futuro
          navigationAttempts = 0;
          throw new Error(`Falha na navegação após ${MAX_NAVIGATION_ATTEMPTS} tentativas.`);
        }
        
        navigationAttempts++; // Incrementar contador de tentativas
        console.log(`Tentativa de navegação ${navigationAttempts}/${MAX_NAVIGATION_ATTEMPTS}`);
        
        // Configurar listener para detectar respostas com erro 401
        currentPage.on('response', async response => {
          if (response.status() === 401) {
            console.log('Detectada resposta 401 (Unauthorized), sessão expirada');
            isLoggedIn = false;
          }
        });
        
        // Navegar para a página de relatórios
        await currentPage.goto('https://dranimal.vetsoft.com.br/m/relatorios/', { waitUntil: 'networkidle' });
        
        // Verificar se realmente está na página correta (pode ter sido redirecionado para login)
        const currentUrl = currentPage.url();
        if (currentUrl.includes('/login') || await checkSessionExpired(currentPage)) {
          console.log('Redirecionado para login ou sessão expirada, realizando login...');
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
        lastUsed = Date.now();
        navigationAttempts = 0; // Resetar contador após sucesso
        return currentPage;
      } else {
        // Se não estiver logado, fazer login primeiro e depois navegar
        return await ensureLoggedInAndNavigate();
      }
    } catch (error) {
      console.error('Erro ao navegar para a página de relatório de animais:', error);
      // Se houver erro na navegação, pode ser que a sessão tenha expirado
      isLoggedIn = false;
      // Tentar novamente com login
      await resetSession();
      return navigateToRelatorioAnimais(headless, forceRefresh, ano);
    }
  }, 120000); // Aguardar até 2 minutos pelo bloqueio
  
  // Função auxiliar para fazer login e navegar
  async function ensureLoggedInAndNavigate(): Promise<Page> {
    await ensureLoggedIn(headless);
    console.log('Navegando para a página de relatório de animais após login...');
    return navigateToRelatorioAnimais(headless, true, ano);
  }
}

// Função para configurar o período do ano nos relatórios
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

// Função para verificar se a sessão expirou
async function checkSessionExpired(page: Page): Promise<boolean> {
  try {
    // Verificar se há mensagem de erro de sessão expirada no console
    const consoleMessages = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.alert, div.error-message, .toast-message, .toast-error'))
        .map(el => el.textContent?.trim() || '');
    });
    
    const sessionExpiredMessages = [
      'Você não logou no sistema',
      'sua sessão expirou',
      'efetue o login novamente',
      'Unauthorized',
      '401'
    ];
    
    // Verificar se alguma mensagem de erro de sessão expirada está presente
    const hasSessionExpiredMessage = consoleMessages.some(message => 
      sessionExpiredMessages.some(expiredMsg => message.includes(expiredMsg))
    );
    
    // Verificar se a página atual é a página de login
    const isLoginPage = page.url().includes('/login');
    
    // Verificar se há elementos específicos da página de login
    const hasLoginElements = await page.evaluate(() => {
      return !!document.querySelector('input[name="user"]') || 
             !!document.querySelector('input[name="pwd"]') ||
             !!document.querySelector('form.login-form');
    });
    
    // Verificar se a página está vazia ou tem conteúdo mínimo (possível redirecionamento)
    const pageContent = await page.evaluate(() => {
      // Verificar se o corpo da página tem conteúdo mínimo
      const bodyContent = document.body.innerText.trim();
      return {
        isEmpty: bodyContent.length < 50, // Página praticamente vazia
        hasErrorText: bodyContent.includes('401') || 
                     bodyContent.includes('Unauthorized') || 
                     bodyContent.includes('não logou') ||
                     bodyContent.includes('sessão expirou')
      };
    });
    
    return hasSessionExpiredMessage || 
           isLoginPage || 
           hasLoginElements || 
           pageContent.isEmpty || 
           pageContent.hasErrorText;
  } catch (error) {
    console.error('Erro ao verificar se a sessão expirou:', error);
    return true; // Em caso de erro, assume que a sessão expirou para garantir
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
