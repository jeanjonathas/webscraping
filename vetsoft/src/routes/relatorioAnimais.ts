import { Router } from 'express';
import { ensureLoggedIn, resetSession } from '../utils/browserSession';
import { configurarPeriodoPersonalizado, clicarBotaoFiltrar, selecionarPeriodoHoje } from '../utils/dateRangePicker';
import path from 'path';
import relatorioAnimaisCsvRouter, { navegarParaRelatorioAnimais as navegarParaRelatorioAnimaisFunc } from './relatorioAnimaisCSV';
import { releaseLock } from '../utils/requestSemaphore';

// A função obterIndiceMes foi movida para o arquivo utils/dateRangePicker.ts

const router = Router();

// Registrar a rota de exportação CSV como sub-rota
router.use('/exportar-csv', relatorioAnimaisCsvRouter);

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



// Função auxiliar para navegar para a página de relatório de animais após login
export async function navegarParaRelatorioAnimais(page: any): Promise<any> {
  try {
    console.log('Navegando para a página de relatório de animais...');
    
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
  
  console.log(`Rota /relatorio-animais foi chamada com período: ${periodo}`);
  console.log(`Parâmetros: showBrowser=${showBrowser}, forceRefresh=${forceRefresh}`);
  
  try {
    // IMPORTANTE: Primeiro fazer login diretamente
    // A função ensureLoggedIn já usa withLockWait internamente
    console.log('Obtendo página com login...');
    // Armazenar o ID da operação de login para liberar o semáforo depois
    const loginOperationId = `login-${Date.now()}`;
    const page = await ensureLoggedIn(headless, true); // keepLock=true para manter o semáforo após o login
    
    console.log('Login concluído, iniciando navegação para relatório de animais...');
    
    // Usar a função auxiliar para navegar para a página de relatório de animais
    await navegarParaRelatorioAnimaisFunc(page);
    console.log('Navegação concluída com sucesso, página carregada.');
    
    // Configurar o período de consulta
    if (periodo !== 'todos') {
      console.log(`Configurando período: ${periodo}`);
      
      if (periodo === 'hoje') {
        // Usar a nova função para selecionar o período "Hoje" diretamente
        console.log('Usando seleção direta para o período "Hoje"');
        await selecionarPeriodoHoje(page);
      } else {
        // Para outros períodos, usar o fluxo normal
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
          // Esta função não está importada, então precisamos implementar a lógica aqui
          // Navegação para o mês/ano desejado
          console.log(`Configurando calendário para mês ${mes} e ano ${ano}`);
          
          // Implementar lógica de navegação do calendário aqui
          // ...
          
        } else if (dataInicial && dataFinal) {
          // Configurar período personalizado usando o seletor específico da página
          await configurarPeriodoPersonalizado(page, dataInicial, dataFinal, "input[role='textbox'][name='Data Cadastro']");
        }
        
        // Clicar no botão Filtrar após configurar o período
        await clicarBotaoFiltrar(page);
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
            // Integrar os dados do WhatsApp diretamente nos objetos animal e tutor
            const tutorWhatsapp = whatsappNumero || telefone.replace(/[^0-9]/g, '');
            
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
              // Adicionar outros campos do WhatsApp que são relevantes para o animal
              data_inativacao_formatada: dadosWhatsapp?.dat_inativacao_f || null,
              tutor: {
                id: codigoTutor,
                nome: tutorNome,
                whatsapp: tutorWhatsapp,
                telefone: telefone
                // Não incluir o objeto dados_whatsapp separado
              }
            });
          } catch (error) {
            console.error('Erro ao processar linha:', error);
          }
        }
        
        return dados;
      });
      
      console.log(`Extraídos ${animais.length} animais`);
      
      // Liberar o semáforo explicitamente após concluir a operação
      console.log(`=== LIBERANDO SEMÁFORO EXPLICITAMENTE === Operação "${loginOperationId}" está finalizando e vai liberar o semáforo`);
      releaseLock(loginOperationId);
      
      // Fechar o navegador se não estiver em modo de visualização
      if (!showBrowser) {
        console.log('Fechando o navegador após concluir a operação...');
        await resetSession();
      } else {
        console.log('Navegador mantido aberto devido ao parâmetro showBrowser=true');
      }
      
      // Retornar os dados extraídos
      return res.json({
        success: true,
        data: animais,
        total: animais.length
      });
    
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

// Nota: A função configurarPeriodoMes foi removida daqui e agora é importada do módulo dateRangePicker.ts

// Rota para servir a página HTML de exportação de relatório
router.get('/exportar', (_req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'exportar-relatorio-animais.html');
  res.sendFile(filePath);
});

// Rota para exportar dados em CSV


export default router;
