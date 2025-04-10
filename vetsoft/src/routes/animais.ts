import { Router } from 'express';
import { chromium } from 'playwright';
import { config } from '../config';

const router = Router();

// Interface para os dados de animais
interface Animal {
  codigo: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  data_nascimento: string;
  data_cadastro: string;
  data_obito: string | null;
  tutor_codigo: string;
  tutor_nome: string;
  codigo_internacao: string | null;
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
        
        try {
          // Tentar clicar no dia 1
          await page.locator('.drp-calendar.left td.available').filter({ hasText: '1' }).first().click();
          console.log('Clicado no dia 1 de janeiro');
        } catch (error) {
          console.log('Erro ao clicar no dia 1, tentando dia 30...');
          try {
            await page.locator('.drp-calendar.left td.available').filter({ hasText: '30' }).first().click();
            console.log('Clicado no dia 30 de dezembro');
          } catch (error) {
            console.log('Erro ao clicar no dia 30, tentando qualquer dia disponível...');
            await page.locator('.drp-calendar.left td.available').first().click();
          }
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
            if (mesAtualDireito && mesAtualDireito.includes('Dez')) {
              console.log('Chegamos em dezembro de 2022');
              break;
            }
          }
        }
        
        // Agora vamos clicar no último dia de dezembro
        console.log('Clicando no último dia de dezembro de 2022...');
        
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
            await page.locator('.drp-calendar.right td.available').last().click();
          }
        }
        
        await page.waitForTimeout(1000);
        
        // Clicar no botão Aplicar para fechar o calendário
        try {
          await page.locator('.applyBtn').click();
          console.log('Clicado no botão Aplicar do calendário');
          await page.waitForTimeout(1000);
        } catch (error) {
          console.log('Erro ao clicar no botão Aplicar do calendário:', error);
        }
        
        // Clicar no botão Filtrar para aplicar o filtro
        console.log('Clicando no botão Filtrar...');
        let filtroAplicado = false;
        
        try {
          await page.getByRole('button', { name: 'Filtrar' }).click();
          console.log('Clicado no botão Filtrar usando getByRole');
          filtroAplicado = true;
        } catch (error) {
          console.log('Erro ao clicar no botão Filtrar usando getByRole:', error);
        }
        
        if (!filtroAplicado) {
          try {
            await page.locator('button.btn.btn-primary[title="Aplicar Filtros"]').click();
            console.log('Clicado no botão Filtrar usando seletor CSS específico');
            filtroAplicado = true;
          } catch (error) {
            console.log('Erro ao clicar no botão Filtrar usando seletor CSS específico:', error);
          }
        }
        
        if (!filtroAplicado) {
          try {
            await page.locator('button:has-text("Filtrar")').click();
            console.log('Clicado no botão Filtrar usando seletor de texto');
            filtroAplicado = true;
          } catch (error) {
            console.log('Erro ao clicar no botão Filtrar usando seletor de texto:', error);
          }
        }
        
        if (!filtroAplicado) {
          try {
            await page.evaluate(() => {
              const botoes = Array.from(document.querySelectorAll('button'));
              const botaoFiltrar = botoes.find(b => 
                b.textContent?.includes('Filtrar') || 
                b.getAttribute('title')?.includes('Aplicar Filtros')
              );
              if (botaoFiltrar) {
                console.log('Botão encontrado via JS:', botaoFiltrar.textContent, botaoFiltrar.getAttribute('title'));
                botaoFiltrar.click();
                return true;
              }
              return false;
            });
            console.log('Tentativa de clicar no botão Filtrar por JavaScript');
            filtroAplicado = true;
          } catch (error) {
            console.log('Erro ao clicar no botão Filtrar por JavaScript:', error);
          }
        }
        
        // Aguardar o carregamento da tabela com tempo maior
        console.log('Aguardando o carregamento da tabela...');
        await page.waitForTimeout(5000);
        
        // Verificar se a tabela foi carregada
        const tabelaVisivel = await page.evaluate(() => {
          const tabela = document.querySelector('#grid_RelatorioAnimais');
          if (tabela) {
            return true;
          }
          
          // Verificar outras tabelas que possam conter os dados
          const todasTabelas = document.querySelectorAll('table');
          return todasTabelas.length > 0;
        });
        
        console.log('Tabela visível:', tabelaVisivel);
        
        // Se a tabela não estiver visível, tentar clicar novamente
        if (!tabelaVisivel) {
          console.log('Tabela não carregada, tentando clicar novamente no botão Filtrar...');
          try {
            // Tentar todas as estratégias novamente
            await page.getByRole('button', { name: 'Filtrar' }).click();
            await page.waitForTimeout(5000);
          } catch (error) {
            console.log('Erro ao clicar novamente no botão Filtrar:', error);
          }
        }
      } catch (error) {
        console.log(`Erro ao tentar ajustar o ano: ${error}`);
      }
      
    } catch (error) {
      console.error('Erro ao selecionar datas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    // Aguardar carregamento da tabela
    console.log('Aguardando tabela carregar...');
    try {
      await page.waitForSelector('#grid_RelatorioAnimais', { timeout: 30000 });
    } catch (error) {
      console.log('Timeout ao esperar pela tabela. Continuando mesmo assim:', error);
    }
    
    await page.waitForTimeout(2000);
    
    // Extrair dados
    console.log('Extraindo dados da tabela...');
    const animais: Animal[] = await page.evaluate(() => {
      const dados: any[] = [];
      
      // Tentar encontrar a tabela pelo ID
      const tabela = document.querySelector('#grid_RelatorioAnimais');
      console.log('Tabela encontrada:', !!tabela);
      
      if (!tabela) {
        console.log('Tabela não encontrada pelo ID, tentando outros seletores...');
        // Tentar encontrar por outros seletores
        const todasTabelas = document.querySelectorAll('table');
        console.log('Total de tabelas na página:', todasTabelas.length);
        
        // Converter NodeList para Array para iterar
        const tabelasArray = Array.from(todasTabelas);
        
        for (const tabela of tabelasArray) {
          // Processar as linhas da tabela
          const linhas = Array.from(tabela.querySelectorAll('tbody tr'));
          console.log('Total de linhas encontradas:', linhas.length);
          
          for (const linha of linhas) {
            const colunas = linha.querySelectorAll('td');
            
            // Vamos logar o conteúdo das colunas para debug
            const conteudoColunas = [];
            for (let i = 0; i < colunas.length; i++) {
              conteudoColunas.push(`Coluna ${i}: ${colunas[i].textContent?.trim()}`);
            }
            console.log('Conteúdo das colunas:', conteudoColunas);
            
            if (colunas.length >= 8) {
              // Extrair código do animal do ID da linha
              const linhaId = linha.getAttribute('id') || '';
              let codigoCliente = "";
              if (linhaId) {
                const match = linhaId.match(/grid_RelatorioAnimais_row(\d+)/);
                if (match && match[1]) {
                  codigoCliente = match[1];
                }
              }
              
              // Extrair dados da tabela
              const animalLink = colunas[1].querySelector('a');
              let codigoAnimal = "";
              let nomeAnimal = "";
              let dataObito = null;
              let codigoInternacao = null;
              
              // Tentar extrair data de óbito e código de internação do botão WhatsApp
              const botaoWhatsapp = colunas[9]?.querySelector('button.btn-whatsapp');
              if (botaoWhatsapp) {
                const onclickAttr = botaoWhatsapp.getAttribute('onclick') || '';
                console.log('Onclick do botão WhatsApp:', onclickAttr);
                
                // Extrair o JSON da string do onclick
                const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\([^,]+,\s*'(.+?)'\)/);
                if (jsonMatch && jsonMatch[1]) {
                  try {
                    // Substituir aspas simples escapadas por aspas duplas para poder fazer o parse
                    const jsonStr = jsonMatch[1].replace(/\\'/g, '"').replace(/'/g, '"');
                    console.log('String JSON processada:', jsonStr);
                    
                    // Fazer parse do JSON
                    const dadosAnimal = JSON.parse(`{${jsonStr}}`);
                    console.log('Dados do animal extraídos:', dadosAnimal);
                    
                    // Extrair data de óbito
                    if (dadosAnimal.dat_obito && dadosAnimal.dat_obito !== 'null') {
                      dataObito = dadosAnimal.dat_obito_f || dadosAnimal.dat_obito;
                      console.log('Data de óbito encontrada:', dataObito);
                    }
                    
                    // Extrair código de internação
                    if (dadosAnimal.cod_internacao && dadosAnimal.cod_internacao !== 'null') {
                      codigoInternacao = dadosAnimal.cod_internacao;
                      console.log('Código de internação encontrado:', codigoInternacao);
                    }
                    
                    // Se não tiver encontrado o código do animal antes, tenta pegar do JSON
                    if (!codigoAnimal && dadosAnimal.cod_animal) {
                      codigoAnimal = dadosAnimal.cod_animal;
                      console.log('Código do animal extraído do JSON:', codigoAnimal);
                    }
                  } catch (e) {
                    console.log('Erro ao fazer parse do JSON do botão WhatsApp:', e);
                    
                    // Tentar extrair manualmente
                    try {
                      const dataObitoMatch = onclickAttr.match(/dat_obito\\':\\\'([^\\]+)\\'/);
                      if (dataObitoMatch && dataObitoMatch[1] && dataObitoMatch[1] !== 'null') {
                        dataObito = dataObitoMatch[1];
                        console.log('Data de óbito extraída manualmente:', dataObito);
                      }
                      
                      const dataObitoFMatch = onclickAttr.match(/dat_obito_f\\':\\\'([^\\]+)\\'/);
                      if (dataObitoFMatch && dataObitoFMatch[1] && dataObitoFMatch[1] !== 'null') {
                        dataObito = dataObitoFMatch[1];
                        console.log('Data de óbito formatada extraída manualmente:', dataObito);
                      }
                      
                      const codInternacaoMatch = onclickAttr.match(/cod_internacao\\':\\\'([^\\]+)\\'/);
                      if (codInternacaoMatch && codInternacaoMatch[1] && codInternacaoMatch[1] !== 'null') {
                        codigoInternacao = codInternacaoMatch[1];
                        console.log('Código de internação extraído manualmente:', codigoInternacao);
                      }
                    } catch (manualError) {
                      console.log('Erro na extração manual:', manualError);
                    }
                  }
                }
              }
              
              if (animalLink) {
                const href = animalLink.getAttribute('href') || '';
                const match = href.match(/cod_animal=(\d+)/);
                if (match && match[1]) {
                  codigoAnimal = match[1];
                }
                nomeAnimal = animalLink.textContent?.trim() || '';
              } else {
                nomeAnimal = colunas[1].textContent?.trim() || '';
              }
              
              // Extrair espécie e raça (separar por /)
              const especieRaca = colunas[2].textContent?.trim() || '';
              let especie = '';
              let raca = '';
              
              if (especieRaca.includes('/')) {
                const partes = especieRaca.split('/');
                especie = partes[0].trim();
                raca = partes.slice(1).join('/').trim();
              } else {
                especie = especieRaca;
              }
              
              // Extrair sexo, idade e data de cadastro
              const sexo = colunas[3].textContent?.trim() || '';
              const idade = colunas[4].textContent?.trim() || '';
              const dataCadastro = colunas[5].textContent?.trim() || '';
              
              // Extrair o código do tutor do link
              const tutorLink = colunas[7].querySelector('a');
              let codigoTutor = "";
              let nomeTutor = "";
              
              if (tutorLink) {
                const href = tutorLink.getAttribute('href') || '';
                const match = href.match(/cod_cliente=(\d+)/);
                if (match && match[1]) {
                  codigoTutor = match[1];
                }
                nomeTutor = tutorLink.textContent?.trim() || '';
              } else {
                nomeTutor = colunas[7].textContent?.trim() || '';
              }
              
              dados.push({
                codigo: codigoAnimal,
                nome: nomeAnimal,
                especie: especie,
                raca: raca,
                sexo: sexo,
                data_nascimento: idade,
                data_cadastro: dataCadastro,
                data_obito: dataObito,
                tutor_codigo: codigoTutor || codigoCliente, // Usar o código do cliente do ID da linha se não encontrar no link
                tutor_nome: nomeTutor,
                codigo_internacao: codigoInternacao
              });
            }
          }
        }
        
        return dados;
      }
      
      // Processar as linhas da tabela
      const linhas = Array.from(tabela.querySelectorAll('tbody tr'));
      console.log('Total de linhas encontradas:', linhas.length);
      
      for (const linha of linhas) {
        // Extrair código do cliente do ID da linha
        const linhaId = linha.getAttribute('id') || '';
        let codigoCliente = "";
        if (linhaId) {
          const match = linhaId.match(/grid_RelatorioAnimais_row(\d+)/);
          if (match && match[1]) {
            codigoCliente = match[1];
          }
        }
        
        const colunas = linha.querySelectorAll('td');
        
        // Vamos logar o conteúdo das colunas para debug
        const conteudoColunas = [];
        for (let i = 0; i < colunas.length; i++) {
          conteudoColunas.push(`Coluna ${i}: ${colunas[i].textContent?.trim()}`);
        }
        console.log('Conteúdo das colunas:', conteudoColunas);
        
        if (colunas.length >= 8) {
          // Extrair dados da tabela
          const animalLink = colunas[1].querySelector('a');
          let codigoAnimal = "";
          let nomeAnimal = "";
          let dataObito = null;
          let codigoInternacao = null;
          
          // Tentar extrair data de óbito e código de internação do botão WhatsApp
          const botaoWhatsapp = colunas[9]?.querySelector('button.btn-whatsapp');
          if (botaoWhatsapp) {
            const onclickAttr = botaoWhatsapp.getAttribute('onclick') || '';
            console.log('Onclick do botão WhatsApp:', onclickAttr);
            
            // Extrair o JSON da string do onclick
            const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\([^,]+,\s*'(.+?)'\)/);
            if (jsonMatch && jsonMatch[1]) {
              try {
                // Substituir aspas simples escapadas por aspas duplas para poder fazer o parse
                const jsonStr = jsonMatch[1].replace(/\\'/g, '"').replace(/'/g, '"');
                console.log('String JSON processada:', jsonStr);
                
                // Fazer parse do JSON
                const dadosAnimal = JSON.parse(`{${jsonStr}}`);
                console.log('Dados do animal extraídos:', dadosAnimal);
                
                // Extrair data de óbito
                if (dadosAnimal.dat_obito && dadosAnimal.dat_obito !== 'null') {
                  dataObito = dadosAnimal.dat_obito_f || dadosAnimal.dat_obito;
                  console.log('Data de óbito encontrada:', dataObito);
                }
                
                // Extrair código de internação
                if (dadosAnimal.cod_internacao && dadosAnimal.cod_internacao !== 'null') {
                  codigoInternacao = dadosAnimal.cod_internacao;
                  console.log('Código de internação encontrado:', codigoInternacao);
                }
                
                // Se não tiver encontrado o código do animal antes, tenta pegar do JSON
                if (!codigoAnimal && dadosAnimal.cod_animal) {
                  codigoAnimal = dadosAnimal.cod_animal;
                  console.log('Código do animal extraído do JSON:', codigoAnimal);
                }
              } catch (e) {
                console.log('Erro ao fazer parse do JSON do botão WhatsApp:', e);
                
                // Tentar extrair manualmente
                try {
                  const dataObitoMatch = onclickAttr.match(/dat_obito\\':\\\'([^\\]+)\\'/);
                  if (dataObitoMatch && dataObitoMatch[1] && dataObitoMatch[1] !== 'null') {
                    dataObito = dataObitoMatch[1];
                    console.log('Data de óbito extraída manualmente:', dataObito);
                  }
                  
                  const dataObitoFMatch = onclickAttr.match(/dat_obito_f\\':\\\'([^\\]+)\\'/);
                  if (dataObitoFMatch && dataObitoFMatch[1] && dataObitoFMatch[1] !== 'null') {
                    dataObito = dataObitoFMatch[1];
                    console.log('Data de óbito formatada extraída manualmente:', dataObito);
                  }
                  
                  const codInternacaoMatch = onclickAttr.match(/cod_internacao\\':\\\'([^\\]+)\\'/);
                  if (codInternacaoMatch && codInternacaoMatch[1] && codInternacaoMatch[1] !== 'null') {
                    codigoInternacao = codInternacaoMatch[1];
                    console.log('Código de internação extraído manualmente:', codigoInternacao);
                  }
                } catch (manualError) {
                  console.log('Erro na extração manual:', manualError);
                }
              }
            }
          }
          
          if (animalLink) {
            const href = animalLink.getAttribute('href') || '';
            const match = href.match(/cod_animal=(\d+)/);
            if (match && match[1]) {
              codigoAnimal = match[1];
            }
            nomeAnimal = animalLink.textContent?.trim() || '';
          } else {
            nomeAnimal = colunas[1].textContent?.trim() || '';
          }
          
          // Extrair espécie e raça (separar por /)
          const especieRaca = colunas[2].textContent?.trim() || '';
          let especie = '';
          let raca = '';
          
          if (especieRaca.includes('/')) {
            const partes = especieRaca.split('/');
            especie = partes[0].trim();
            raca = partes.slice(1).join('/').trim();
          } else {
            especie = especieRaca;
          }
          
          // Extrair sexo, idade e data de cadastro
          const sexo = colunas[3].textContent?.trim() || '';
          const idade = colunas[4].textContent?.trim() || '';
          const dataCadastro = colunas[5].textContent?.trim() || '';
          
          // Extrair o código do tutor do link
          const tutorLink = colunas[7].querySelector('a');
          let codigoTutor = "";
          let nomeTutor = "";
          
          if (tutorLink) {
            const href = tutorLink.getAttribute('href') || '';
            const match = href.match(/cod_cliente=(\d+)/);
            if (match && match[1]) {
              codigoTutor = match[1];
            }
            nomeTutor = tutorLink.textContent?.trim() || '';
          } else {
            nomeTutor = colunas[7].textContent?.trim() || '';
          }
          
          dados.push({
            codigo: codigoAnimal,
            nome: nomeAnimal,
            especie: especie,
            raca: raca,
            sexo: sexo,
            data_nascimento: idade,
            data_cadastro: dataCadastro,
            data_obito: dataObito,
            tutor_codigo: codigoTutor || codigoCliente, // Usar o código do cliente do ID da linha se não encontrar no link
            tutor_nome: nomeTutor,
            codigo_internacao: codigoInternacao
          });
        }
      }
      
      return dados;
    });
    console.log(`Extraídos ${animais.length} animais`);
    
    await browser.close();
    
    // Retornar os dados formatados
    return res.json({
      total: animais.length,
      periodo: `01/01/${ano} a 31/12/${ano}`,
      animais: animais
    });
    
  } catch (error: any) {
    console.error('Erro durante a extração:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

export default router;