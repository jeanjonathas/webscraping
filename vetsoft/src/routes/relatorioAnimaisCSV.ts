import { Router, Request, Response } from 'express';
import { withLockWait } from '../utils/requestSemaphore';
import { resetSession, ensureLoggedIn } from '../utils/browserSession';
import { configurarPeriodoPersonalizado, clicarBotaoFiltrar } from '../utils/dateRangePicker';

// Tipos
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
    dados_whatsapp: any;
  };
}

// Função auxiliar para formatar data para nome de arquivo
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Função auxiliar para navegar para a página de relatório de animais
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
    await page.getByLabel('Visualizar').selectOption('3');
    
    return page;
  } catch (error) {
    console.error('Erro ao navegar para a página de relatório de animais:', error);
    throw error;
  }
}

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
      console.log('DateRangePicker não está visível, tentando clicar novamente...');
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
      await page.waitForTimeout(2000);
    }
    
    // Clicar em "Escolher período"
    await page.getByText('Escolher período').click();
    await page.waitForTimeout(1000);
    
    // Selecionar o mês e ano na interface
    // Obter o mês e ano atual exibido no seletor
    const mesAnoAtual = await page.locator('.month').first().textContent();
    console.log(`Mês/Ano atual no seletor: ${mesAnoAtual}`);
    
    // Converter para o formato esperado (ex: "Janeiro 2023")
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mesAlvo = meses[mes];
    const mesAnoAlvo = `${mesAlvo} ${ano}`;
    console.log(`Mês/Ano alvo: ${mesAnoAlvo}`);
    
    // Navegar até o mês/ano desejado
    while (true) {
      const mesAnoAtual = await page.locator('.month').first().textContent();
      if (mesAnoAtual?.includes(mesAlvo) && mesAnoAtual?.includes(String(ano))) {
        console.log(`Mês/Ano alvo encontrado: ${mesAnoAtual}`);
        break;
      }
      
      // Verificar se precisa avançar ou retroceder
      const anoAtual = parseInt(mesAnoAtual?.split(' ')[1] || '0');
      const mesAtualIndex = meses.findIndex(m => mesAnoAtual?.includes(m));
      
      if (anoAtual < ano || (anoAtual === ano && mesAtualIndex < mes)) {
        // Avançar para o próximo mês
        console.log('Avançando para o próximo mês...');
        await page.locator('.next').click();
      } else {
        // Retroceder para o mês anterior
        console.log('Retrocedendo para o mês anterior...');
        await page.locator('.prev').click();
      }
      
      await page.waitForTimeout(500);
    }
    
    // Selecionar o primeiro dia do mês
    console.log('Selecionando o primeiro dia do mês...');
    await page.locator('.day:not(.disabled)').first().click();
    
    // Selecionar o último dia do mês
    console.log('Selecionando o último dia do mês...');
    await page.locator('.day:not(.disabled)').last().click();
    
    // Clicar no botão Aplicar
    console.log('Clicando no botão Aplicar...');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.waitForTimeout(1000);
    
    // Clicar no botão Filtrar
    await clicarBotaoFiltrar(page);
  } catch (error) {
    console.error('Erro ao configurar período por mês e ano:', error);
    throw error;
  }
}

const router = Router();

// Rota para exportar dados em CSV
router.get('/', async (req: Request, res: Response) => {
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
        
        // Fazer login e manter o semáforo bloqueado durante toda a operação
        console.log(`Iniciando navegação com navegador ${showBrowser ? 'visível' : 'headless'}...`);
        const page = await ensureLoggedIn(showBrowser ? false : true, true); // keepLock=true para manter o semáforo
        
        // Navegar para a página de relatório de animais
        await navegarParaRelatorioAnimais(page);
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
            // Configurar período personalizado usando o seletor específico da página
            await configurarPeriodoPersonalizado(page, dataInicial, dataFinal, "input[role='textbox'][name='Data Cadastro']");
            
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
    } finally {
      // Não precisamos liberar o semáforo manualmente aqui
      // O withLockWait já cuida de liberar o semáforo automaticamente no seu bloco finally
      console.log('Operação concluída');
    }
    
    // Retorno explícito para satisfazer o TypeScript
    return;
  });
  
// Exportar o router
export default router;
