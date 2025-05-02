import { Router } from 'express';
import { ensureLoggedIn, resetSession } from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';
import { Page } from 'playwright';

const router = Router();

// Interface para os dados de agendamento de estética
interface AgendamentoEstetica {
  id: string;
  data: string;
  hora_inicio: string;
  hora_termino: string;
  cliente: {
    id: string;
    nome: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    complemento?: string;
    cep?: string;
    em_aberto?: string;
    whatsapp?: string;
  };
  animal: {
    id: string;
    nome: string;
    raca?: string;
    observacoes?: string;
  };
  situacao: string;
  servicos: string[];
  transporte: string;
  recorrencia: {
    tipo: string;
    progresso?: string;
  };
  observacoes?: string;
}

/**
 * Rota para obter agendamentos de estética
 * Parâmetros opcionais:
 * - data: Data específica no formato DD/MM/YYYY
 * - periodo: 'atual' (mês atual) ou 'proximo' (próximo mês) ou 'dd/mm/aaaa-dd/mm/aaaa'
 */
router.get('/', async (req, res) => {
  try {
    const data = req.query.data as string | undefined;
    const periodo = req.query.periodo as string | undefined;
    const show = req.query.show === 'true';
    
    // Validar formato do período se fornecido (dd/mm/aaaa-dd/mm/aaaa)
    let periodoTipo = 'atual'; // valor padrão
    let dataInicio: Date | undefined;
    let dataFim: Date | undefined;
    
    if (periodo) {
      // Verificar se é um dos valores predefinidos
      if (periodo === 'atual' || periodo === 'proximo' || periodo === 'todos') {
        periodoTipo = periodo;
      } 
      // Verificar se é um intervalo de datas
      else if (periodo.match(/^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/)) {
        periodoTipo = 'personalizado';
        const [inicioStr, fimStr] = periodo.split('-');
        
        // Converter strings de data para objetos Date
        const [diaInicio, mesInicio, anoInicio] = inicioStr.split('/').map(Number);
        const [diaFim, mesFim, anoFim] = fimStr.split('/').map(Number);
        
        dataInicio = new Date(anoInicio, mesInicio - 1, diaInicio);
        dataFim = new Date(anoFim, mesFim - 1, diaFim);
      } 
      // Formato inválido
      else {
        return res.status(400).json({ 
          erro: true, 
          mensagem: 'Formato de período inválido. Use "atual", "proximo", "todos" ou o formato "dd/mm/aaaa-dd/mm/aaaa"' 
        });
      }
    }
    
    const operationId = `estetica-agendamentos-${Date.now()}`;
    
    console.log(`Buscando agendamentos de estética. Período: ${periodoTipo}, Data específica: ${data || 'todas'}`);
    
    // Usar o modo headless com base no parâmetro da query
    const headless = !show;
    
    // IMPORTANTE: Obter uma página com login já feito ANTES de adquirir o semáforo principal
    // Isso evita deadlock entre os semáforos
    console.log('Obtendo página com login já feito (antes do semáforo principal)...');
    let page = await ensureLoggedIn(headless);
    
    // Agora usar o sistema de semáforo para garantir acesso exclusivo ao navegador
    console.log(`Adquirindo semáforo para operação de agendamentos de estética...`);
    const result = await withLockWait(operationId, async () => {
      try {
        console.log('Navegando para a página de estética...');
        
        // Função para tentar navegar com retry
        const navigateToEstetica = async (retryCount = 0): Promise<Page> => {
          try {
            // Navegar para a página de estética
            await page.goto('https://dranimal.vetsoft.com.br/m/estetica/', {
              waitUntil: 'networkidle',
              timeout: 30000
            });
            return page;
          } catch (error: any) {
            // Se o erro for relacionado ao navegador fechado e ainda temos tentativas
            if ((error.message.includes('Target page, context or browser has been closed') || 
                error.message.includes('Target closed') ||
                error.message.includes('Browser has been closed')) && 
                retryCount < 3) {
              console.log(`Navegador fechado detectado. Tentando reabrir (tentativa ${retryCount + 1}/3)...`);
              
              // Resetar a sessão e obter uma nova página
              await resetSession();
              const newPage = await ensureLoggedIn(headless);
              page = newPage;
              
              // Tentar novamente com contador incrementado
              return navigateToEstetica(retryCount + 1);
            } else {
              // Se excedeu as tentativas ou é outro tipo de erro, propagar o erro
              throw error;
            }
          }
        };
        
        // Tentar navegar com mecanismo de retry
        const updatedPage = await navigateToEstetica();
        page = updatedPage;
        
        console.log('Página de estética carregada');
        
        // Verificar se há elementos de carregamento visíveis e aguardar que desapareçam
        const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
        if (hasLoadingOverlay) {
          console.log('Detectado overlay de carregamento, aguardando finalizar...');
          await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 10000 }).catch(e => {
            console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
          });
        }
        
        // Extrair agendamentos do mês atual e próximo
        let agendamentosAtual: AgendamentoEstetica[] = [];
        let agendamentosProximo: AgendamentoEstetica[] = [];
        let todosAgendamentos: AgendamentoEstetica[] = [];
        
        // Selecionar o período (Este mês)
        console.log('Selecionando período (Este mês)...');
        await page.locator('#daterange i').nth(2).click();
        await page.getByRole('listitem').filter({ hasText: 'Este mês' }).click();
        
        // Aguardar carregamento após selecionar o período (tempo maior)
        console.log('Aguardando carregamento completo dos dados...');
        await page.waitForTimeout(2000); // Aumentado para 5 segundos
        
        // Verificar se a tabela de agendamentos foi carregada completamente
        const totalLinhasAtual = await page.evaluate(() => {
          return document.querySelectorAll('tr[id^="grid_Agenda_row"]').length;
        });
        console.log(`Total de linhas encontradas na tabela: ${totalLinhasAtual}`);
        
        // Se houver menos de 10 linhas, aguardar mais tempo
        if (totalLinhasAtual < 10) {
          console.log('Poucos agendamentos encontrados, aguardando mais tempo...');
          await page.waitForTimeout(2000); // Aguardar mais 5 segundos
        }
        
        console.log('Extraindo agendamentos do mês atual...');
        agendamentosAtual = await extrairAgendamentosDaTabela(page, headless);
        
        // Exibir log detalhado dos agendamentos do mês atual
        console.log(`Mês atual: Encontrados ${agendamentosAtual.length} agendamentos`);
        const datasAtual = agendamentosAtual.map(a => a.data);
        console.log('Datas encontradas no mês atual:', [...new Set(datasAtual)].sort());
        
        // Sempre extrair o próximo mês também, para ter todos os dados disponíveis para filtragem
        console.log('Navegando para o próximo mês...');
        
        // Função para navegar para o próximo mês com retry
        const navigateToNextMonth = async (retryCount = 0): Promise<void> => {
          try {
            // Clicar no botão para ir para o próximo mês (usando o botão de navegação)
            await page.getByRole('button').filter({ has: page.locator('i.fas.fa-chevron-right') }).click();
            
            // Aguardar carregamento após selecionar o período (tempo maior)
            await page.waitForTimeout(2000);
          } catch (error: any) {
            // Se o erro for relacionado ao navegador fechado e ainda temos tentativas
            if ((error.message.includes('Target page, context or browser has been closed') || 
                error.message.includes('Target closed') ||
                error.message.includes('Browser has been closed')) && 
                retryCount < 3) {
              console.log(`Navegador fechado detectado ao navegar para o próximo mês. Tentando reabrir (tentativa ${retryCount + 1}/3)...`);
              
              // Resetar a sessão e obter uma nova página
              await resetSession();
              const newPage = await ensureLoggedIn(headless);
              page = newPage;
              
              // Navegar novamente para a página de estética
              await navigateToEstetica();
              
              // Tentar navegar para o próximo mês novamente
              return navigateToNextMonth(retryCount + 1);
            } else {
              // Se excedeu as tentativas ou é outro tipo de erro, propagar o erro
              throw error;
            }
          }
        };
        
        // Navegar para o próximo mês com mecanismo de retry
        await navigateToNextMonth();
        
        console.log('Aguardando carregamento completo dos dados do próximo mês...');
        await page.waitForTimeout(2000); // Aumentado para 5 segundos
        
        // Verificar se a tabela de agendamentos foi carregada completamente
        const totalLinhasProximo = await page.evaluate(() => {
          return document.querySelectorAll('tr[id^="grid_Agenda_row"]').length;
        });
        console.log(`Total de linhas encontradas na tabela do próximo mês: ${totalLinhasProximo}`);
        
        // Se houver menos de 10 linhas, aguardar mais tempo
        if (totalLinhasProximo < 10) {
          console.log('Poucos agendamentos encontrados no próximo mês, aguardando mais tempo...');
          await page.waitForTimeout(2000); // Aguardar mais 5 segundos
        }
        
        console.log('Extraindo agendamentos do próximo mês...');
        agendamentosProximo = await extrairAgendamentosDaTabela(page, headless);
        
        // Exibir log detalhado dos agendamentos do próximo mês
        console.log(`Próximo mês: Encontrados ${agendamentosProximo.length} agendamentos`);
        const datasProximo = agendamentosProximo.map(a => a.data);
        console.log('Datas encontradas no próximo mês:', [...new Set(datasProximo)].sort());
        
        // Normalizar as datas de todos os agendamentos antes de combinar
        console.log('Normalizando datas dos agendamentos...');
        
        // Normalizar datas do mês atual
        agendamentosAtual = agendamentosAtual.map(agendamento => {
          // Adicionar o ano atual às datas no formato abreviado (DD/MM)
          if (agendamento.data.split('/').length === 2) {
            const anoAtual = new Date().getFullYear();
            agendamento.data = `${agendamento.data}/${anoAtual}`;
            console.log(`Data normalizada: ${agendamento.data}`);
          }
          return agendamento;
        });
        
        // Normalizar datas do próximo mês
        agendamentosProximo = agendamentosProximo.map(agendamento => {
          // Adicionar o ano atual às datas no formato abreviado (DD/MM)
          if (agendamento.data.split('/').length === 2) {
            const anoAtual = new Date().getFullYear();
            agendamento.data = `${agendamento.data}/${anoAtual}`;
            console.log(`Data normalizada: ${agendamento.data}`);
          }
          return agendamento;
        });
        
        // Combinar todos os agendamentos para filtragem posterior
        todosAgendamentos = [...agendamentosAtual, ...agendamentosProximo];
        
        // Exibir log dos agendamentos combinados
        console.log(`Total combinado após normalização: ${todosAgendamentos.length} agendamentos`);
        const datasTodos = todosAgendamentos.map(a => a.data);
        console.log('Todas as datas normalizadas:', [...new Set(datasTodos)].sort());
        
        // Filtrar conforme o período selecionado
        if (periodoTipo === 'atual') {
          todosAgendamentos = agendamentosAtual;
        } else if (periodoTipo === 'proximo') {
          todosAgendamentos = agendamentosProximo;
        }
        // Para 'todos', mantém todos os agendamentos combinados
        
        // Filtrar por período personalizado se necessário
        if (periodoTipo === 'personalizado' && dataInicio && dataFim) {
          console.log(`Filtrando agendamentos no período personalizado: ${dataInicio.toLocaleDateString()} a ${dataFim.toLocaleDateString()}`);
          
          todosAgendamentos = todosAgendamentos.filter(agendamento => {
            // Converter a data do agendamento para objeto Date
            const dataAgendamento = converterDataParaDate(agendamento.data);
            
            // Se a data não puder ser convertida, não incluir no resultado
            if (!dataAgendamento) return false;
            
            // Verificar se está dentro do intervalo
            return dataAgendamento >= dataInicio! && dataAgendamento <= dataFim!;
          });
          
          // Exibir log após a filtragem por período personalizado
          console.log(`Após filtragem por período personalizado: ${todosAgendamentos.length} agendamentos`);
          const datasAposFiltragem = todosAgendamentos.map(a => a.data);
          console.log('Datas após filtragem:', [...new Set(datasAposFiltragem)].sort());
        }
        
        // Navegar de volta para o dashboard após extrair os dados
        try {
          console.log('Navegando para o dashboard após extrair dados...');
          await page.goto('https://dranimal.vetsoft.com.br/m/dashboard/', { 
            waitUntil: 'networkidle',
            timeout: 10000 // 10 segundos de timeout
          });
        } catch (navError) {
          console.warn('Erro ao navegar para o dashboard:', navError);
          // Não é um erro crítico, podemos continuar
        }
        
        // Preparar descrição do período para a resposta
        let periodoDescricao = 'Mês atual';
        if (periodoTipo === 'proximo') periodoDescricao = 'Próximo mês';
        else if (periodoTipo === 'todos') periodoDescricao = 'Mês atual e próximo';
        else if (periodoTipo === 'personalizado') {
          periodoDescricao = `${dataInicio!.toLocaleDateString('pt-BR')} a ${dataFim!.toLocaleDateString('pt-BR')}`;
        }
        
        return {
          success: true,
          periodo: periodoDescricao,
          data_filtro: data || 'todas',
          total: todosAgendamentos.length,
          agendamentos: todosAgendamentos
        };
      } catch (error: any) {
        console.error('Erro ao extrair agendamentos de estética:', error);
        
        // Verificar se o erro está relacionado ao navegador fechado
        if (error.message.includes('Target page, context or browser has been closed') || 
            error.message.includes('Target closed') ||
            error.message.includes('Browser has been closed')) {
          console.log('Erro de navegador fechado detectado. Resetando sessão para futuras requisições...');
          
          // Resetar a sessão para que futuras requisições possam funcionar
          try {
            await resetSession();
          } catch (resetError) {
            console.error('Erro ao resetar sessão:', resetError);
          }
        }
        
        return {
          success: false,
          error: `Erro ao extrair agendamentos: ${error.message}`,
          tipo_erro: error.message.includes('Target page, context or browser has been closed') ? 'navegador_fechado' : 'outro'
        };
      }
    }, 180000); // 3 minutos de timeout
    
    if (!result) {
      return res.status(503).json({
        success: false,
        error: 'Não foi possível adquirir o semáforo para esta operação. Tente novamente mais tarde.'
      });
    }
    
    return res.json(result);
  } catch (error: any) {
    console.error('Erro na rota de agendamentos de estética:', error);
    
    return res.status(500).json({
      success: false,
      error: `Erro ao processar requisição: ${error.message}`
    });
  }
});

