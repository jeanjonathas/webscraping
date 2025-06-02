import { Router } from 'express';
import { resetSession, getPage, ensureLoggedIn } from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';
import { config } from '../config';
import path from 'path';

// Variável para controlar o estado de login
let isLoggedIn = false;

const router = Router();

// Interface para os dados completos de animais
interface AnimalCompleto {
  id: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  idade: string;
  data_cadastro: string;
  peso: string;
  data_peso: string;
  porte: string;
  data_nascimento: string;
  data_nascimento_formatada: string;
  data_obito: string | null;
  data_obito_formatada: string | null;
  esterilizado: boolean;
  pelagem: string;
  status_cadastro: string;
  codigo_internacao: string | null;
  tutor: {
    id: string;
    nome: string;
    whatsapp: string;
    telefone: string;
    dados_whatsapp: any; // Dados completos extraídos do botão de WhatsApp
  };
}



// Função para navegar diretamente para o relatório de animais sem usar o semáforo
async function navegarParaRelatorioAnimaisSemSemaforo(headless: boolean = true, forceRefresh: boolean = false): Promise<any> {
  try {
    // Obter a página atual ou criar uma nova
    console.log(`Obtendo página com headless=${headless}...`);
    const page = await getPage(headless);
    
    // Se já estiver logado, navegar diretamente para a URL de relatório de animais
    if (isLoggedIn || forceRefresh) {
      console.log('Navegando diretamente para a página de relatório de animais...');
      
      // Navegar para a página de relatórios
      await page.goto('https://dranimal.vetsoft.com.br/m/relatorios/', { waitUntil: 'networkidle' });
      
      // Navegar para relatórios de animais
      console.log('Acessando relatórios de animais...');
      await page.getByRole('link', { name: 'Animais' }).click();
      await page.waitForTimeout(2000);
      await page.getByRole('link', { name: 'Lista de Animais' }).click();
      await page.waitForTimeout(2000);
      
      // Configurar visualização
      console.log('Configurando visualização...');
      await page.getByRole('button', { name: ' Colunas' }).click();
      await page.getByRole('checkbox', { name: '#' }).uncheck();
      await page.getByRole('button', { name: '+ ' }).click();
      await page.getByLabel('Visualizar').selectOption('3'); // Selecionar visualização completa
      
      return page;
    } else {
      // Se não estiver logado, fazer login primeiro
      console.log('Não está logado, realizando login...');
      
      // Navegar para a página de login
      await page.goto('https://dranimal.vetsoft.com.br/', { waitUntil: 'networkidle' });
      console.log('Página de login carregada');
      
      // Preencher credenciais
      console.log('Preenchendo credenciais...');
      console.log(`Username disponível: ${config.vetsoft.username ? 'Sim' : 'Não'}`);
      console.log(`Password disponível: ${config.vetsoft.password ? 'Sim' : 'Não'}`);
      await page.fill('input[name="user"]', config.vetsoft.username || '');
      await page.fill('input[name="pwd"]', config.vetsoft.password || '');
      
      // Enviar formulário
      console.log('Credenciais enviadas, aguardando navegação...');
      await page.press('input[name="pwd"]', 'Enter');
      
      // Aguardar navegação após login
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      console.log('Navegação após login concluída');
      
      // Verificar se o login foi bem-sucedido
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        console.error('Falha no login, ainda na página de login');
        throw new Error('Falha no login, credenciais inválidas');
      }
      
      console.log('Login bem-sucedido');
      isLoggedIn = true;
      
      // Agora navegar para a página de relatórios
      return navegarParaRelatorioAnimaisSemSemaforo(headless, true);
    }
  } catch (error) {
    console.error('Erro ao navegar para a página de relatório de animais:', error);
    throw error;
  }
}

