import { Router, Request, Response } from 'express';
import { Page } from 'playwright';
import { resetSession, getPage } from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';
import { config } from '../config';

const router = Router();

/**
 * Rota para buscar clientes com dados resumidos (apenas nome, código e animais)
 * Parâmetros:
 * - termo: Termo de busca (nome do cliente, animal ou telefone)
 * - show: Para visualizar o navegador durante a execução (opcional)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Obter parâmetros da requisição
    const termo = req.query.termo as string;
    const show = req.query.show === 'true';
    // Definir timeout para a requisição
    const timeout = parseInt(req.query.timeout as string) || 30000;

    // Validar parâmetros
    if (!termo) {
      return res.status(400).json({
        success: false,
        error: 'O parâmetro "termo" é obrigatório'
      });
    }
    
    const operationId = `busca-cliente-resumido-${Date.now()}`;
    
    console.log(`Buscando cliente resumido com o termo: "${termo}"`);

    // Variável para armazenar a resposta
    let responseData: any;
    let statusCode = 200;
    
    try {
      // Usar o sistema de semáforo para garantir acesso exclusivo ao navegador
      await withLockWait(operationId, async () => {
        let page;
        try {
          // Obter página diretamente sem usar o semáforo interno
          console.log('Obtendo página...');
          page = await getPage(show);
          
          // Verificar se precisa fazer login verificando a URL atual
          const currentUrl = page.url();
          const isLoginPage = currentUrl.includes('/login') || currentUrl === 'about:blank';
          
          if (isLoginPage) {
            console.log('Realizando login diretamente...');
            // Navegar para a página de login
            await page.goto('https://dranimal.vetsoft.com.br/', { waitUntil: 'networkidle' });
            
            // Preencher credenciais
            await page.fill('input[name="user"]', config.vetsoft.username || '');
            await page.fill('input[name="pwd"]', config.vetsoft.password || '');
            
            // Enviar formulário
            await page.press('input[name="pwd"]', 'Enter');
            
            // Aguardar navegação após login
            await page.waitForNavigation({ waitUntil: 'networkidle' });
            
            // Verificar se o login foi bem-sucedido
            const loginUrl = page.url();
            if (loginUrl.includes('/login')) {
              throw new Error('Falha no login, credenciais inválidas');
            }
            
            console.log('Login bem-sucedido');
          } else {
            console.log('Já está logado, continuando...');
          }
          
          // Registrar evento para detectar quando o navegador é fechado abruptamente
          page.on('close', () => {
            console.log(`Página fechada abruptamente durante operação "${operationId}", liberando semáforo...`);
          });
          
          // Navegar para a página de busca
          console.log('Navegando para a página de busca...');
          await page.goto('https://dranimal.vetsoft.com.br/m/clientes/#list/page/1', {
            waitUntil: 'networkidle',
            timeout
          });

          // Preencher o campo de busca
          console.log(`Buscando por "${termo}"...`);
          await page.fill('input[name="nom_pessoa"][placeholder="Cliente, Animal, Telefone, Documento"]', termo);
          
          // Pressionar Enter para iniciar a busca
          await page.keyboard.press('Enter');
          
          // Aguardar o carregamento da página e os resultados
          console.log('Aguardando resultados da busca...');
          
          // Primeiro aguardar o indicador de carregamento aparecer
          try {
            await page.waitForSelector('.loading-overlay', { timeout: 5000 });
            console.log('Indicador de carregamento detectado');
          } catch (e) {
            console.log('Indicador de carregamento não detectado, continuando...');
          }
          
          // Depois aguardar o indicador de carregamento desaparecer
          try {
            await page.waitForSelector('.loading-overlay', { state: 'hidden', timeout: 10000 });
            console.log('Carregamento concluído');
          } catch (e) {
            console.log('Timeout aguardando o fim do carregamento, continuando...');
          }
          
          // Aguardar um tempo adicional para garantir que a página está estável
          await page.waitForTimeout(2000);
          
          // Aguardar os resultados com o timeout configurado
          await page.waitForSelector('tbody tr[id^="grid_Cliente_row"]', { timeout });
          
          // Extrair resultados da busca
          console.log('Extraindo resultados da busca...');
          const resultadosBasicos = await extrairResultadosBusca(page);
          
          // Preparar os dados da resposta
          if (resultadosBasicos.length > 0) {
            responseData = {
              success: true,
              data: resultadosBasicos,
              numeroResultados: resultadosBasicos.length
            };
          } else {
            responseData = {
              success: true,
              data: [],
              numeroResultados: 0
            };
          }
        } catch (error) {
          console.error(`Erro durante a busca de cliente resumido: ${error}`);
          statusCode = 500;
          responseData = {
            success: false,
            error: `Erro ao buscar cliente: ${error.message}`
          };
        }
      }, 60000); // Timeout de 60 segundos
    } catch (error) {
      console.error(`Erro ao aguardar o semáforo: ${error}`);
      statusCode = 500;
      responseData = {
        success: false,
        error: `Erro ao aguardar o semáforo: ${error.message}`
      };
    }
    
    // Enviar a resposta após a liberação do semáforo
    return res.status(statusCode).json(responseData);
  } catch (error: any) {
    console.error('Erro ao buscar cliente resumido:', error);
    
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
    
    return res.status(500).json({
      success: false,
      error: `Erro ao buscar cliente: ${error.message}`
    });
  }
});

// Função para extrair os resultados básicos da busca
async function extrairResultadosBusca(page: Page): Promise<any[]> {
  // Verificar se há resultados
  const numResultados = await page.evaluate(() => {
    // Verificar se há um contador de resultados na página
    const table = document.querySelector('#grid_Cliente');
    if (table) {
      const numRecords = table.getAttribute('data-number-of-records');
      return numRecords ? parseInt(numRecords) : document.querySelectorAll('tbody tr[id^="grid_Cliente_row"]').length;
    }
    return document.querySelectorAll('tbody tr[id^="grid_Cliente_row"]').length;
  });
  
  console.log(`Número de resultados encontrados: ${numResultados}`);
  
  if (numResultados === 0) {
    console.log('Nenhum resultado encontrado');
    return [];
  }
  
  // Extrair dados da tabela de resultados
  const resultados = await page.evaluate(() => {
    const resultados: any[] = [];
    const linhas = document.querySelectorAll('tbody tr[id^="grid_Cliente_row"]');
    
    console.log(`Processando ${linhas.length} linhas da tabela de resultados`);
    
    linhas.forEach(linha => {
      const colunas = linha.querySelectorAll('td');
      if (colunas.length >= 5) {
        // Obter o código do cliente a partir do ID da linha ou do smallzinho
        const idLinha = linha.id || '';
        let codigo = '';
        const smallCodigo = colunas[0].querySelector('small.smallzinho');
        
        if (smallCodigo) {
          const textoSmall = smallCodigo.textContent || '';
          const matchCodigo = textoSmall.match(/Cód:\s*(\d+)/);
          if (matchCodigo && matchCodigo[1]) {
            codigo = matchCodigo[1];
          }
        } else if (idLinha) {
          const matchId = idLinha.match(/grid_Cliente_row(\d+)/);
          if (matchId && matchId[1]) {
            codigo = matchId[1];
          }
        }
        
        // Obter o nome do cliente
        const linkCliente = colunas[0].querySelector('a.ficha-cliente');
        const nome = linkCliente ? linkCliente.textContent?.trim() || '' : '';
        
        // Obter a data de cadastro (coluna 3, índice 3) e remover a hora
        let dataCadastro = colunas[3] ? colunas[3].textContent?.trim() || '' : '';
        // Remover a hora da data (formato: DD/MM/YY HH:MM)
        if (dataCadastro.includes(' ')) {
          dataCadastro = dataCadastro.split(' ')[0];
        }
        
        // Extrair animais da coluna de animais (coluna 4, índice 4)
        const animaisEl = colunas[4];
        const animaisBtn = animaisEl.querySelector('.btn-animais-cliente');
        const animais: any[] = [];
        
        // Extrair animais da lista dropdown
        if (animaisBtn) {
          // Obter a quantidade de animais do botão
          const qtdAnimaisText = animaisBtn.textContent || '';
          const qtdAnimaisMatch = qtdAnimaisText.match(/(\d+)/);
          const qtdAnimais = qtdAnimaisMatch ? parseInt(qtdAnimaisMatch[1]) : 0;
          
          console.log(`Cliente ${codigo} (${nome}) tem ${qtdAnimais} animais`);
          
          // Extrair nomes dos animais da lista dropdown
          const animaisLinks = animaisEl.querySelectorAll('.dropdown-menu li a');
          animaisLinks.forEach(link => {
            const nomeAnimal = link.textContent?.trim() || '';
            const href = link.getAttribute('href') || '';
            const matchCodAnimal = href.match(/cod_animal=(\d+)/);
            let codigoAnimal = '';
            
            if (matchCodAnimal && matchCodAnimal[1]) {
              codigoAnimal = matchCodAnimal[1];
            }
            
            if (nomeAnimal && codigoAnimal) {
              animais.push({
                codigo: codigoAnimal,
                nome: nomeAnimal
              });
            }
          });
          
          // Verificar se a quantidade de animais extraída corresponde à quantidade indicada
          if (animais.length !== qtdAnimais) {
            console.log(`Aviso: Quantidade de animais extraída (${animais.length}) difere da quantidade indicada (${qtdAnimais})`);
          }
        }
        
        if (codigo && nome) {
          resultados.push({
            codigo,
            nome,
            dataCadastro,
            animais
          });
        }
      }
    });
    
    return resultados;
  });
  
  // Verificar se o número de resultados corresponde ao esperado
  if (resultados.length !== numResultados) {
    console.log(`Aviso: Número de resultados extraídos (${resultados.length}) difere do número esperado (${numResultados})`);
  }
  
  // Navegar para a página inicial após a extração
  console.log('Navegando para a página inicial para liberar o semáforo...');
  await page.goto('https://dranimal.vetsoft.com.br/m/dashboard/', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  
  return resultados;
}

export default router;