/**
 * Função auxiliar para converter uma string de data no formato DD/MM/YYYY ou DD/MM para um objeto Date
 */
const converterDataParaDate = (dataStr: string): Date | null => {
  try {
    const partes = dataStr.split('/');
    
    // Verificar o formato da data
    if (partes.length < 2) {
      console.error(`Formato de data inválido: ${dataStr}`);
      return null;
    }
    
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    
    // Se a data estiver no formato abreviado (DD/MM), usar o ano atual
    let ano = new Date().getFullYear();
    if (partes.length > 2 && partes[2].length > 0) {
      ano = parseInt(partes[2], 10);
    }
    
    console.log(`Convertendo data: ${dataStr} para ${dia}/${mes}/${ano}`);
    
    // Mês em JavaScript é 0-indexed (0-11)
    return new Date(ano, mes - 1, dia);
  } catch (error) {
    console.error(`Erro ao converter data ${dataStr}:`, error);
    return null;
  }
}

/**
 * Função auxiliar para extrair os agendamentos da tabela com retry
 * Extrai todos os agendamentos da página atual e implementa mecanismo de retry em caso de falha
 */
async function extrairAgendamentosDaTabela(page: Page, headless: boolean = false, retryCount = 0): Promise<AgendamentoEstetica[]> {
  try {
    // Extrair todos os agendamentos da tabela
    return await page.evaluate(() => {
    const listaAgendamentos: AgendamentoEstetica[] = [];
    
    // Selecionar todas as linhas da tabela de agendamentos
    const linhas = document.querySelectorAll('tr[id^="grid_Agenda_row"]');
    
    linhas.forEach((linha) => {
      try {
        // Extrair ID do agendamento
        const id = linha.id.replace('grid_Agenda_row', '');
        
        // Extrair situação
        const situacaoElement = linha.querySelector('.label');
        const situacao = situacaoElement ? situacaoElement.textContent?.trim() || '' : '';
        
        // Extrair data e horários
        const horarioElement = linha.querySelector('td:nth-child(2)');
        const horarioText = horarioElement ? horarioElement.textContent?.trim() || '' : '';
        let data = '';
        let hora_inicio = '';
        
        // Extrair data e hora de início do texto (formato: "Hoje 09:00" ou "02/05/2025 09:00")
        if (horarioText.includes('Hoje')) {
          const hoje = new Date();
          data = `${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`;
          hora_inicio = horarioText.replace('Hoje', '').trim();
        } else if (horarioText.includes('Amanhã')) {
          const amanha = new Date();
          amanha.setDate(amanha.getDate() + 1);
          data = `${amanha.getDate().toString().padStart(2, '0')}/${(amanha.getMonth() + 1).toString().padStart(2, '0')}/${amanha.getFullYear()}`;
          hora_inicio = horarioText.replace('Amanhã', '').trim();
        } else {
          const partes = horarioText.split(' ');
          if (partes.length >= 2) {
            data = partes[0];
            hora_inicio = partes[1];
          }
        }
        
        // Não filtramos mais por data aqui, todos os agendamentos são extraídos
        
        // Extrair hora de término
        const terminoElement = linha.querySelector('td:nth-child(3)');
        const hora_termino = terminoElement ? terminoElement.textContent?.trim() || '' : '';
        
        // Extrair informações do animal e cliente
        const animalElement = linha.querySelector('td:nth-child(4) a.ficha-cliente[href*="animais"]');
        const animalNome = animalElement ? animalElement.textContent?.trim() || '' : '';
        
        // Extrair raça do animal (texto após o nome do animal e antes do <br>)
        let raca = '';
        const tdContent = linha.querySelector('td:nth-child(4)')?.innerHTML || '';
        const racaRegex = new RegExp(`<b>${animalNome}</b></a>\\s*([^<]+)\\s*<br>`);
        const racaMatch = tdContent.match(racaRegex);
        if (racaMatch && racaMatch[1]) {
          raca = racaMatch[1].trim();
        }
        
        // Extrair ID do animal da URL
        const animalUrl = animalElement?.getAttribute('href') || '';
        const animalIdMatch = animalUrl.match(/cod_animal=(\d+)/);
        const animalId = animalIdMatch ? animalIdMatch[1] : '';
        
        // Extrair cliente
        const clienteElement = linha.querySelector('td:nth-child(4) small a.ficha-cliente[href*="clientes"]');
        const clienteNome = clienteElement ? clienteElement.textContent?.trim() || '' : '';
        
        // Extrair ID do cliente da URL
        const clienteUrl = clienteElement?.getAttribute('href') || '';
        const clienteIdMatch = clienteUrl.match(/cod_cliente=(\d+)/);
        const clienteId = clienteIdMatch ? clienteIdMatch[1] : '';
        
        // Extrair tipo de transporte
        const transporteElement = linha.querySelector('td.icones-transporte i');
        const transporteTitle = transporteElement?.getAttribute('data-original-title') || '';
        const transporte = transporteTitle || 'Não especificado';
        
        // Extrair serviços
        const servicosElements = linha.querySelectorAll('td.icones-servicos i');
        const servicos = Array.from(servicosElements).map(el => el.getAttribute('data-original-title') || '').filter(Boolean);
        
        // Extrair recorrência
        const recorrenciaElement = linha.querySelector('td.icones-recorrencia .recorrencia');
        let tipoRecorrencia = 'AVULSO';
        let progressoRecorrencia = '';
        
        // Extrair tipo de recorrência (Quinzenalmente, Semanalmente, etc.)
        const labelPeriodicidade = recorrenciaElement?.querySelector('.label-periodicidade:not(.avulso)');
        if (labelPeriodicidade) {
          // Obter o título completo (Quinzenalmente, Semanalmente, etc.)
          tipoRecorrencia = labelPeriodicidade.getAttribute('data-original-title') || 
                           labelPeriodicidade.getAttribute('title') || 'Não especificado';
          
          // Extrair progresso (1/12, 5/12, etc.)
          const labelProgresso = recorrenciaElement?.querySelector('.label-periodicidade.avulso');
          progressoRecorrencia = labelProgresso ? labelProgresso.textContent?.trim() || '' : '';
        }
        
        // Extrair dados adicionais do botão do WhatsApp
        const whatsappButton = linha.querySelector('button.btn-whatsapp');
        const onclickAttr = whatsappButton?.getAttribute('onclick') || '';
        
        // Extrair o JSON dos dados do cliente/animal do atributo onclick
        let dadosAdicionais: any = {};
        if (onclickAttr) {
          const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\('estetica',\s*'(.+?)'\)/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              // Substituir aspas simples escapadas por aspas duplas para criar um JSON válido
              const jsonStr = jsonMatch[1]
                .replace(/\\'/g, '"')
                .replace(/'/g, '"');
              
              dadosAdicionais = JSON.parse(jsonStr);
            } catch (e) {
              console.error('Erro ao parsear JSON dos dados adicionais:', e);
            }
          }
        }
        
        // Criar objeto do agendamento com todos os dados extraídos
        const agendamento: AgendamentoEstetica = {
          id,
          data,
          hora_inicio,
          hora_termino,
          cliente: {
            id: clienteId,
            nome: clienteNome,
            endereco: dadosAdicionais.des_endereco || '',
            numero: dadosAdicionais.num_endereco || '',
            bairro: dadosAdicionais.nom_bairro || '',
            complemento: dadosAdicionais.des_complemento || '',
            cep: dadosAdicionais.num_cep || '',
            em_aberto: dadosAdicionais.em_aberto || '',
            whatsapp: dadosAdicionais.whatsapp_to || ''
          },
          animal: {
            id: animalId,
            nome: animalNome,
            raca,
            observacoes: dadosAdicionais.json_adicional_animal?.estetica?.obs_estetica || ''
          },
          situacao,
          servicos,
          transporte,
          recorrencia: {
            tipo: tipoRecorrencia,
            progresso: progressoRecorrencia
          }
        };
        
        listaAgendamentos.push(agendamento);
      } catch (error) {
        console.error('Erro ao processar linha de agendamento:', error);
      }
    });
    
    return listaAgendamentos;
  });
  } catch (error: any) {
    // Se o erro for relacionado ao navegador fechado e ainda temos tentativas
    if ((error.message.includes('Target page, context or browser has been closed') || 
        error.message.includes('Target closed') ||
        error.message.includes('Browser has been closed')) && 
        retryCount < 3) {
      console.log(`Navegador fechado detectado ao extrair agendamentos. Tentando reabrir (tentativa ${retryCount + 1}/3)...`);
      
      // Resetar a sessão e obter uma nova página
      await resetSession();
      const newPage = await ensureLoggedIn(headless);
      
      // Navegar novamente para a página de estética
      await newPage.goto('https://dranimal.vetsoft.com.br/m/estetica/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // Aguardar carregamento
      await newPage.waitForTimeout(2000);
      
      // Tentar extrair novamente
      return extrairAgendamentosDaTabela(newPage, headless, retryCount + 1);
    } else {
      // Se excedeu as tentativas ou é outro tipo de erro, propagar o erro
      throw error;
    }
  }
}

export default router;
