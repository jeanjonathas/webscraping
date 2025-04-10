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
    
    try {
      // Abrir o selecionador de datas
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
      await page.waitForTimeout(1000);
      
      // Clicar em "Escolher período"
      await page.getByText('Escolher período').click();
      await page.waitForTimeout(1000);
      
      // Primeiro, vamos verificar se estamos no ano correto (2022)
      const anoAtual = await page.locator('.drp-calendar.right .month').textContent();
      console.log(`Ano atual no calendário direito: ${anoAtual}`);
      
      try {
        // Vamos obter o mês e ano atuais para calcular quantos meses precisamos voltar
        const mesAnoAtual = await page.locator('.drp-calendar.left .month').textContent();
        console.log(`Mês e ano atuais: ${mesAnoAtual}`);
        
        // Extrair o mês e ano do texto (formato esperado: "mmm YYYY", ex: "abr 2025")
        let mesAtual = 0;
        let anoAtual = 0;
        
        if (mesAnoAtual) {
          const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
          const partes = mesAnoAtual.toLowerCase().split(' ');
          
          if (partes.length >= 2) {
            const mesTxt = partes[0];
            mesAtual = meses.indexOf(mesTxt) + 1; // 1-12
            anoAtual = parseInt(partes[1]);
            
            console.log(`Mês atual: ${mesAtual}, Ano atual: ${anoAtual}`);
          }
        }
        
        // Calcular quantos meses precisamos voltar para chegar a dezembro de 2021
        // Fórmula: (anoAtual - 2021) * 12 + (mesAtual - 12)
        // Exemplo: de abril de 2025 para dezembro de 2021 = (2025 - 2021) * 12 + (4 - 12) = 48 - 8 = 40 meses
        let mesesParaVoltar = 0;
        
        if (anoAtual > 0 && mesAtual > 0) {
          // Calculamos para dezembro de 2021 e subtraímos 1 para parar em janeiro de 2022
          const mesesParaDezembro = (anoAtual - 2021) * 12 + (mesAtual - 12);
          mesesParaVoltar = mesesParaDezembro - 1;
          console.log(`Meses para dezembro de 2021: ${mesesParaDezembro}, subtraindo 1 para janeiro de 2022: ${mesesParaVoltar}`);
        } else {
          // Valor padrão caso não consigamos calcular (40 - 1 = 39)
          mesesParaVoltar = 39;
          console.log(`Não foi possível calcular o número de meses, usando valor padrão: ${mesesParaVoltar}`);
        }
        
        // Vamos voltar clicando na seta esquerda várias vezes até chegar em janeiro de 2022
        console.log('Tentando voltar para janeiro de 2022 clicando na seta esquerda...');
        
        for (let i = 0; i < mesesParaVoltar; i++) {
          await page.locator('.drp-calendar.left .prev.available').click();
          await page.waitForTimeout(200);
          
          // A cada 5 cliques, verificamos o mês atual
          if (i % 5 === 0 || i === mesesParaVoltar - 1) {
            const mesAtualEsquerdo = await page.locator('.drp-calendar.left .month').textContent();
            console.log(`Mês atual após ${i+1} cliques: ${mesAtualEsquerdo}`);
            
            // Se chegamos em janeiro de 2022, podemos parar
            if (mesAtualEsquerdo && mesAtualEsquerdo.toLowerCase().includes('jan 2022')) {
              console.log('Chegamos em janeiro de 2022, parando a navegação');
              break;
            }
          }
        }
        
        // Verificar se estamos em janeiro de 2022
        const mesJaneiro = await page.locator('.drp-calendar.left .month').textContent();
        console.log(`Mês atual: ${mesJaneiro}`);
        
        // Agora vamos clicar no dia 1 de janeiro de 2022
        console.log('Clicando no dia 1 de janeiro de 2022...');
        
        // Primeiro, vamos verificar todas as células com o texto "1"
        const celulasComDia1 = await page.locator('td').filter({ hasText: '1' }).all();
        console.log(`Encontradas ${celulasComDia1.length} células com o texto "1"`);
        
        // Vamos verificar cada célula para encontrar a que corresponde ao dia 1 de janeiro de 2022
        let diaEncontrado = false;
        for (const celula of celulasComDia1) {
          const classes = await celula.getAttribute('class');
          const dataTitle = await celula.getAttribute('data-title');
          console.log(`Célula com dia 1 - classes: ${classes}, data-title: ${dataTitle}`);
          
          // Verificar se a célula é do mês atual (não tem as classes 'off' ou 'old' ou 'new')
          if (classes && !classes.includes('off') && !classes.includes('old') && !classes.includes('new')) {
            console.log(`Encontrado dia 1 com data-title=${dataTitle}, clicando...`);
            await celula.click();
            diaEncontrado = true;
            break;
          }
        }
        
        if (!diaEncontrado) {
          console.log('Não foi possível encontrar o dia 1 de janeiro de 2022 específico, tentando alternativa...');
          await page.locator('.drp-calendar.left td.available').filter({ hasText: '1' }).first().click();
        }
        
        await page.waitForTimeout(500);
        
        // Agora vamos navegar para dezembro de 2022
        console.log('Navegando para dezembro de 2022...');
        
        // São 11 meses para frente (de janeiro a dezembro)
        for (let i = 0; i < 11; i++) {
          await page.locator('.drp-calendar.right .next.available').click();
          await page.waitForTimeout(300);
          
          // A cada 3 cliques, verificamos o mês atual
          if (i % 3 === 0 || i === 10) {
            const mesAtualDireito = await page.locator('.drp-calendar.right .month').textContent();
            console.log(`Mês direito após ${i+1} cliques: ${mesAtualDireito}`);
            
            // Se chegamos em dezembro de 2022, podemos parar
            if (mesAtualDireito && mesAtualDireito.toLowerCase().includes('dez 2022')) {
              console.log('Chegamos em dezembro de 2022, parando a navegação');
              break;
            }
          }
        }
        
        // Agora vamos clicar no dia 31 de dezembro
        console.log('Clicando no dia 31 de dezembro de 2022...');
        
        try {
          // Tentar clicar no dia 31
          await page.locator('.drp-calendar.right td.available').filter({ hasText: '31' }).first().click();
          console.log('Clicado no dia 31 de dezembro');
        } catch (error) {
          console.log('Erro ao clicar no dia 31, tentando dia 30...');
          try {
            await page.locator('.drp-calendar.right td.available').filter({ hasText: '30' }).first().click();
            console.log('Clicado no dia 30 de dezembro');
          } catch (error) {
            console.log('Erro ao clicar no dia 30, tentando qualquer dia disponível...');
            await page.locator('.drp-calendar.right td.available').first().click();
          }
        }
        
      } catch (error) {
        console.log(`Erro ao tentar ajustar o ano: ${error}`);
      }
      
      // Clicar no botão Aplicar se estiver disponível
      try {
        await page.locator('.applyBtn').click();
        console.log('Clicado no botão Aplicar');
      } catch (error) {
        console.log('Botão Aplicar não encontrado ou não clicável');
      }
      
      await page.waitForTimeout(1000);
      
      // Filtrar
      await page.getByRole('button', { name: 'Filtrar' }).click();
      await page.waitForTimeout(2000);
      
    } catch (error) {
      console.error('Erro ao selecionar datas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
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
