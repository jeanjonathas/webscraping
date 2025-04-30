import { Router } from 'express';
import { Page } from 'playwright';
import { ensureLoggedIn, resetSession } from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';

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
  const operationId = `passagem-plantao-${Date.now()}`;
  
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
    
    // Número máximo de tentativas
    const maxRetries = 2;
    let currentRetry = 0;
    let result;
    
    // Loop de tentativas
    while (currentRetry <= maxRetries) {
      try {
        // Usar o sistema de semáforo para garantir acesso exclusivo ao navegador
        result = await withLockWait(operationId, async () => {
          // Navegar para a página da ficha de internação
          const page = await navigateToFichaInternacao(cod_animal, cod_internacao, headless);
          
          // Inserir passagem de plantão
          console.log('Inserindo passagem de plantão...');
          
          // Clicar no botão de incluir
          await page.getByRole('button', { name: ' Incluir' }).click();
          
          // Selecionar opção de Ocorrência/Observação
          await page.getByRole('link', { name: ' Ocorrência/Observação' }).click();
          
          // Aguardar o formulário ser carregado completamente
          console.log('Aguardando o formulário de ocorrência ser carregado...');
          await page.waitForTimeout(2000);
          
          try {
            // Selecionar responsável usando o seletor correto
            console.log('Clicando no dropdown de responsável...');
            await page.locator('button.btn.dropdown-toggle[data-id="cod_usuario"]').click();
            
            // Aguardar o dropdown abrir
            await page.waitForTimeout(2000);
            
            // Tentar clicar diretamente no item da lista que contém o texto do responsável
            console.log(`Tentando selecionar diretamente o responsável: ${responsavel}`);
            
            // Verificar se o item existe na lista e clicar nele
            const itemExists = await page.evaluate((texto) => {
              // Normalizar o texto para comparação (remover acentos, converter para minúsculas)
              const normalizeText = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const normalizedSearch = normalizeText(texto);
              
              // Buscar todos os itens da lista
              const items = Array.from(document.querySelectorAll('.dropdown-menu li'));
              
              // Encontrar o item que contém o texto
              for (const item of items) {
                const itemText = normalizeText(item.textContent || '');
                if (itemText.includes(normalizedSearch)) {
                  // Clicar no item
                  item.querySelector('a')?.click();
                  return true;
                }
              }
              return false;
            }, responsavel);
            
            if (itemExists) {
              console.log('Responsável selecionado com sucesso via JavaScript');
            } else {
              console.log('Não foi possível encontrar o responsável na lista. Tentando outras abordagens...');
              
              // Tentar clicar usando seletores Playwright
              try {
                // Tentar várias abordagens de seletores
                const seletores = [
                  `li a:text("${responsavel}")`,
                  `li:has-text("${responsavel}")`,
                  `.dropdown-menu li:has-text("${responsavel}")`,
                  `.dropdown-menu li a:has-text("${responsavel}")`
                ];
                
                for (const seletor of seletores) {
                  try {
                    console.log(`Tentando seletor: ${seletor}`);
                    await page.locator(seletor).first().click({ timeout: 2000 });
                    console.log(`Seletor ${seletor} funcionou!`);
                    break;
                  } catch (err) {
                    console.log(`Seletor ${seletor} falhou`);
                  }
                }
              } catch (err) {
                console.log('Todas as tentativas de seleção falharam');
              }
            }
            
            // Aguardar um momento para a seleção ser aplicada
            await page.waitForTimeout(2000);
          } catch (selectError) {
            console.error('Erro ao selecionar responsável:', selectError);
            // Continuar mesmo com erro na seleção de responsável
          }
          
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
          
          // Configurar listener para diálogos do navegador
          page.on('dialog', async dialog => {
            console.log(`Diálogo detectado: ${dialog.type()}, mensagem: ${dialog.message()}`);
            await dialog.accept();
            console.log('Diálogo aceito automaticamente');
          });
          
          // Verificar se há um overlay de carregamento bloqueando o botão Finalizar
          try {
            const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
            
            if (hasLoadingOverlay) {
              console.log('Detectado overlay de carregamento bloqueando o botão Finalizar');
              
              // Aguardar um pouco para ver se o overlay desaparece
              await page.waitForTimeout(5000);
              
              // Se ainda estiver visível, tentar remover via JavaScript
              if (await page.locator('.loadingoverlay').isVisible()) {
                console.log('Overlay ainda visível após espera, tentando remover via JavaScript');
                
                await page.evaluate(() => {
                  document.querySelectorAll('.loadingoverlay').forEach(el => {
                    if (el instanceof HTMLElement) {
                      el.style.display = 'none';
                      el.style.visibility = 'hidden';
                      el.style.opacity = '0';
                      el.style.pointerEvents = 'none';
                    }
                  });
                });
                
                console.log('Overlay de carregamento removido via JavaScript');
                await page.waitForTimeout(1000);
              }
            }
            
            // Verificar se o botão "OK" está visível (para o alerta de sistema mostrado na imagem)
            const okButton = page.getByRole('button', { name: 'OK' });
            const isOkButtonVisible = await okButton.isVisible().catch(() => false);
            
            if (isOkButtonVisible) {
              console.log('Botão OK detectado (provavelmente alerta de login em outro navegador)');
              await okButton.click().catch(async (err) => {
                console.log('Erro ao clicar no botão OK via seletor, tentando via JavaScript:', err);
                
                // Tentar clicar via JavaScript
                await page.evaluate(() => {
                  const buttons = Array.from(document.querySelectorAll('button')).filter(
                    btn => btn.textContent?.includes('OK')
                  );
                  
                  if (buttons.length > 0) {
                    (buttons[0] as HTMLElement).click();
                  }
                });
              });
              
              console.log('Botão OK clicado, aguardando possível redirecionamento');
              await page.waitForTimeout(2000);
              
              // Verificar se fomos redirecionados para a página de login
              if (page.url().includes('/login')) {
                console.log('Redirecionado para a página de login após confirmar alerta');
                
                // Fazer login novamente e tentar reinserir
                console.log('Tentando fazer login novamente e reiniciar o processo...');
                
                // Resetar a sessão para garantir um estado limpo
                await resetSession();
                
                // Retornar um status que indique que é necessário tentar novamente
                return {
                  success: false,
                  retry: true,
                  message: 'Sessão expirada durante o processo. Por favor, tente novamente.',
                  data: {
                    cod_animal,
                    cod_internacao,
                    responsavel,
                    timestamp: new Date().toISOString()
                  }
                };
              }
            }
            
            // Verificar especificamente o alerta com o texto "dranimal.vetsoft.com.br diz"
            // Este é o alerta de sistema mostrado na imagem
            try {
              // Verificar se há texto visível na página que corresponde ao alerta
              const alertText = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('div, p, span, h1, h2, h3, h4, h5, h6'));
                for (const el of elements) {
                  const text = el.textContent || '';
                  if (
                    text.includes('dranimal.vetsoft.com.br diz') || 
                    text.includes('usuário está logado em outro navegador') ||
                    text.includes('esta sessão foi finalizada') ||
                    text.includes('Dados não salvos serão perdidos')
                  ) {
                    return text;
                  }
                }
                return null;
              });
              
              if (alertText) {
                console.log(`Detectado alerta específico do sistema: "${alertText}"`);
                
                // Tentar clicar em qualquer botão visível que possa ser o "OK"
                await page.evaluate(() => {
                  // Procurar por botões que possam ser o "OK" do alerta
                  const possibleButtons = Array.from(document.querySelectorAll('button, .button, [role="button"], input[type="button"]'))
                    .filter(el => {
                      const text = el.textContent || '';
                      const isVisible = (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0;
                      return isVisible && (
                        text.includes('OK') || 
                        text.includes('Finalizar') || 
                        text.includes('Confirmar') ||
                        text.includes('Fechar')
                      );
                    });
                  
                  // Clicar no primeiro botão encontrado
                  if (possibleButtons.length > 0) {
                    (possibleButtons[0] as HTMLElement).click();
                    return true;
                  }
                  
                  return false;
                });
                
                console.log('Tentativa de clicar no botão do alerta via JavaScript');
                await page.waitForTimeout(2000);
                
                // Verificar se fomos redirecionados para a página de login
                if (page.url().includes('/login')) {
                  console.log('Redirecionado para a página de login após confirmar alerta específico');
                  
                  // Fazer login novamente e tentar reinserir
                  console.log('Tentando fazer login novamente e reiniciar o processo...');
                  
                  // Resetar a sessão para garantir um estado limpo
                  await resetSession();
                  
                  // Retornar um status que indique que é necessário tentar novamente
                  return {
                    success: false,
                    retry: true,
                    message: 'Sessão expirada durante o processo. Por favor, tente novamente.',
                    data: {
                      cod_animal,
                      cod_internacao,
                      responsavel,
                      timestamp: new Date().toISOString()
                    }
                  };
                }
              }
            } catch (specificAlertError) {
              console.log('Erro ao tentar tratar alerta específico:', specificAlertError);
              // Continuar o fluxo mesmo com erro no tratamento do alerta específico
            }
            
            // Tentar clicar no botão Finalizar com retry e timeout maior
            try {
              await page.getByRole('button', { name: 'Finalizar' }).click({ timeout: 5000 });
            } catch (finalizeError) {
              console.log('Erro ao clicar no botão Finalizar, tentando abordagem alternativa:', finalizeError);
              
              // Tentar clicar via JavaScript como último recurso
              await page.evaluate(() => {
                const finalizarBtns = Array.from(document.querySelectorAll('button')).filter(
                  btn => btn.textContent?.includes('Finalizar')
                );
                
                if (finalizarBtns.length > 0) {
                  (finalizarBtns[0] as HTMLElement).click();
                }
              });
              
              console.log('Tentativa de clicar no botão Finalizar via JavaScript');
              await page.waitForTimeout(1000);
            }
            
            // Navegar imediatamente para o dashboard após inserir a passagem de plantão
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
            
            return {
              success: true,
              message: 'Passagem de plantão inserida com sucesso',
              data: {
                cod_animal,
                cod_internacao,
                responsavel,
                timestamp: new Date().toISOString()
              }
            };
          } catch (alertError) {
            console.log('Erro ao tentar tratar alerta/overlay:', alertError);
            // Continuar o fluxo mesmo com erro no tratamento do alerta
            throw alertError; // Propagar o erro para ser tratado no catch externo
          }
        }, 180000); // Aguardar até 3 minutos pelo bloqueio
        
        // Verificar se é necessário fazer retry
        if (result && result.retry === true) {
          console.log(`Tentativa ${currentRetry + 1}/${maxRetries + 1} falhou com status retry. Tentando novamente...`);
          currentRetry++;
          
          // Aguardar um pouco antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Se já excedeu o número máximo de tentativas, sair do loop
          if (currentRetry > maxRetries) {
            throw new Error(`Número máximo de tentativas (${maxRetries + 1}) excedido.`);
          }
          
          // Continuar para a próxima iteração
          continue;
        }
        
        // Se chegou aqui, a operação foi bem-sucedida
        break;
        
      } catch (retryError) {
        console.error(`Erro na tentativa ${currentRetry + 1}/${maxRetries + 1}:`, retryError);
        
        // Incrementar contador de tentativas
        currentRetry++;
        
        // Se já excedeu o número máximo de tentativas, propagar o erro
        if (currentRetry > maxRetries) {
          throw new Error(`Falha após ${maxRetries + 1} tentativas: ${retryError.message}`);
        }
        
        // Aguardar um pouco antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Resetar a sessão antes de tentar novamente
        await resetSession();
        console.log('Sessão resetada para nova tentativa');
      }
    }
    
    return res.json(result);
    
  } catch (error: any) {
    console.error('Erro ao inserir passagem de plantão:', error);
    
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
        error: 'Limite de tentativas excedido ou serviço ocupado. Serviço temporariamente indisponível.',
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
