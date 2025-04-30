import { Router } from 'express';
import { 
  navigateToInternacao, 
  resetSession,
  ensureLoggedIn
} from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';

const router = Router();

// Interface para os dados de internação
interface Internacao {
  animal: {
    id: string;
    nome: string;
    especie: string;
    raca: string;
    sexo: string;
    peso?: string;
    idade?: string;
  };
  tutor: {
    id: string;
    nome: string;
  };
  alojamento: string;
  situacao: string;
  dias_internado: string;
  codigo_internacao: string;
  tipo_internacao: string;
}

// Rota para obter todas as internações
router.get('/', async (req, res) => {
  const operationId = `internacao-${Date.now()}`;
  
  try {
    console.log('Iniciando extração de dados de internação...');
    
    // Usar o modo headless com base no parâmetro da query
    const showBrowser = req.query.show === 'true';
    const headless = !showBrowser;
    
    // IMPORTANTE: Obter uma página com login já feito ANTES de adquirir o semáforo principal
    // Isso evita deadlock entre os semáforos
    console.log('Obtendo página com login já feito (antes do semáforo principal)...');
    const loggedInPage = await ensureLoggedIn(headless);
    
    // Agora usar o sistema de semáforo para garantir acesso exclusivo ao navegador
    // para a operação de extração de dados de internação
    console.log('Adquirindo semáforo para operação de internação...');
    const result = await withLockWait(operationId, async () => {
      try {
        // Navegar para a página de internação
        console.log('Navegando para a página de internação...');
        await loggedInPage.goto('https://dranimal.vetsoft.com.br/m/internacoes/', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        console.log('Extraindo dados de internações...');
        const internacoes: Internacao[] = await loggedInPage.evaluate(() => {
          // Selecionar todos os itens de internação, excluindo os alojamentos vazios
          const itens = Array.from(document.querySelectorAll('.lista-internacoes .item'))
            .filter(item => {
              // Verificar se o item NÃO contém um elemento com a classe 'alojamento-livre'
              return !item.querySelector('.alojamento-livre');
            });
          
          console.log(`Encontrados ${itens.length} itens de internação ocupados`);
          
          return itens.map(item => {
            // Extrair dados do alojamento
            const alojamentoElement = item.querySelector('.alojamento-ocupado');
            const alojamento = alojamentoElement ? alojamentoElement.textContent?.trim() || '' : '';
            
            // Extrair tipo de internação (Emergência, Normal, etc.)
            const tipoInternacao = alojamentoElement?.getAttribute('data-original-title') || '';
            
            // Extrair situação (baseada na cor ou outro atributo)
            const bgColor = alojamentoElement?.getAttribute('style')?.match(/background-color:(#[a-f0-9]+)/i)?.[1] || '';
            const situacao = bgColor === '#b30e21' ? 'Crítico' : 'Normal';
            
            // Extrair dados do animal
            const animalLinkElement = item.querySelector('.media-heading a');
            const animalNome = animalLinkElement ? animalLinkElement.textContent?.trim() || '' : '';
            
            // Extrair ID do animal da URL
            const animalLink = animalLinkElement?.getAttribute('href') || '';
            const animalIdMatch = animalLink.match(/cod_animal=(\d+)/);
            const animalId = animalIdMatch ? animalIdMatch[1] : '';
            
            // Extrair informações de espécie, raça e sexo
            const animalInfoElement = item.querySelector('.media-heading + p');
            const animalInfoText = animalInfoElement ? animalInfoElement.textContent?.trim() || '' : '';
            
            // Dividir o texto para extrair espécie, raça e sexo
            const animalInfoParts = animalInfoText.split(',').map(part => part.trim());
            const especie = animalInfoParts[0] || '';
            const raca = animalInfoParts.length > 1 ? animalInfoParts[1] : '';
            const sexo = animalInfoParts.length > 2 ? animalInfoParts[2] : '';
            
            // Extrair peso se disponível
            const pesoElement = item.querySelector('.link-peso');
            const peso = pesoElement ? pesoElement.textContent?.trim() || '' : '';
            
            // Extrair dados do tutor
            const tutorElement = item.querySelector('.nome-tutor a');
            const tutorNome = tutorElement ? tutorElement.textContent?.trim() || '' : '';
            
            // Extrair ID do tutor da URL
            const tutorLink = tutorElement?.getAttribute('href') || '';
            const tutorIdMatch = tutorLink.match(/cod_cliente=(\d+)/);
            const tutorId = tutorIdMatch ? tutorIdMatch[1] : '';
            
            // Extrair dias internado
            const diasInternadoElement = item.querySelector('.dias-internado span');
            const diasInternado = diasInternadoElement ? diasInternadoElement.textContent?.trim() || '0' : '0';
            
            // Extrair código de internação da URL da ficha
            const fichaInternacaoElement = item.querySelector('.btn-ficha-animal');
            const fichaInternacaoLink = fichaInternacaoElement?.getAttribute('href') || '';
            const codigoInternacaoMatch = fichaInternacaoLink.match(/cod_internacao=(\d+)/);
            const codigoInternacao = codigoInternacaoMatch ? codigoInternacaoMatch[1] : '';
            
            return {
              animal: {
                id: animalId,
                nome: animalNome,
                especie: especie,
                raca: raca,
                sexo: sexo,
                peso: peso,
                idade: '' // Idade não está disponível diretamente na interface
              },
              tutor: {
                id: tutorId,
                nome: tutorNome
              },
              alojamento: alojamento,
              situacao: situacao,
              dias_internado: diasInternado,
              codigo_internacao: codigoInternacao,
              tipo_internacao: tipoInternacao
            };
          });
        });
        
        console.log(`Foram encontradas ${internacoes.length} internações ativas`);
        
        // Exibir detalhes de cada internação no console para debug
        internacoes.forEach((internacao, index) => {
          console.log(`\nInternação #${index + 1}:`);
          console.log(`Animal: ${internacao.animal.nome} (ID: ${internacao.animal.id})`);
          console.log(`Espécie: ${internacao.animal.especie}, Raça: ${internacao.animal.raca}`);
          console.log(`Tutor: ${internacao.tutor.nome} (ID: ${internacao.tutor.id})`);
          console.log(`Alojamento: ${internacao.alojamento}`);
          console.log(`Tipo de Internação: ${internacao.tipo_internacao}`);
          console.log(`Situação: ${internacao.situacao}`);
          console.log(`Dias Internado: ${internacao.dias_internado}`);
          console.log(`Código de Internação: ${internacao.codigo_internacao}`);
        });
        
        // Após extrair os dados, navegar para o dashboard para evitar que outras requisições
        // assumam que já estão na página correta
        try {
          console.log('Navegando para o dashboard após extrair dados de internação...');
          await loggedInPage.goto('https://dranimal.vetsoft.com.br/m/dashboard/', { 
            waitUntil: 'networkidle',
            timeout: 10000 // 10 segundos de timeout
          });
          console.log('Navegação para o dashboard concluída');
        } catch (navError) {
          console.warn('Aviso: Não foi possível navegar para o dashboard após extrair dados:', navError);
          // Não falhar a requisição se a navegação para o dashboard falhar
        }
        
        // Filtrar por situação se especificado
        if (req.query.situacao) {
          const situacaoFiltro = req.query.situacao as string;
          console.log(`Filtrando internações por situação: ${situacaoFiltro}`);
          
          const internacoesFiltradas = internacoes.filter(
            i => i.situacao.toLowerCase().includes(situacaoFiltro.toLowerCase())
          );
          
          return {
            success: true,
            data: internacoesFiltradas,
            total: internacoesFiltradas.length
          };
        }
        
        return {
          success: true,
          data: internacoes,
          total: internacoes.length
        };
      } catch (error) {
        console.error('Erro durante a extração de dados de internação:', error);
        throw error;
      }
    }, 120000); // Aguardar até 2 minutos pelo bloqueio
    
    return res.json(result);
    
  } catch (error: any) {
    console.error('Erro ao extrair dados de internação:', error);
    
    // Se ocorrer um erro, tenta resetar a sessão para a próxima tentativa
    await resetSession();
    
    // Verificar se o erro é relacionado ao limite de tentativas
    if (error.message && (
        error.message.includes('Falha no login após') || 
        error.message.includes('Falha na navegação após') ||
        error.message.includes('tentativas excedido') ||
        error.message.includes('Timeout ao aguardar o bloqueio')
    )) {
      return res.status(503).json({
        success: false,
        error: 'Limite de tentativas excedido. Serviço temporariamente indisponível.',
        details: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Erro ao extrair dados de internação',
      details: error.message
    });
  }
});

// Rota para obter detalhes de uma internação específica
router.get('/:id', async (req, res) => {
  const animalId = req.params.id;
  
  if (!animalId) {
    return res.status(400).json({
      success: false,
      error: 'ID do animal não fornecido'
    });
  }
  
  try {
    console.log(`Buscando detalhes da internação do animal: ${animalId}`);
    
    // Usar o modo headless com base no parâmetro da query
    const showBrowser = req.query.show === 'true';
    const headless = !showBrowser;
    
    // Obter página já logada e navegada para a página de internação
    const page = await navigateToInternacao(headless);
    
    // Encontrar e clicar na ficha do animal específico
    const fichaSelector = `.btn-ficha-animal[href*="cod_animal=${animalId}"]`;
    console.log(`Procurando ficha do animal com seletor: ${fichaSelector}`);
    
    // Verificar se o elemento existe
    const fichaExists = await page.$(fichaSelector);
    if (!fichaExists) {
      console.log(`Animal com ID ${animalId} não encontrado na lista de internações`);
      return res.status(404).json({
        success: false,
        error: `Animal com ID ${animalId} não encontrado na lista de internações`
      });
    }
    
    // Clicar na ficha do animal
    console.log('Ficha encontrada, clicando para abrir detalhes...');
    await page.click(fichaSelector);
    await page.waitForLoadState('networkidle');
    console.log('Página de detalhes carregada');
    
    // Extrair detalhes completos da ficha de internação
    console.log('Extraindo detalhes da ficha de internação...');
    const detalhesInternacao = await page.evaluate(() => {
      // Extrair dados básicos do animal
      const animalNome = document.querySelector('.nome-animal')?.textContent?.trim() || '';
      const animalInfos = document.querySelector('.infos-animal')?.textContent?.trim() || '';
      
      // Extrair informações de espécie, raça, sexo, etc.
      const infosParts = animalInfos.split(',').map(part => part.trim());
      const especie = infosParts[0] || '';
      const raca = infosParts.length > 1 ? infosParts[1] : '';
      const sexo = infosParts.length > 2 ? infosParts[2] : '';
      
      // Extrair dados do tutor
      const tutorNome = document.querySelector('.nome-tutor')?.textContent?.trim() || '';
      const tutorLink = document.querySelector('.nome-tutor a')?.getAttribute('href') || '';
      const tutorIdMatch = tutorLink.match(/cod_cliente=(\d+)/);
      const tutorId = tutorIdMatch ? tutorIdMatch[1] : '';
      
      // Extrair dados da internação
      const dataEntrada = document.querySelector('.data-entrada')?.textContent?.trim() || '';
      const motivoInternacao = document.querySelector('.motivo-internacao')?.textContent?.trim() || '';
      const situacao = document.querySelector('.situacao-internacao')?.textContent?.trim() || '';
      
      // Extrair código de internação da URL
      const codigoInternacaoMatch = window.location.href.match(/cod_internacao=(\d+)/);
      const codigoInternacao = codigoInternacaoMatch ? codigoInternacaoMatch[1] : '';
      
      // Extrair medicamentos prescritos
      const medicamentos = Array.from(document.querySelectorAll('.medicamentos tbody tr')).map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          nome: cells[0]?.textContent?.trim() || '',
          dosagem: cells[1]?.textContent?.trim() || '',
          frequencia: cells[2]?.textContent?.trim() || '',
          observacao: cells[3]?.textContent?.trim() || ''
        };
      });
      
      // Extrair procedimentos realizados
      const procedimentos = Array.from(document.querySelectorAll('.procedimentos tbody tr')).map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          nome: cells[0]?.textContent?.trim() || '',
          data: cells[1]?.textContent?.trim() || '',
          responsavel: cells[2]?.textContent?.trim() || '',
          observacao: cells[3]?.textContent?.trim() || ''
        };
      });
      
      // Extrair exames clínicos
      const exames = Array.from(document.querySelectorAll('.exames-clinicos tbody tr')).map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          data: cells[0]?.textContent?.trim() || '',
          temperatura: cells[1]?.textContent?.trim() || '',
          frequencia_cardiaca: cells[2]?.textContent?.trim() || '',
          frequencia_respiratoria: cells[3]?.textContent?.trim() || '',
          responsavel: cells[4]?.textContent?.trim() || ''
        };
      });
      
      return {
        animal: {
          nome: animalNome,
          especie: especie,
          raca: raca,
          sexo: sexo
        },
        tutor: {
          id: tutorId,
          nome: tutorNome
        },
        internacao: {
          codigo: codigoInternacao,
          data_entrada: dataEntrada,
          motivo: motivoInternacao,
          situacao: situacao
        },
        medicamentos: medicamentos,
        procedimentos: procedimentos,
        exames_clinicos: exames
      };
    });
    
    console.log('Detalhes extraídos com sucesso:');
    console.log(`Animal: ${detalhesInternacao.animal.nome}`);
    console.log(`Espécie: ${detalhesInternacao.animal.especie}, Raça: ${detalhesInternacao.animal.raca}`);
    console.log(`Tutor: ${detalhesInternacao.tutor.nome} (ID: ${detalhesInternacao.tutor.id})`);
    console.log(`Código de Internação: ${detalhesInternacao.internacao.codigo}`);
    
    return res.json({
      success: true,
      data: detalhesInternacao
    });
    
  } catch (error: any) {
    console.error(`Erro ao buscar detalhes da internação do animal ${animalId}:`, error);
    
    // Se ocorrer um erro, tenta resetar a sessão para a próxima tentativa
    await resetSession();
    
    // Verificar se o erro é relacionado ao limite de tentativas
    if (error.message && (
        error.message.includes('Falha no login após') || 
        error.message.includes('Falha na navegação após') ||
        error.message.includes('tentativas excedido')
    )) {
      return res.status(503).json({
        success: false,
        error: 'Limite de tentativas excedido. Serviço temporariamente indisponível.',
        details: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: `Erro ao buscar detalhes da internação: ${error.message}`
    });
  }
});

export default router;