// Rota para obter relatório de animais com período personalizado
router.get('/', async (req, res) => {
  // Parâmetros da query
  const periodo = req.query.periodo as string || 'atual'; // atual, proximo, todos, ou intervalo personalizado
  const dataInicial = req.query.dataInicial as string;
  const dataFinal = req.query.dataFinal as string;
  const showBrowser = req.query.show === 'true';
  const forceRefresh = req.query.refresh === 'true';
  const headless = !showBrowser;
  
  const operationId = `relatorio-animais-${Date.now()}`;
  
  console.log(`Rota /relatorio-animais foi chamada com período: ${periodo}`);
  console.log(`Parâmetros: showBrowser=${showBrowser}, forceRefresh=${forceRefresh}`);
  
  try {
    // IMPORTANTE: Obter uma página com login já feito ANTES de adquirir o semáforo principal
    // Isso evita deadlock entre os semáforos
    console.log('Obtendo página com login já feito (antes do semáforo principal)...');
    const page = await ensureLoggedIn(headless);
    
    // Usar o sistema de semáforo para garantir acesso exclusivo ao navegador durante toda a operação
    const result = await withLockWait<{ success: boolean; data?: AnimalCompleto[]; csv?: string; total?: number; error?: string }>(operationId, async () => {
      console.log(`Semáforo adquirido para ${operationId}, iniciando navegação...`);
      
      // Navegar para a página de relatório de animais
      console.log(`Iniciando navegação com navegador ${showBrowser ? 'visível' : 'headless'}...`);
      // Navegar para a página de relatórios
      await page.goto('https://dranimal.vetsoft.com.br/m/relatorios/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await page.getByRole('link', { name: 'Animais' }).click();
      await page.waitForTimeout(2000);
      await page.getByRole('link', { name: 'Lista de Animais' }).click();
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: ' Colunas' }).click();
      await page.getByRole('checkbox', { name: '#' }).uncheck();
      await page.getByRole('button', { name: '+ ' }).click();
      await page.getByLabel('Visualizar').selectOption('3');
      console.log('Navegação concluída com sucesso, página carregada.');
      
      
      // Configurar o período de consulta
      if (periodo !== 'todos') {
        console.log(`Configurando período: ${periodo}`);
        
        // Clicar no campo de data
        await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
        await page.waitForTimeout(1000);
        
        // Clicar em "Escolher período"
        await page.getByText('Escolher período').click();
        await page.waitForTimeout(1000);
        
        if (periodo === 'atual' || periodo === 'proximo') {
          // Obter o mês atual
          const dataAtual = new Date();
          let mes = dataAtual.getMonth();
          let ano = dataAtual.getFullYear();
          
          if (periodo === 'proximo') {
            mes += 1;
            if (mes > 11) {
              mes = 0;
              ano += 1;
            }
          }
          
          // Selecionar o mês e ano na interface
          await configurarPeriodoMes(page, mes, ano);
        } else if (dataInicial && dataFinal) {
          // Configurar período personalizado
          await configurarPeriodoPersonalizado(page, dataInicial, dataFinal);
        }
      }
      
      // Verificar se há dados na tabela antes de extrair
      console.log('Verificando se há dados na tabela antes de extrair...');
      const numRegistros = await page.locator('#grid_RelatorioAnimais tbody tr').count();
      console.log(`Encontrados ${numRegistros} registros na tabela`);
      
      // Aguardar um momento para garantir que a tabela está completamente carregada
      await page.waitForTimeout(2000);
      
      console.log('Extraindo dados de animais...');
      const animais: AnimalCompleto[] = await page.evaluate(() => {
        const dados: any[] = [];
        
        // Encontrar a tabela de animais
        const tabela = document.querySelector('#grid_RelatorioAnimais');
        
        if (!tabela) {
          console.error('Tabela de animais não encontrada');
          return dados;
        }
        
        // Processar as linhas da tabela
        const linhas = Array.from(tabela.querySelectorAll('tbody tr'));
        console.log(`Total de linhas encontradas: ${linhas.length}`);
        
        // Se não houver linhas, verificar se há alguma mensagem de "nenhum registro encontrado"
        if (linhas.length === 0) {
          console.warn('Nenhuma linha encontrada na tabela');
          const mensagemVazia = document.querySelector('.datagrid .no-records');
          if (mensagemVazia) {
            console.warn(`Mensagem encontrada: ${mensagemVazia.textContent?.trim()}`);
          }
          return dados;
        }
        
        for (const linha of linhas) {
          try {
            // Obter o ID da linha para debug
            const linhaId = linha.getAttribute('id') || 'sem-id';
            console.log(`Processando linha: ${linhaId}`);
            
            const colunas = Array.from(linha.querySelectorAll('td'));
            console.log(`Linha ${linhaId}: ${colunas.length} colunas encontradas`);
            
            if (colunas.length < 10) {
              console.warn(`Linha ${linhaId} com número insuficiente de colunas: ${colunas.length}`);
              continue;
            }
            
            // Extrair dados do animal
            const animalLink = colunas[1]?.querySelector('a');
            const animalNome = animalLink?.textContent?.trim() || '';
            const animalHref = animalLink?.getAttribute('href') || '';
            const codigoAnimalMatch = animalHref.match(/cod_animal=(\d+)/);
            const codigoAnimal = codigoAnimalMatch ? codigoAnimalMatch[1] : '';
            console.log(`Animal: ${animalNome} (ID: ${codigoAnimal})`);
            
            // Extrair espécie e raça
            const especieRaca = colunas[2]?.textContent?.trim() || '';
            let especie = '', raca = '';
            
            if (especieRaca.includes('/')) {
              const partes = especieRaca.split('/');
              especie = partes[0].trim();
              raca = partes.slice(1).join('/').trim();
            } else {
              especie = especieRaca;
            }
            console.log(`Espécie: ${especie}, Raça: ${raca}`);
            
            // Extrair sexo
            const sexo = colunas[3]?.textContent?.trim() || '';
            console.log(`Sexo: ${sexo}`);
            
            // Extrair idade
            const idade = colunas[4]?.textContent?.trim() || '';
            console.log(`Idade: ${idade}`);
            
            // Extrair data de cadastro
            const dataCadastro = colunas[5]?.textContent?.trim() || '';
            console.log(`Data de cadastro: ${dataCadastro}`);
            
            // Extrair peso
            const peso = colunas[6]?.textContent?.trim() || '';
            console.log(`Peso: ${peso}`);
            
            // Extrair data do peso
            const dataPeso = colunas[7]?.textContent?.trim() || '';
            console.log(`Data do peso: ${dataPeso}`);
            
            // Extrair dados do tutor
            const tutorLink = colunas[8]?.querySelector('a');
            const tutorNome = tutorLink?.textContent?.trim() || '';
            const tutorHref = tutorLink?.getAttribute('href') || '';
            const codigoTutorMatch = tutorHref.match(/cod_cliente=(\d+)/);
            const codigoTutor = codigoTutorMatch ? codigoTutorMatch[1] : '';
            console.log(`Tutor: ${tutorNome} (ID: ${codigoTutor})`);
            
            // Extrair telefone
            const telefone = colunas[9]?.textContent?.trim() || '';
            console.log(`Telefone: ${telefone}`);
            
            // Extrair dados do botão de WhatsApp
            const whatsappBtn = colunas[10]?.querySelector('.btn-whatsapp');
            const whatsappOnClick = whatsappBtn?.getAttribute('onclick') || '';
            let dadosWhatsapp = null;
            let whatsappNumero = '';
            let porte = '';
            let dataNascimento = '';
            let dataNascimentoFormatada = '';
            let dataObito = null;
            let dataObitoFormatada = null;
            let esterilizado = false;
            let pelagem = '';
            let statusCadastro = '';
            let codigoInternacao = null;
            
            if (whatsappOnClick) {
              // Extrair o JSON do onclick
              const jsonMatch = whatsappOnClick.match(/MensagemWhatsapp\.viewMessages\('animais,clientes',\s*'(.+?)'\)/);
              if (jsonMatch && jsonMatch[1]) {
                try {
                  // Substituir aspas simples escapadas por aspas duplas para criar um JSON válido
                  const jsonStr = jsonMatch[1].replace(/\\'/g, "'").replace(/'/g, '"');
                  dadosWhatsapp = JSON.parse(jsonStr);
                  whatsappNumero = dadosWhatsapp.whatsapp_to || '';
                  
                  // Extrair dados adicionais do botão WhatsApp
                  porte = dadosWhatsapp.des_porte || '';
                  dataNascimento = dadosWhatsapp.dat_nascimento || '';
                  dataNascimentoFormatada = dadosWhatsapp.dat_nascimento_f || '';
                  dataObito = dadosWhatsapp.dat_obito;
                  dataObitoFormatada = dadosWhatsapp.dat_obito_f;
                  esterilizado = dadosWhatsapp.is_esterilizado === '1';
                  pelagem = dadosWhatsapp.nom_pelagem || '';
                  statusCadastro = dadosWhatsapp.sit_cadastro_animal || '';
                  codigoInternacao = dadosWhatsapp.cod_internacao;
                } catch (e) {
                  console.error('Erro ao fazer parse dos dados de WhatsApp:', e);
                }
              }
            }
            
            // Adicionar o animal à lista de dados
            dados.push({
              id: codigoAnimal,
              nome: animalNome,
              especie: especie,
              raca: raca,
              sexo: sexo,
              idade: idade,
              data_cadastro: dataCadastro,
              peso: peso,
              data_peso: dataPeso,
              porte: porte,
              data_nascimento: dataNascimento,
              data_nascimento_formatada: dataNascimentoFormatada,
              data_obito: dataObito,
              data_obito_formatada: dataObitoFormatada,
              esterilizado: esterilizado,
              pelagem: pelagem,
              status_cadastro: statusCadastro,
              codigo_internacao: codigoInternacao,
              tutor: {
                id: codigoTutor,
                nome: tutorNome,
                whatsapp: whatsappNumero || telefone.replace(/[^0-9]/g, ''),
                telefone: telefone,
                dados_whatsapp: dadosWhatsapp
              }
            });
          } catch (error) {
            console.error('Erro ao processar linha:', error);
          }
        }
        
        return dados;
      });
      
      console.log(`Extraídos ${animais.length} animais`);
      
      return {
        success: true,
        data: animais,
        total: animais.length
      };
    }, 300000); // Aguardar até 5 minutos pelo bloqueio
    
    return res.json(result);
    
  } catch (error: any) {
    console.error('Erro durante a extração:', error);
    
    // Se ocorrer um erro, tenta resetar a sessão para a próxima tentativa
    await resetSession();
    
    // Verificar se o erro é relacionado ao timeout do semáforo
    if (error.message && error.message.includes('Timeout ao aguardar o bloqueio')) {
      return res.status(503).json({
        success: false,
        error: 'Serviço temporariamente indisponível. Tente novamente mais tarde.',
        details: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

// Função para configurar período por mês e ano
async function configurarPeriodoMes(page: any, mes: number, ano: number): Promise<void> {
  try {
    console.log(`Configurando período para mês ${mes + 1}/${ano}`);
    
    // Clicar no campo de data para abrir o seletor
    console.log('Clicando no campo de data para abrir o seletor...');
    await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
    await page.waitForTimeout(2000);
    
    // Verificar se o DateRangePicker está aberto
    const dateRangePickerVisible = await page.locator('.daterangepicker').isVisible();
    if (!dateRangePickerVisible) {
      console.warn('DateRangePicker não está visível após clicar no campo de data');
      // Tentar clicar novamente
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
      await page.waitForTimeout(2000);
    }
    
    // Selecionar "Este mês" nas opções pré-definidas (mais confiável)
    console.log('Selecionando "Este mês"...');
    await page.locator('.ranges li[data-range-key="Este mês"]').click();
    await page.waitForTimeout(2000);
    
    // Verificar se o botão Aplicar está visível e clicar nele
    // O botão Aplicar pode ser automático, mas vamos garantir
    console.log('Verificando se é necessário clicar no botão Aplicar...');
    const applyBtn = page.locator('.applyBtn');
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.waitForTimeout(2000);
    }
    
    // Verificar se o calendário fechou
    const calendarClosed = !(await page.locator('.daterangepicker').isVisible());
    console.log(`Calendário fechou após selecionar período: ${calendarClosed}`);
    
    // Clicar no botão Filtrar para aplicar o filtro
    console.log('Clicando no botão Filtrar...');
    try {
      // Tentar com o seletor mais específico primeiro
      const filtrarBtn = page.locator('button.btn-primary').filter({ hasText: 'Filtrar' });
      if (await filtrarBtn.count() > 0) {
        await filtrarBtn.click();
      } else {
        // Tentar com o seletor por atributo
        await page.locator('button.btn-primary[data-original-title="Aplicar Filtros"]').click({ timeout: 5000 });
      }
    } catch (e) {
      console.log('Tentando seletor alternativo para o botão Filtrar...');
      try {
        // Tentar com o seletor por texto
        await page.getByRole('button', { name: 'Filtrar' }).click({ timeout: 5000 });
      } catch (e2) {
        console.log('Tentando seletor genérico para o botão Filtrar...');
        // Tentar com um seletor mais genérico
        await page.locator('button.btn-primary').first().click({ timeout: 5000 });
      }
    }
    
    // Aguardar o carregamento dos dados
    console.log('Aguardando carregamento dos dados após filtrar...');
    await page.waitForTimeout(10000); // Aumentar para 10 segundos
    
    // Verificar se há overlay de carregamento e aguardar que desapareça
    const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
    if (hasLoadingOverlay) {
      console.log('Detectado overlay de carregamento, aguardando finalizar...');
      await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 30000 }).catch((e: Error) => {
        console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
      });
    }
    
    // Verificar se a tabela foi carregada
    console.log('Verificando se a tabela foi carregada...');
    const tabelaVisivel = await page.locator('#grid_RelatorioAnimais').isVisible();
    if (!tabelaVisivel) {
      console.warn('Tabela não está visível, aguardando mais tempo...');
      await page.waitForTimeout(5000); // Aguardar mais 5 segundos
    }
    
    console.log(`Período configurado com sucesso para o mês ${mes + 1}/${ano}`);
    
    // Verificar se há dados na tabela
    console.log('Verificando dados na tabela...');
    const numRegistros = await page.locator('#grid_RelatorioAnimais tbody tr').count();
    
    if (numRegistros === 0) {
      console.warn('Nenhum dado encontrado na tabela após configurar o período');
      // Tentar clicar novamente no botão Filtrar
      console.log('Tentando clicar novamente no botão Filtrar...');
      try {
        await page.locator('button.btn-primary').first().click({ timeout: 5000 });
        await page.waitForTimeout(5000);
      } catch (e) {
        console.warn('Erro ao clicar novamente no botão Filtrar:', e);
      }
    } else {
      console.log(`Encontrados ${numRegistros} registros na tabela. Prosseguindo com a extração...`);
    }
  } catch (error) {
    console.error('Erro ao configurar período por mês:', error);
    throw error;
  }
}

// Rota para servir a página HTML de exportação de relatório
router.get('/exportar', (_req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'exportar-relatorio-animais.html');
  res.sendFile(filePath);
});

// Rota para exportar dados em CSV
router.get('/exportar-csv', async (req, res) => {
  try {
    // Parâmetros da query
    const periodo = req.query.periodo as string || 'atual';
    const dataInicial = req.query.dataInicial as string;
    const dataFinal = req.query.dataFinal as string;
    const showBrowser = req.query.show === 'true';
    
    // Obter os dados usando a mesma lógica da rota /relatorio
    const operationId = `relatorio-animais-csv-${Date.now()}`;
    
    console.log(`Rota /exportar-csv foi chamada com período: ${periodo}`);
    console.log(`Parâmetros: showBrowser=${showBrowser}, dataInicial=${dataInicial}, dataFinal=${dataFinal}`);
    
    const result = await withLockWait<{ success: boolean; data?: AnimalCompleto[]; csv?: string; total?: number; error?: string }>(operationId, async () => {
      console.log(`Semáforo adquirido para ${operationId}, iniciando navegação...`);
      
      // Navegar para a página de relatório de animais com o navegador visível se solicitado
      console.log(`Iniciando navegação com navegador ${showBrowser ? 'visível' : 'headless'}...`);
      const page = await navegarParaRelatorioAnimaisSemSemaforo(showBrowser ? false : true, false);
      console.log('Navegação concluída com sucesso, página carregada.');
      
      // Configurar o período de consulta
      if (periodo !== 'todos') {
        console.log(`Configurando período: ${periodo}`);
        
        // Clicar no campo de data
        await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
        await page.waitForTimeout(1000);
        
        // Clicar em "Escolher período"
        await page.getByText('Escolher período').click();
        await page.waitForTimeout(1000);
        
        if (periodo === 'atual' || periodo === 'proximo') {
          // Obter o mês atual
          const dataAtual = new Date();
          let mes = dataAtual.getMonth();
          let ano = dataAtual.getFullYear();
          
          if (periodo === 'proximo') {
            mes += 1;
            if (mes > 11) {
              mes = 0;
              ano += 1;
            }
          }
          
          // Selecionar o mês e ano na interface
          await configurarPeriodoMes(page, mes, ano);
        } else if (dataInicial && dataFinal) {
          // Configurar período personalizado
          await configurarPeriodoPersonalizado(page, dataInicial, dataFinal);
        }
      }
      
      // Verificar se há dados na tabela antes de extrair
      console.log('Verificando se há dados na tabela antes de extrair...');
      const numRegistros = await page.locator('#grid_RelatorioAnimais tbody tr').count();
      console.log(`Encontrados ${numRegistros} registros na tabela`);
      
      // Aguardar um momento para garantir que a tabela está completamente carregada
      await page.waitForTimeout(2000);
      
      console.log('Extraindo dados de animais...');
      const animais: AnimalCompleto[] = await page.evaluate(() => {
        const dados: any[] = [];
        
        // Encontrar a tabela de animais
        const tabela = document.querySelector('#grid_RelatorioAnimais');
        
        if (!tabela) {
          console.error('Tabela de animais não encontrada');
          return dados;
        }
        
        // Processar as linhas da tabela
        const linhas = Array.from(tabela.querySelectorAll('tbody tr'));
        console.log(`Total de linhas encontradas: ${linhas.length}`);
        
        // Se não houver linhas, verificar se há alguma mensagem de "nenhum registro encontrado"
        if (linhas.length === 0) {
          console.warn('Nenhuma linha encontrada na tabela');
          const mensagemVazia = document.querySelector('.datagrid .no-records');
          if (mensagemVazia) {
            console.warn(`Mensagem encontrada: ${mensagemVazia.textContent?.trim()}`);
          }
          return dados;
        }
        
        for (const linha of linhas) {
          try {
            // Obter o ID da linha para debug
            const linhaId = linha.getAttribute('id') || 'sem-id';
            console.log(`Processando linha: ${linhaId}`);
            
            const colunas = Array.from(linha.querySelectorAll('td'));
            console.log(`Linha ${linhaId}: ${colunas.length} colunas encontradas`);
            
            if (colunas.length < 10) {
              console.warn(`Linha ${linhaId} com número insuficiente de colunas: ${colunas.length}`);
              continue;
            }
            
            // Extrair dados do animal
            const animalLink = colunas[1]?.querySelector('a');
            const animalNome = animalLink?.textContent?.trim() || '';
            const animalHref = animalLink?.getAttribute('href') || '';
            const codigoAnimalMatch = animalHref.match(/cod_animal=(\d+)/);
            const codigoAnimal = codigoAnimalMatch ? codigoAnimalMatch[1] : '';
            console.log(`Animal: ${animalNome} (ID: ${codigoAnimal})`);
            
            // Extrair espécie e raça
            const especieRaca = colunas[2]?.textContent?.trim() || '';
            let especie = '', raca = '';
            
            if (especieRaca.includes('/')) {
              const partes = especieRaca.split('/');
              especie = partes[0].trim();
              raca = partes.slice(1).join('/').trim();
            } else {
              especie = especieRaca;
            }
            console.log(`Espécie: ${especie}, Raça: ${raca}`);
            
            // Extrair sexo
            const sexo = colunas[3]?.textContent?.trim() || '';
            console.log(`Sexo: ${sexo}`);
            
            // Extrair idade
            const idade = colunas[4]?.textContent?.trim() || '';
            console.log(`Idade: ${idade}`);
            
            // Extrair data de cadastro
            const dataCadastro = colunas[5]?.textContent?.trim() || '';
            console.log(`Data de cadastro: ${dataCadastro}`);
            
            // Extrair peso
            const peso = colunas[6]?.textContent?.trim() || '';
            console.log(`Peso: ${peso}`);
            
            // Extrair data do peso
            const dataPeso = colunas[7]?.textContent?.trim() || '';
            console.log(`Data do peso: ${dataPeso}`);
            
            // Extrair dados do tutor
            const tutorLink = colunas[8]?.querySelector('a');
            const tutorNome = tutorLink?.textContent?.trim() || '';
            const tutorHref = tutorLink?.getAttribute('href') || '';
            const codigoTutorMatch = tutorHref.match(/cod_cliente=(\d+)/);
            const codigoTutor = codigoTutorMatch ? codigoTutorMatch[1] : '';
            console.log(`Tutor: ${tutorNome} (ID: ${codigoTutor})`);
            
            // Extrair telefone
            const telefone = colunas[9]?.textContent?.trim() || '';
            console.log(`Telefone: ${telefone}`);
            
            // Extrair dados do botão de WhatsApp
            const whatsappBtn = colunas[10]?.querySelector('.btn-whatsapp');
            const whatsappOnClick = whatsappBtn?.getAttribute('onclick') || '';
            let dadosWhatsapp = null;
            let whatsappNumero = '';
            let porte = '';
            let dataNascimento = '';
            let dataNascimentoFormatada = '';
            let dataObito = null;
            let dataObitoFormatada = null;
            let esterilizado = false;
            let pelagem = '';
            let statusCadastro = '';
            let codigoInternacao = null;
            
            if (whatsappOnClick) {
              // Extrair o JSON do onclick
              const jsonMatch = whatsappOnClick.match(/MensagemWhatsapp\.viewMessages\('animais,clientes',\s*'(.+?)'\)/);
              if (jsonMatch && jsonMatch[1]) {
                try {
                  // Substituir aspas simples escapadas por aspas duplas para criar um JSON válido
                  const jsonStr = jsonMatch[1].replace(/\\'/g, "'").replace(/'/g, '"');
                  dadosWhatsapp = JSON.parse(jsonStr);
                  whatsappNumero = dadosWhatsapp.whatsapp_to || '';
                  
                  // Extrair dados adicionais do botão WhatsApp
                  porte = dadosWhatsapp.des_porte || '';
                  dataNascimento = dadosWhatsapp.dat_nascimento || '';
                  dataNascimentoFormatada = dadosWhatsapp.dat_nascimento_f || '';
                  dataObito = dadosWhatsapp.dat_obito;
                  dataObitoFormatada = dadosWhatsapp.dat_obito_f;
                  esterilizado = dadosWhatsapp.is_esterilizado === '1';
                  pelagem = dadosWhatsapp.nom_pelagem || '';
                  statusCadastro = dadosWhatsapp.sit_cadastro_animal || '';
                  codigoInternacao = dadosWhatsapp.cod_internacao;
                } catch (e) {
                  console.error('Erro ao fazer parse dos dados de WhatsApp:', e);
                }
              }
            }
            
            // Adicionar o animal à lista de dados
            dados.push({
              id: codigoAnimal,
              nome: animalNome,
              especie: especie,
              raca: raca,
              sexo: sexo,
              idade: idade,
              data_cadastro: dataCadastro,
              peso: peso,
              data_peso: dataPeso,
              porte: porte,
              data_nascimento: dataNascimento,
              data_nascimento_formatada: dataNascimentoFormatada,
              data_obito: dataObito,
              data_obito_formatada: dataObitoFormatada,
              esterilizado: esterilizado,
              pelagem: pelagem,
              status_cadastro: statusCadastro,
              codigo_internacao: codigoInternacao,
              tutor: {
                id: codigoTutor,
                nome: tutorNome,
                whatsapp: whatsappNumero || telefone.replace(/[^0-9]/g, ''),
                telefone: telefone,
                dados_whatsapp: dadosWhatsapp
              }
            });
          } catch (error) {
            console.error('Erro ao processar linha:', error);
          }
        }
        
        return dados;
      });
      
      console.log(`Extraídos ${animais.length} animais`);
      
      // Converter para CSV
      const csvHeader = [
        'ID', 'Nome', 'Espécie', 'Raça', 'Sexo', 'Idade', 'Data Cadastro', 
        'Peso', 'Data Peso', 'Porte', 'Data Nascimento', 'Data Óbito', 
        'Esterilizado', 'Pelagem', 'Status Cadastro', 'Tutor ID', 'Tutor Nome', 'Telefone'
      ].join(';');
      
      const csvRows = animais.map(animal => {
        return [
          animal.id,
          animal.nome,
          animal.especie,
          animal.raca,
          animal.sexo,
          animal.idade,
          animal.data_cadastro,
          animal.peso,
          animal.data_peso,
          animal.porte,
          animal.data_nascimento_formatada,
          animal.data_obito_formatada || '',
          animal.esterilizado ? 'Sim' : 'Não',
          animal.pelagem,
          animal.status_cadastro,
          animal.tutor.id,
          animal.tutor.nome,
          animal.tutor.telefone
        ].map(value => `"${value}"`).join(';');
      });
      
      const csvContent = [csvHeader, ...csvRows].join('\n');
      
      return {
        success: true,
        data: animais,
        csv: csvContent,
        total: animais.length,
        error: undefined
      };
    }, 300000); // Aguardar até 5 minutos pelo bloqueio
    
    if (result.success) {
      // Configurar cabeçalhos para download do CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_animais_${formatDate(new Date())}.csv`);
      res.send(result.csv);
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Erro ao gerar CSV'
      });
    }
  } catch (error: any) {
    console.error('Erro durante a exportação para CSV:', error);
    
    // Se ocorrer um erro, tenta resetar a sessão para a próxima tentativa
    await resetSession();
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
  
  // Retorno explícito para satisfazer o TypeScript
  return;
});

// Função para formatar data para nome de arquivo
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}_${month}_${year}`;
}

// Função para configurar período personalizado
async function configurarPeriodoPersonalizado(page: any, dataInicial: string, dataFinal: string): Promise<void> {
  try {
    console.log(`Configurando período personalizado de ${dataInicial} a ${dataFinal}`);
    
    // Converter as datas para o formato esperado (DD/MM/YYYY)
    const [diaInicial, mesInicial, anoInicial] = dataInicial.split('/').map(Number);
    const [diaFinal, mesFinal, anoFinal] = dataFinal.split('/').map(Number);
    
    // Ajustar índices de mês (0-11 para JavaScript)
    const mesInicialIndex = mesInicial - 1;
    const mesFinalIndex = mesFinal - 1;
    
    // Clicar no campo de data para abrir o seletor
    console.log('Clicando no campo de data para abrir o seletor...');
    await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
    await page.waitForTimeout(2000);
    
    // Verificar se o DateRangePicker está aberto
    const dateRangePickerVisible = await page.locator('.daterangepicker').isVisible();
    if (!dateRangePickerVisible) {
      console.warn('DateRangePicker não está visível após clicar no campo de data');
      // Tentar clicar novamente
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
      await page.waitForTimeout(2000);
    }
    
    // Selecionar "Escolher período" nas opções pré-definidas
    console.log('Selecionando "Escolher período"...');
    await page.locator('.ranges li[data-range-key="Escolher período"]').click();
    await page.waitForTimeout(2000);
    
    // Configurar data inicial (calendário esquerdo)
    console.log(`Configurando data inicial: ${diaInicial}/${mesInicial}/${anoInicial}`);
    
    // Verificar se precisamos mudar o ano
    const anoAtualEsquerdo = await page.locator('.drp-calendar.left .yearselect').evaluate((el: HTMLSelectElement) => el.value);
    if (anoAtualEsquerdo != anoInicial.toString()) {
      console.log(`Alterando ano de ${anoAtualEsquerdo} para ${anoInicial} no calendário esquerdo`);
      await page.locator('.drp-calendar.left .yearselect').selectOption(anoInicial.toString());
      await page.waitForTimeout(1000);
    }
    
    // Verificar se precisamos mudar o mês
    const mesAtualEsquerdo = await page.locator('.drp-calendar.left .monthselect').evaluate((el: HTMLSelectElement) => el.value);
    if (mesAtualEsquerdo != mesInicialIndex.toString()) {
      console.log(`Alterando mês de ${parseInt(mesAtualEsquerdo) + 1} para ${mesInicial} no calendário esquerdo`);
      await page.locator('.drp-calendar.left .monthselect').selectOption(mesInicialIndex.toString());
      await page.waitForTimeout(1000);
    }
    
    // Selecionar o dia inicial
    console.log(`Selecionando dia ${diaInicial} no calendário esquerdo`);
    const diasEsquerdo = await page.locator('.drp-calendar.left td.available:not(.off)');
    const diasEsquerdoCount = await diasEsquerdo.count();
    
    let diaInicialEncontrado = false;
    for (let i = 0; i < diasEsquerdoCount; i++) {
      const texto = await diasEsquerdo.nth(i).textContent();
      if (texto && texto.trim() === diaInicial.toString()) {
        await diasEsquerdo.nth(i).click();
        diaInicialEncontrado = true;
        break;
      }
    }
    
    if (!diaInicialEncontrado) {
      console.warn(`Dia ${diaInicial} não encontrado no calendário esquerdo, selecionando o primeiro dia disponível`);
      await diasEsquerdo.first().click();
    }
    
    await page.waitForTimeout(1000);
    
    // Configurar data final (calendário direito)
    console.log(`Configurando data final: ${diaFinal}/${mesFinal}/${anoFinal}`);
    
    // Verificar se precisamos mudar o ano
    const anoAtualDireito = await page.locator('.drp-calendar.right .yearselect').evaluate((el: HTMLSelectElement) => el.value);
    if (anoAtualDireito != anoFinal.toString()) {
      console.log(`Alterando ano de ${anoAtualDireito} para ${anoFinal} no calendário direito`);
      await page.locator('.drp-calendar.right .yearselect').selectOption(anoFinal.toString());
      await page.waitForTimeout(1000);
    }
    
    // Verificar se precisamos mudar o mês
    const mesAtualDireito = await page.locator('.drp-calendar.right .monthselect').evaluate((el: HTMLSelectElement) => el.value);
    if (mesAtualDireito != mesFinalIndex.toString()) {
      console.log(`Alterando mês de ${parseInt(mesAtualDireito) + 1} para ${mesFinal} no calendário direito`);
      await page.locator('.drp-calendar.right .monthselect').selectOption(mesFinalIndex.toString());
      await page.waitForTimeout(1000);
    }
    
    // Selecionar o dia final
    console.log(`Selecionando dia ${diaFinal} no calendário direito`);
    const diasDireito = await page.locator('.drp-calendar.right td.available:not(.off)');
    const diasDireitoCount = await diasDireito.count();
    
    let diaFinalEncontrado = false;
    for (let i = 0; i < diasDireitoCount; i++) {
      const texto = await diasDireito.nth(i).textContent();
      if (texto && texto.trim() === diaFinal.toString()) {
        await diasDireito.nth(i).click();
        diaFinalEncontrado = true;
        break;
      }
    }
    
    if (!diaFinalEncontrado) {
      console.warn(`Dia ${diaFinal} não encontrado no calendário direito, selecionando o último dia disponível`);
      await diasDireito.nth(diasDireitoCount - 1).click();
    }
    
    await page.waitForTimeout(1000);
    
    // Clicar no botão Aplicar
    console.log('Clicando no botão Aplicar...');
    const applyBtn = page.locator('.applyBtn');
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.waitForTimeout(2000);
    }
    
    // Verificar se o calendário fechou
    const calendarClosed = !(await page.locator('.daterangepicker').isVisible());
    console.log(`Calendário fechou após selecionar período: ${calendarClosed}`);
    
    // Clicar no botão Filtrar para aplicar o filtro
    console.log('Clicando no botão Filtrar...');
    try {
      // Tentar com o seletor mais específico primeiro
      const filtrarBtn = page.locator('button.btn-primary').filter({ hasText: 'Filtrar' });
      if (await filtrarBtn.count() > 0) {
        await filtrarBtn.click();
      } else {
        // Tentar com o seletor por atributo
        await page.locator('button.btn-primary[data-original-title="Aplicar Filtros"]').click({ timeout: 5000 });
      }
    } catch (e) {
      console.log('Tentando seletor alternativo para o botão Filtrar...');
      try {
        // Tentar com o seletor por texto
        await page.getByRole('button', { name: 'Filtrar' }).click({ timeout: 5000 });
      } catch (e2) {
        console.log('Tentando seletor genérico para o botão Filtrar...');
        // Tentar com um seletor mais genérico
        await page.locator('button.btn-primary').first().click({ timeout: 5000 });
      }
    }
    
    // Aguardar o carregamento dos dados
    console.log('Aguardando carregamento dos dados após filtrar...');
    await page.waitForTimeout(10000); // Aumentar para 10 segundos
    
    // Verificar se há overlay de carregamento e aguardar que desapareça
    const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
    if (hasLoadingOverlay) {
      console.log('Detectado overlay de carregamento, aguardando finalizar...');
      await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 30000 }).catch((e: Error) => {
        console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
      });
    }
    
    console.log(`Período personalizado configurado com sucesso de ${dataInicial} a ${dataFinal}`);
  } catch (error) {
    console.error('Erro ao configurar período personalizado:', error);
    throw error;
  }
}

export default router;
