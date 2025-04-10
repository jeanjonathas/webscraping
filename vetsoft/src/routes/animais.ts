import { Router } from 'express';
import { chromium } from 'playwright';
import { config } from '../config';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const router = Router();

// Configuração do Supabase com schema específico
const supabase = createClient(
  config.supabase.url,
  config.supabase.key,
  {
    db: {
      schema: 'dranimal'
    }
  }
);

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
                
                // Verificar diretamente se contém informações de óbito
                if (onclickAttr.includes('dat_obito')) {
                  console.log('Atributo onclick contém informações de óbito');
                  
                  // Extrair data de óbito diretamente com regex
                  const dataObitoMatch = onclickAttr.match(/dat_obito\\':\\'([^']+)\\'/);
                  if (dataObitoMatch && dataObitoMatch[1] && dataObitoMatch[1] !== 'null') {
                    dataObito = dataObitoMatch[1];
                    console.log('Data de óbito extraída com regex:', dataObito);
                  }
                  
                  // Tentar extrair data de óbito formatada
                  const dataObitoFMatch = onclickAttr.match(/dat_obito_f\\':\\'([^']+)\\'/);
                  if (dataObitoFMatch && dataObitoFMatch[1] && dataObitoFMatch[1] !== 'null') {
                    dataObito = dataObitoFMatch[1];
                    console.log('Data de óbito formatada extraída com regex:', dataObito);
                  }
                }
                
                // Verificar diretamente se contém informações de internação
                if (onclickAttr.includes('cod_internacao')) {
                  console.log('Atributo onclick contém informações de internação');
                  
                  // Extrair código de internação diretamente com regex
                  const codInternacaoMatch = onclickAttr.match(/cod_internacao\\':\\'([^']+)\\'/);
                  if (codInternacaoMatch && codInternacaoMatch[1] && codInternacaoMatch[1] !== 'null') {
                    codigoInternacao = codInternacaoMatch[1];
                    console.log('Código de internação extraído com regex:', codigoInternacao);
                  }
                }
                
                // Tentar extrair o código do animal se ainda não tiver
                if (!codigoAnimal && onclickAttr.includes('cod_animal')) {
                  const codAnimalMatch = onclickAttr.match(/cod_animal\\':\\'([^']+)\\'/);
                  if (codAnimalMatch && codAnimalMatch[1]) {
                    codigoAnimal = codAnimalMatch[1];
                    console.log('Código do animal extraído com regex:', codigoAnimal);
                  }
                }
                
                // Método alternativo: tentar extrair o JSON completo
                try {
                  const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\([^,]+,\s*'(.+?)'\)/);
                  if (jsonMatch && jsonMatch[1]) {
                    // Tentar extrair os dados diretamente do texto JSON sem fazer parse
                    console.log('Texto JSON encontrado:', jsonMatch[1]);
                    
                    // Se ainda não tiver encontrado a data de óbito, tentar novamente
                    if (!dataObito && jsonMatch[1].includes('dat_obito')) {
                      const match = jsonMatch[1].match(/dat_obito_f\':\\'([^']+)\\'/);
                      if (match && match[1] && match[1] !== 'null') {
                        dataObito = match[1];
                        console.log('Data de óbito extraída do texto JSON:', dataObito);
                      }
                    }
                  }
                } catch (e) {
                  console.log('Erro ao processar o texto JSON:', e);
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
                tutor_codigo: codigoTutor,
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
            
            // Verificar diretamente se contém informações de óbito
            if (onclickAttr.includes('dat_obito')) {
              console.log('Atributo onclick contém informações de óbito');
              
              // Extrair data de óbito diretamente com regex
              const dataObitoMatch = onclickAttr.match(/dat_obito\\':\\'([^']+)\\'/);
              if (dataObitoMatch && dataObitoMatch[1] && dataObitoMatch[1] !== 'null') {
                dataObito = dataObitoMatch[1];
                console.log('Data de óbito extraída com regex:', dataObito);
              }
              
              // Tentar extrair data de óbito formatada
              const dataObitoFMatch = onclickAttr.match(/dat_obito_f\\':\\'([^']+)\\'/);
              if (dataObitoFMatch && dataObitoFMatch[1] && dataObitoFMatch[1] !== 'null') {
                dataObito = dataObitoFMatch[1];
                console.log('Data de óbito formatada extraída com regex:', dataObito);
              }
            }
            
            // Verificar diretamente se contém informações de internação
            if (onclickAttr.includes('cod_internacao')) {
              console.log('Atributo onclick contém informações de internação');
              
              // Extrair código de internação diretamente com regex
              const codInternacaoMatch = onclickAttr.match(/cod_internacao\\':\\'([^']+)\\'/);
              if (codInternacaoMatch && codInternacaoMatch[1] && codInternacaoMatch[1] !== 'null') {
                codigoInternacao = codInternacaoMatch[1];
                console.log('Código de internação extraído com regex:', codigoInternacao);
              }
            }
            
            // Tentar extrair o código do animal se ainda não tiver
            if (!codigoAnimal && onclickAttr.includes('cod_animal')) {
              const codAnimalMatch = onclickAttr.match(/cod_animal\\':\\'([^']+)\\'/);
              if (codAnimalMatch && codAnimalMatch[1]) {
                codigoAnimal = codAnimalMatch[1];
                console.log('Código do animal extraído com regex:', codigoAnimal);
              }
            }
            
            // Método alternativo: tentar extrair o JSON completo
            try {
              const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\([^,]+,\s*'(.+?)'\)/);
              if (jsonMatch && jsonMatch[1]) {
                // Tentar extrair os dados diretamente do texto JSON sem fazer parse
                console.log('Texto JSON encontrado:', jsonMatch[1]);
                
                // Se ainda não tiver encontrado a data de óbito, tentar novamente
                if (!dataObito && jsonMatch[1].includes('dat_obito')) {
                  const match = jsonMatch[1].match(/dat_obito_f\':\\'([^']+)\\'/);
                  if (match && match[1] && match[1] !== 'null') {
                    dataObito = match[1];
                    console.log('Data de óbito extraída do texto JSON:', dataObito);
                  }
                }
              }
            } catch (e) {
              console.log('Erro ao processar o texto JSON:', e);
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
            tutor_codigo: codigoTutor,
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

// Rota para exportar animais para Excel
router.get('/exportar/:ano', async (req, res) => {
  try {
    const ano = req.params.ano;
    
    console.log(`Exportando animais do ano ${ano} para Excel`);
    
    // Buscar os dados dos animais
    const browser = await chromium.launch({
      headless: false
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
    
    console.log('Login realizado, acessando Relatórios...');
    await page.waitForTimeout(3000);
    await page.getByRole('link', { name: ' Relatórios' }).click();
    
    console.log('Acessando relatório de animais...');
    await page.waitForTimeout(2000);
    await page.getByRole('link', { name: 'Animais' }).click();
    
    // Implementar a lógica de extração dos animais
    try {
      // Abrir o selecionador de datas
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
      await page.waitForTimeout(1000);
      
      try {
        // Vamos obter o mês e ano atuais para calcular quantos meses precisamos voltar
        const mesAnoAtual = await page.locator('.drp-calendar.left .month').textContent();
        console.log(`Mês e ano atuais: ${mesAnoAtual}`);
        
        // Navegar até dezembro do ano desejado
        // Primeiro, ir para janeiro do ano desejado
        while (true) {
          const mesAnoTexto = await page.locator('.drp-calendar.left .month').textContent();
          console.log(`Mês e ano atual no calendário: ${mesAnoTexto}`);
          
          if (!mesAnoTexto) {
            console.log('Não foi possível obter o mês e ano atual');
            break;
          }
          
          // Verificar se já estamos em janeiro do ano desejado
          if (mesAnoTexto.includes('Janeiro') && mesAnoTexto.includes(ano)) {
            console.log(`Chegamos em Janeiro de ${ano}`);
            break;
          }
          
          // Se estamos em um mês do ano desejado ou posterior, voltar um mês
          if ((mesAnoTexto.includes(ano) && !mesAnoTexto.includes('Janeiro')) || 
              parseInt(mesAnoTexto.split(' ')[1]) > parseInt(ano)) {
            console.log('Clicando no botão de mês anterior...');
            await page.locator('.drp-calendar.left .prev.available').click();
            await page.waitForTimeout(500);
          } else {
            // Se estamos em um ano anterior, avançar um mês
            console.log('Clicando no botão de próximo mês...');
            await page.locator('.drp-calendar.left .next.available').click();
            await page.waitForTimeout(500);
          }
        }
        
        // Agora, ir para dezembro do ano desejado
        for (let i = 0; i < 11; i++) {
          console.log(`Avançando para o próximo mês (${i+2}/12)...`);
          await page.locator('.drp-calendar.right .next.available').click();
          await page.waitForTimeout(500);
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
      await browser.close();
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
                
                // Verificar diretamente se contém informações de óbito
                if (onclickAttr.includes('dat_obito')) {
                  console.log('Atributo onclick contém informações de óbito');
                  
                  // Extrair data de óbito diretamente com regex
                  const dataObitoMatch = onclickAttr.match(/dat_obito\\':\\'([^']+)\\'/);
                  if (dataObitoMatch && dataObitoMatch[1] && dataObitoMatch[1] !== 'null') {
                    dataObito = dataObitoMatch[1];
                    console.log('Data de óbito extraída com regex:', dataObito);
                  }
                  
                  // Tentar extrair data de óbito formatada
                  const dataObitoFMatch = onclickAttr.match(/dat_obito_f\\':\\'([^']+)\\'/);
                  if (dataObitoFMatch && dataObitoFMatch[1] && dataObitoFMatch[1] !== 'null') {
                    dataObito = dataObitoFMatch[1];
                    console.log('Data de óbito formatada extraída com regex:', dataObito);
                  }
                }
                
                // Verificar diretamente se contém informações de internação
                if (onclickAttr.includes('cod_internacao')) {
                  console.log('Atributo onclick contém informações de internação');
                  
                  // Extrair código de internação diretamente com regex
                  const codInternacaoMatch = onclickAttr.match(/cod_internacao\\':\\'([^']+)\\'/);
                  if (codInternacaoMatch && codInternacaoMatch[1] && codInternacaoMatch[1] !== 'null') {
                    codigoInternacao = codInternacaoMatch[1];
                    console.log('Código de internação extraído com regex:', codigoInternacao);
                  }
                }
                
                // Tentar extrair o código do animal se ainda não tiver
                if (!codigoAnimal && onclickAttr.includes('cod_animal')) {
                  const codAnimalMatch = onclickAttr.match(/cod_animal\\':\\'([^']+)\\'/);
                  if (codAnimalMatch && codAnimalMatch[1]) {
                    codigoAnimal = codAnimalMatch[1];
                    console.log('Código do animal extraído com regex:', codigoAnimal);
                  }
                }
                
                // Método alternativo: tentar extrair o JSON completo
                try {
                  const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\([^,]+,\s*'(.+?)'\)/);
                  if (jsonMatch && jsonMatch[1]) {
                    // Tentar extrair os dados diretamente do texto JSON sem fazer parse
                    console.log('Texto JSON encontrado:', jsonMatch[1]);
                    
                    // Se ainda não tiver encontrado a data de óbito, tentar novamente
                    if (!dataObito && jsonMatch[1].includes('dat_obito')) {
                      const match = jsonMatch[1].match(/dat_obito_f\':\\'([^']+)\\'/);
                      if (match && match[1] && match[1] !== 'null') {
                        dataObito = match[1];
                        console.log('Data de óbito extraída do texto JSON:', dataObito);
                      }
                    }
                  }
                } catch (e) {
                  console.log('Erro ao processar o texto JSON:', e);
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
                tutor_codigo: codigoTutor,
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
            
            // Verificar diretamente se contém informações de óbito
            if (onclickAttr.includes('dat_obito')) {
              console.log('Atributo onclick contém informações de óbito');
              
              // Extrair data de óbito diretamente com regex
              const dataObitoMatch = onclickAttr.match(/dat_obito\\':\\'([^']+)\\'/);
              if (dataObitoMatch && dataObitoMatch[1] && dataObitoMatch[1] !== 'null') {
                dataObito = dataObitoMatch[1];
                console.log('Data de óbito extraída com regex:', dataObito);
              }
              
              // Tentar extrair data de óbito formatada
              const dataObitoFMatch = onclickAttr.match(/dat_obito_f\\':\\'([^']+)\\'/);
              if (dataObitoFMatch && dataObitoFMatch[1] && dataObitoFMatch[1] !== 'null') {
                dataObito = dataObitoFMatch[1];
                console.log('Data de óbito formatada extraída com regex:', dataObito);
              }
            }
            
            // Verificar diretamente se contém informações de internação
            if (onclickAttr.includes('cod_internacao')) {
              console.log('Atributo onclick contém informações de internação');
              
              // Extrair código de internação diretamente com regex
              const codInternacaoMatch = onclickAttr.match(/cod_internacao\\':\\'([^']+)\\'/);
              if (codInternacaoMatch && codInternacaoMatch[1] && codInternacaoMatch[1] !== 'null') {
                codigoInternacao = codInternacaoMatch[1];
                console.log('Código de internação extraído com regex:', codigoInternacao);
              }
            }
            
            // Tentar extrair o código do animal se ainda não tiver
            if (!codigoAnimal && onclickAttr.includes('cod_animal')) {
              const codAnimalMatch = onclickAttr.match(/cod_animal\\':\\'([^']+)\\'/);
              if (codAnimalMatch && codAnimalMatch[1]) {
                codigoAnimal = codAnimalMatch[1];
                console.log('Código do animal extraído com regex:', codigoAnimal);
              }
            }
            
            // Método alternativo: tentar extrair o JSON completo
            try {
              const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\([^,]+,\s*'(.+?)'\)/);
              if (jsonMatch && jsonMatch[1]) {
                // Tentar extrair os dados diretamente do texto JSON sem fazer parse
                console.log('Texto JSON encontrado:', jsonMatch[1]);
                
                // Se ainda não tiver encontrado a data de óbito, tentar novamente
                if (!dataObito && jsonMatch[1].includes('dat_obito')) {
                  const match = jsonMatch[1].match(/dat_obito_f\':\\'([^']+)\\'/);
                  if (match && match[1] && match[1] !== 'null') {
                    dataObito = match[1];
                    console.log('Data de óbito extraída do texto JSON:', dataObito);
                  }
                }
              }
            } catch (e) {
              console.log('Erro ao processar o texto JSON:', e);
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
            tutor_codigo: codigoTutor,
            tutor_nome: nomeTutor,
            codigo_internacao: codigoInternacao
          });
        }
      }
      
      return dados;
    });
    
    console.log(`Extraídos ${animais.length} animais`);
    
    // Criar planilha Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(animais);
    
    // Adicionar planilha ao workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, `Animais ${ano}`);
    
    // Configurar cabeçalho para download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=animais_${ano}.xlsx`);
    
    // Enviar o arquivo Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    await browser.close();
    
    return res.send(excelBuffer);
    
  } catch (error: any) {
    console.error('Erro durante a exportação:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

// Rota para salvar animais no banco de dados
router.post('/salvar', async (req, res) => {
  try {
    const { animais } = req.body;
    
    if (!animais || !Array.isArray(animais) || animais.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'É necessário enviar um array de animais para salvar'
      });
    }
    
    console.log(`Recebidos ${animais.length} animais para salvar no banco de dados`);
    
    const resultados = [];
    const erros = [];
    
    // Processar cada animal
    for (const animal of animais) {
      try {
        // Verificar se o cliente existe
        const { data: clienteExistente, error: erroCliente } = await supabase
          .from('clientes')
          .select('id')
          .eq('codigo', animal.tutor_codigo)
          .single();
        
        if (erroCliente) {
          console.error(`Erro ao buscar cliente ${animal.tutor_codigo}:`, erroCliente);
          erros.push({
            animal: animal.codigo,
            erro: `Cliente não encontrado: ${erroCliente.message}`
          });
          continue;
        }
        
        if (!clienteExistente) {
          console.error(`Cliente com código ${animal.tutor_codigo} não encontrado`);
          erros.push({
            animal: animal.codigo,
            erro: `Cliente com código ${animal.tutor_codigo} não encontrado`
          });
          continue;
        }
        
        // Verificar se o animal já existe
        const { data: animalExistente, error: erroAnimalExistente } = await supabase
          .from('animais')
          .select('id')
          .eq('codigo', animal.codigo)
          .single();
        
        if (erroAnimalExistente && erroAnimalExistente.code !== 'PGRST116') {
          console.error(`Erro ao verificar animal ${animal.codigo}:`, erroAnimalExistente);
          erros.push({
            animal: animal.codigo,
            erro: `Erro ao verificar animal: ${erroAnimalExistente.message}`
          });
          continue;
        }
        
        // Preparar dados do animal
        const dadosAnimal = {
          codigo: animal.codigo,
          nome: animal.nome,
          especie: animal.especie,
          raca: animal.raca,
          sexo: animal.sexo,
          data_nascimento: null as string | null, // Será calculado abaixo
          data_obito: animal.data_obito ? new Date(animal.data_obito).toISOString() : null,
          data_cadastro: new Date(animal.data_cadastro).toISOString(),
          cliente_id: clienteExistente.id,
          situacao: animal.data_obito ? 'Óbito' : 'Ativo'
        };
        
        // Tentar calcular a data de nascimento a partir da idade
        try {
          if (animal.data_nascimento) {
            const idadeTexto = animal.data_nascimento;
            if (idadeTexto.includes('anos')) {
              const anos = parseInt(idadeTexto.split('anos')[0].trim());
              const dataAtual = new Date();
              const dataNascimento = new Date();
              dataNascimento.setFullYear(dataAtual.getFullYear() - anos);
              dadosAnimal.data_nascimento = dataNascimento.toISOString();
            } else if (idadeTexto.includes('meses')) {
              const meses = parseInt(idadeTexto.split('meses')[0].trim());
              const dataAtual = new Date();
              const dataNascimento = new Date();
              dataNascimento.setMonth(dataAtual.getMonth() - meses);
              dadosAnimal.data_nascimento = dataNascimento.toISOString();
            }
          }
        } catch (erroDataNascimento) {
          console.error(`Erro ao calcular data de nascimento para ${animal.codigo}:`, erroDataNascimento);
        }
        
        let resultado;
        
        // Inserir ou atualizar o animal
        if (animalExistente) {
          // Atualizar animal existente
          const { data, error } = await supabase
            .from('animais')
            .update(dadosAnimal)
            .eq('codigo', animal.codigo)
            .select();
          
          if (error) {
            console.error(`Erro ao atualizar animal ${animal.codigo}:`, error);
            erros.push({
              animal: animal.codigo,
              erro: `Erro ao atualizar: ${error.message}`
            });
            continue;
          }
          
          resultado = { ...data[0], acao: 'atualizado' };
        } else {
          // Inserir novo animal
          const { data, error } = await supabase
            .from('animais')
            .insert([dadosAnimal])
            .select();
          
          if (error) {
            console.error(`Erro ao inserir animal ${animal.codigo}:`, error);
            erros.push({
              animal: animal.codigo,
              erro: `Erro ao inserir: ${error.message}`
            });
            continue;
          }
          
          resultado = { ...data[0], acao: 'inserido' };
        }
        
        resultados.push(resultado);
        console.log(`Animal ${animal.codigo} ${animalExistente ? 'atualizado' : 'inserido'} com sucesso`);
        
      } catch (erroProcessamento) {
        console.error(`Erro ao processar animal ${animal.codigo}:`, erroProcessamento);
        erros.push({
          animal: animal.codigo,
          erro: `Erro ao processar: ${erroProcessamento.message}`
        });
      }
    }
    
    return res.json({
      success: true,
      total: animais.length,
      processados: resultados.length,
      erros: erros.length,
      resultados,
      detalhesErros: erros
    });
    
  } catch (error: any) {
    console.error('Erro durante o salvamento:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
});

export default router;