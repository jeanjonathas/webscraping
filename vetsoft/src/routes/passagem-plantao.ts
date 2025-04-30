import { Router } from 'express';
import { Page } from 'playwright';
import { ensureLoggedIn, resetSession } from '../utils/browserSession';

const router = Router();

/**
 * Interface para os dados de passagem de plantão
 * 
 * @param cod_animal - Código do animal internado (obrigatório)
 * @param cod_internacao - Código da internação (obrigatório)
 * @param responsavel - Nome do responsável pela passagem de plantão (obrigatório)
 *                      Este valor será usado para pesquisar no campo de busca do formulário
 * @param observacao - Texto da passagem de plantão (obrigatório)
 *                     Este texto será inserido no editor rich text do formulário
 */
interface PassagemPlantao {
  cod_animal: string;
  cod_internacao: string;
  responsavel: string;
  observacao: string;
}

// Função para navegar até a página de ficha do animal internado
async function navigateToFichaInternacao(codAnimal: string, codInternacao: string, headless: boolean = true): Promise<Page> {
  try {
    // Obter página já logada
    const page = await ensureLoggedIn(headless);
    
    console.log(`Navegando para a ficha de internação do animal ${codAnimal}...`);
    
    // Navegar diretamente para a URL da ficha de internação
    await page.goto(`https://dranimal.vetsoft.com.br/m/internacoes/ficha.animal.php?cod_animal=${codAnimal}&cod_internacao=${codInternacao}#list/page/1/`, {
      waitUntil: 'networkidle'
    });
    
    console.log('Página da ficha de internação carregada');
    
    // Verificar se está na página correta
    const url = page.url();
    if (!url.includes(`cod_animal=${codAnimal}`) || !url.includes(`cod_internacao=${codInternacao}`)) {
      console.warn(`URL atual não contém os códigos esperados: ${url}`);
    }
    
    return page;
  } catch (error) {
    console.error('Erro ao navegar para a ficha de internação:', error);
    // Se houver erro na navegação, pode ser que a sessão tenha expirado
    await resetSession();
    throw error;
  }
}

// Rota para inserir passagem de plantão
router.post('/', async (req, res) => {
  try {
    console.log('Iniciando inserção de passagem de plantão...');
    
    // Extrair dados do corpo da requisição
    const { cod_animal, cod_internacao, responsavel, observacao } = req.body as PassagemPlantao;
    
    // Validar dados obrigatórios
    if (!cod_animal || !cod_internacao || !responsavel || !observacao) {
      return res.status(400).json({
        success: false,
        error: 'Dados incompletos. Forneça cod_animal, cod_internacao, responsavel e observacao.'
      });
    }
    
    console.log(`Inserindo passagem de plantão para o animal ${cod_animal}, internação ${cod_internacao}`);
    console.log(`Responsável: ${responsavel}`);
    console.log(`Observação: ${observacao.substring(0, 100)}${observacao.length > 100 ? '...' : ''}`);
    
    // Usar o modo headless com base no parâmetro da query
    const showBrowser = req.query.show === 'true';
    const headless = !showBrowser;
    
    // Navegar para a página da ficha de internação
    const page = await navigateToFichaInternacao(cod_animal, cod_internacao, headless);
    
    // Capturar screenshot para debug
    await page.screenshot({ path: 'passagem-plantao-screenshot.png' });
    console.log('Screenshot salvo em passagem-plantao-screenshot.png');
    
    // Inserir passagem de plantão
    console.log('Inserindo passagem de plantão...');
    
    // Clicar no botão de incluir
    await page.getByRole('button', { name: ' Incluir' }).click();
    
    // Selecionar opção de Ocorrência/Observação
    await page.getByRole('link', { name: ' Ocorrência/Observação' }).click();
    
    // Selecionar responsável
    await page.getByRole('combobox', { name: 'Search' }).click();
    await page.getByRole('combobox', { name: 'Search' }).fill(responsavel);
    await page.getByRole('combobox', { name: 'Search' }).press('Enter');
    
    // Preencher observação no editor de texto
    const frameLocator = page.locator('iframe[title="Área Rich Text\\. Aperte ALT-0 para ajuda\\."]');
    const frame = await frameLocator.contentFrame();
    
    if (frame) {
      await frame.locator('#tinymce').click();
      await frame.locator('#tinymce').fill(observacao);
    } else {
      throw new Error('Não foi possível acessar o editor de texto');
    }
    
    // Gravar a passagem de plantão
    await page.getByRole('button', { name: ' Gravar' }).click();
    
    // Finalizar
    await page.getByRole('button', { name: 'Finalizar' }).click();
    
    // Navegar imediatamente para o dashboard após inserir a passagem de plantão
    // Isso é crítico para evitar erros em requisições subsequentes
    console.log('Navegando imediatamente para o dashboard após inserir passagem de plantão...');
    try {
      await page.goto('https://dranimal.vetsoft.com.br/m/dashboard/', { 
        waitUntil: 'domcontentloaded', // Usar domcontentloaded em vez de networkidle para ser mais rápido
        timeout: 5000 // Reduzir timeout para 5 segundos
      });
      console.log('Navegação para o dashboard concluída com sucesso');
    } catch (navError) {
      console.error('Erro ao navegar para o dashboard após inserir dados:', navError);
      // Tentar novamente com timeout maior
      try {
        await page.goto('https://dranimal.vetsoft.com.br/m/dashboard/', { 
          waitUntil: 'networkidle',
          timeout: 10000 
        });
        console.log('Segunda tentativa de navegação para o dashboard concluída com sucesso');
      } catch (retryError) {
        console.error('Falha na segunda tentativa de navegar para o dashboard:', retryError);
        // Mesmo com erro, continuamos o fluxo para não falhar a requisição
      }
    }
    
    console.log('Passagem de plantão inserida com sucesso');
    
    return res.json({
      success: true,
      message: 'Passagem de plantão inserida com sucesso',
      data: {
        cod_animal,
        cod_internacao,
        responsavel,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error: any) {
    console.error('Erro ao inserir passagem de plantão:', error);
    
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
      error: `Erro ao inserir passagem de plantão: ${error.message}`
    });
  }
});

export default router;
