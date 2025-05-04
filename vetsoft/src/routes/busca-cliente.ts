import { Router } from 'express';
import { ensureLoggedIn, resetSession } from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';
import { Page } from 'playwright';

// Tipos e interfaces são inferidos pelo TypeScript

const router = Router();

/**
 * Rota para buscar clientes por nome ou telefone
 * Parâmetros:
 * - termo: Termo de busca (nome do cliente, animal ou telefone)
 * - show: Para visualizar o navegador durante a execução (opcional)
 */
router.get('/', async (req, res) => {
  try {
    const termo = req.query.termo as string;
    const show = req.query.show === 'true';
    
    // Validar parâmetros
    if (!termo) {
      return res.status(400).json({
        success: false,
        error: 'O parâmetro "termo" é obrigatório'
      });
    }
    
    const operationId = `busca-cliente-${Date.now()}`;
    
    console.log(`Buscando cliente com o termo: "${termo}"`);
    
    // Usar o modo headless com base no parâmetro da query
    const headless = !show;
    
    // IMPORTANTE: Obter uma página com login já feito ANTES de adquirir o semáforo principal
    // Isso evita deadlock entre os semáforos
    console.log('Obtendo página com login já feito (antes do semáforo principal)...');
    let page = await ensureLoggedIn(headless);
    
    // Agora usar o sistema de semáforo para garantir acesso exclusivo ao navegador
    console.log(`Adquirindo semáforo para operação de busca de cliente...`);
    const result = await withLockWait(operationId, async () => {
      try {
        console.log('Navegando para a página de clientes...');
        
        // Função para tentar navegar com retry
        const navigateToClientes = async (retryCount = 0): Promise<Page> => {
          try {
            // Navegar para a página de clientes
            await page.goto('https://dranimal.vetsoft.com.br/m/clientes/', {
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
              return navigateToClientes(retryCount + 1);
            } else {
              // Se excedeu as tentativas ou é outro tipo de erro, propagar o erro
              throw error;
            }
          }
        };
        
        // Tentar navegar com mecanismo de retry
        const updatedPage = await navigateToClientes();
        page = updatedPage;
        
        console.log('Página de clientes carregada');
        
        // Verificar se há elementos de carregamento visíveis e aguardar que desapareçam
        const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
        if (hasLoadingOverlay) {
          console.log('Detectado overlay de carregamento, aguardando finalizar...');
          await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 10000 }).catch(e => {
            console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
          });
        }
        
        // Realizar a busca
        console.log(`Realizando busca com o termo: "${termo}"`);
        
        // Limpar o campo de busca antes de preencher
        await page.getByRole('searchbox', { name: 'Cliente, Animal, Telefone,' }).click();
        await page.getByRole('searchbox', { name: 'Cliente, Animal, Telefone,' }).fill('');
        
        // Preencher o termo de busca
        await page.getByRole('searchbox', { name: 'Cliente, Animal, Telefone,' }).fill(termo);
        
        // Clicar no botão de busca (usando um seletor mais específico)
        await page.locator('#form_filtros_Cliente button.apply-filters').click();
        
        // Aguardar o carregamento dos resultados
        console.log('Aguardando carregamento dos resultados...');
        await page.waitForTimeout(3000); // Aguardar 3 segundos para garantir que os resultados sejam carregados
        
        // Verificar se há overlay de carregamento após a busca
        const hasLoadingOverlayAfterSearch = await page.locator('.loadingoverlay').isVisible();
        if (hasLoadingOverlayAfterSearch) {
          console.log('Detectado overlay de carregamento após busca, aguardando finalizar...');
          await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 10000 }).catch(e => {
            console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
          });
        }
        
        // Extrair os resultados da busca
        console.log('Extraindo resultados da busca...');
        const resultadosBasicos = await extrairResultadosBusca(page);
        
        // Para cada cliente encontrado, navegar para a página de detalhes e extrair dados completos
        console.log(`Encontrados ${resultadosBasicos.length} clientes. Extraindo dados detalhados...`);
        
        const clientesDetalhados = [];
        
        // Limitar a quantidade de clientes para evitar tempos de processamento muito longos
        const maxClientes = 5; // Limitar a 5 clientes para evitar tempos de processamento muito longos
        const clientesParaProcessar = resultadosBasicos.slice(0, maxClientes);
        
        for (const cliente of clientesParaProcessar) {
          console.log(`Extraindo dados detalhados do cliente ${cliente.codigo}...`);
          
          try {
            // Navegar diretamente para a página de detalhes do cliente
            console.log(`Navegando para a página de detalhes do cliente ${cliente.codigo}...`);
            await page.goto(`https://dranimal.vetsoft.com.br/m/clientes/ficha.php?cod_cliente=${cliente.codigo}#///1`, {
              waitUntil: 'networkidle',
              timeout: 30000
            });
            
            // Aguardar carregamento completo
            await page.waitForTimeout(3000);
            
            // Verificar se há elementos de carregamento visíveis e aguardar que desapareçam
            const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
            if (hasLoadingOverlay) {
              console.log('Detectado overlay de carregamento, aguardando finalizar...');
              await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 10000 }).catch(e => {
                console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
              });
            }
            
            // Extrair dados detalhados do cliente usando o mesmo formato do endpoint de cliente
            console.log(`Extraindo dados detalhados do cliente ${cliente.codigo}...`);
            const dadosDetalhados = await page.evaluate(() => {
              // Função auxiliar para obter valor de um input
              const getValue = (selector: string): string => {
                const element = document.querySelector(selector) as HTMLInputElement;
                return element ? element.value || '' : '';
              };
              
              // Função auxiliar para obter valor de um select
              const getSelectedValue = (selector: string): string => {
                const element = document.querySelector(`${selector} option:checked`) as HTMLOptionElement;
                return element ? element.textContent?.trim() || '' : '';
              };
              
              // Extrair dados básicos do cliente
              const codigo = getValue('#cod_cliente') || '';
              const nome = getValue('#nom_cliente') || '';
              const tipo_pessoa = getValue('#tip_pessoa') || 'pf';
              const cpf_cnpj = tipo_pessoa === 'pf' ? getValue('#num_cpf') : getValue('#num_cnpj');
              const rg = getValue('#num_rg') || '';
              
              // Extrair data de nascimento
              const dia = getValue('#dia') || '';
              const mes = getValue('#mes') || '';
              const ano = getValue('#ano') || '';
              const data_nascimento = (dia && mes && ano) ? `${dia}/${mes}/${ano}` : '';
              
              // Extrair endereço
              const cep = getValue('#num_cep') || '';
              const tipo_logradouro = getSelectedValue('#des_tipo_endereco') || '';
              const logradouro = getValue('#des_endereco') || '';
              const numero = getValue('#num_endereco') || '';
              const complemento = getValue('#des_complemento') || '';
              const bairro = getValue('#nom_bairro') || '';
              const cidade = getValue('#nom_cidade') || '';
              const estado = getSelectedValue('#cod_estado') || '';
              
              // Extrair dados de contato
              const contatosElements = document.querySelectorAll('.contato');
              const contatos = Array.from(contatosElements).map(contatoEl => {
                const tipoInput = contatoEl.querySelector('input[name="contato[tip_contato][]"]') as HTMLInputElement;
                const tipo = tipoInput ? tipoInput.value : '';
                
                const valorInput = contatoEl.querySelector('input[id="contatoval_contato"]') as HTMLInputElement;
                const valor = valorInput ? valorInput.value : '';
                
                const whatsappCheckbox = contatoEl.querySelector('input[name="is_mensageiro"]') as HTMLInputElement;
                const whatsapp = whatsappCheckbox ? whatsappCheckbox.checked : false;
                
                const operadoraSelect = contatoEl.querySelector('select[id="contatotel_operadora"]') as HTMLSelectElement;
                const operadora = operadoraSelect ? operadoraSelect.value : '';
                
                const observacaoInput = contatoEl.querySelector('input[id="contatoobs_contato"]') as HTMLInputElement;
                const observacao = observacaoInput ? observacaoInput.value : '';
                
                const nomeTipoInput = contatoEl.querySelector('input[id="contatonom_contato"]') as HTMLInputElement;
                const nomeTipoSelect = contatoEl.querySelector('select[id="contatonom_contato"]') as HTMLSelectElement;
                let nomeTipo = '';
                
                if (nomeTipoInput) {
                  nomeTipo = nomeTipoInput.value;
                } else if (nomeTipoSelect) {
                  const selectedOption = nomeTipoSelect.options[nomeTipoSelect.selectedIndex];
                  nomeTipo = selectedOption ? selectedOption.textContent || '' : '';
                }
                
                return {
                  tipo: nomeTipo || tipo,
                  valor,
                  whatsapp,
                  operadora: operadora || undefined,
                  observacao: observacao || undefined
                };
              }).filter(contato => contato.valor); // Filtrar contatos vazios
              
              // Extrair dados adicionais
              const local_trabalho = getValue('#des_local_trabalho') || '';
              const como_conheceu = getSelectedValue('#cod_local') || '';
              const observacoes = getValue('#obs_cliente') || '';
              
              // Extrair grupos
              const gruposElements = document.querySelectorAll('#cod_grupo_cliente option:checked');
              const grupos = Array.from(gruposElements).map(el => el.textContent?.trim() || '').filter(Boolean);
              
              // Extrair data de cadastro e situação
              const dataCadastroElement = document.querySelector('.usu_cad .dat');
              const data_cadastro = dataCadastroElement ? dataCadastroElement.textContent?.trim() || '' : '';
              
              const dataAtualizacaoElement = document.querySelector('.usu_upd .dat');
              const data_atualizacao = dataAtualizacaoElement ? dataAtualizacaoElement.textContent?.trim() || '' : '';
              
              const situacao = document.querySelector('.btn-cli-inactive') ? 'Ativo' : 'Inativo';
              
              // Extrair animais vinculados
              const animaisElements = document.querySelectorAll('.animal');
              const animais = Array.from(animaisElements).map(animalEl => {
                const nomeElement = animalEl.querySelector('.media-heading');
                const nome = nomeElement ? nomeElement.firstChild?.textContent?.trim() || '' : '';
                
                // Extrair código do animal
                const codigoMatch = nomeElement?.querySelector('small')?.textContent?.match(/\(Cód: (\d+)\)/);
                const codigo = codigoMatch ? codigoMatch[1] : '';
                
                // Extrair informações adicionais do animal (espécie, raça, sexo)
                let infoText = '';
                
                // Tenta encontrar o parágrafo que contém as informações do animal
                const paragraphs = animalEl.querySelectorAll('.media-body p');
                // Percorre todos os parágrafos procurando o que contém as informações do animal
                for (let i = 0; i < paragraphs.length; i++) {
                  const text = paragraphs[i].textContent?.trim() || '';
                  // Verifica se o texto contém vírgulas e alguma das palavras-chave esperadas
                  if (text.includes(',') && 
                     (text.includes('Canino') || 
                      text.includes('Felino') || 
                      text.includes('Fêmea') || 
                      text.includes('Macho'))) {
                    infoText = text;
                    break;
                  }
                }
                
                // Se não encontrou com as palavras-chave, pega qualquer parágrafo com vírgulas
                if (!infoText) {
                  for (let i = 0; i < paragraphs.length; i++) {
                    const text = paragraphs[i].textContent?.trim() || '';
                    if (text.includes(',')) {
                      infoText = text;
                      break;
                    }
                  }
                }
                
                // Extrair espécie, raça e sexo do texto
                const infoParts = infoText.split(',').map(part => part.trim());
                const especie = infoParts[0] || '';
                const raca = infoParts[1] || '';
                const sexo = infoParts[2] || '';
                
                // Determinar situação do animal
                const situacao = animalEl.classList.contains('obito') ? 'Óbito' : 'Ativo';
                
                // Determinar se o animal está internado verificando a presença do ícone de batimento cardíaco
                const internado = !!animalEl.querySelector('.fas.fa-heartbeat');
                
                return {
                  codigo,
                  nome,
                  especie,
                  raca,
                  sexo,
                  situacao,
                  internado
                };
              }).filter(animal => animal.nome); // Filtrar animais sem nome, que são provavelmente elementos falsos
              
              return {
                codigo,
                nome,
                tipo_pessoa,
                cpf_cnpj,
                rg,
                data_nascimento,
                endereco: {
                  cep,
                  tipo_logradouro,
                  logradouro,
                  numero,
                  complemento,
                  bairro,
                  cidade,
                  estado
                },
                contatos,
                data_cadastro,
                data_atualizacao,
                situacao,
                observacoes,
                como_conheceu,
                local_trabalho,
                grupos,
                animais
              };
            });
            
            // Garantir que os campos estejam no formato correto
            const dadosFormatados = {
              codigo: dadosDetalhados.codigo,
              nome: dadosDetalhados.nome,
              tipo_pessoa: dadosDetalhados.tipo_pessoa,
              cpf_cnpj: dadosDetalhados.cpf_cnpj,
              rg: dadosDetalhados.rg,
              data_nascimento: dadosDetalhados.data_nascimento,
              endereco: dadosDetalhados.endereco,
              contatos: dadosDetalhados.contatos,
              data_cadastro: dadosDetalhados.data_cadastro,
              data_atualizacao: dadosDetalhados.data_atualizacao,
              situacao: dadosDetalhados.situacao,
              observacoes: dadosDetalhados.observacoes,
              como_conheceu: dadosDetalhados.como_conheceu,
              local_trabalho: dadosDetalhados.local_trabalho,
              grupos: dadosDetalhados.grupos,
              animais: dadosDetalhados.animais
            };
            
            // Adicionar os dados formatados à lista
            clientesDetalhados.push(dadosFormatados);
          } catch (error) {
            console.error(`Erro ao extrair dados detalhados do cliente ${cliente.codigo}:`, error);
            // Se não foi possível extrair dados detalhados, usar os dados básicos
            clientesDetalhados.push(cliente);
          }
        }
        
        // Adicionar mensagem se houver mais resultados do que os processados
        if (resultadosBasicos.length > maxClientes) {
          console.log(`Apenas ${maxClientes} de ${resultadosBasicos.length} clientes foram processados para evitar tempos de processamento muito longos.`);
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
        
        // Retornar apenas o primeiro cliente encontrado no formato desejado
        if (clientesDetalhados.length > 0) {
          return {
            success: true,
            data: clientesDetalhados[0],
            numeroResultados: clientesDetalhados.length
          };
        } else {
          return {
            success: true,
            data: null,
            numeroResultados: 0
          };
        }
      } catch (error: any) {
        console.error('Erro ao buscar cliente:', error);
        
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
          error: `Erro ao buscar cliente: ${error.message}`,
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
    console.error('Erro na rota de busca de cliente:', error);
    
    return res.status(500).json({
      success: false,
      error: `Erro ao processar requisição: ${error.message}`
    });
  }
});

/**
 * Função auxiliar para extrair os resultados da busca
 */
async function extrairResultadosBusca(page: Page): Promise<any[]> {
  try {
    // Extrair todos os resultados da tabela
    return await page.evaluate(() => {
      const listaResultados: any[] = [];
      
      // Selecionar todas as linhas da tabela de resultados
      const linhas = document.querySelectorAll('tr[id^="grid_Cliente_row"]');
      
      if (linhas.length === 0) {
        // Verificar se há mensagem de "nenhum registro encontrado"
        const semResultados = document.querySelector('.grid-empty-text');
        if (semResultados) {
          console.log('Nenhum resultado encontrado para a busca');
        } else {
          console.log('Tabela de resultados não encontrada');
        }
      }
      
      linhas.forEach((linha) => {
        try {
          // Extrair ID do cliente da linha
          const id = linha.id.replace('grid_Cliente_row', '');
          
          // Usar o ID da linha como código do cliente
          let codigo = id;
          
          // Extrair nome do cliente
          const nomeElement = linha.querySelector('td:nth-child(1) a.ficha-cliente');
          const nome = nomeElement ? nomeElement.textContent?.trim() || '' : '';
          
          // Verificar se há o elemento smallzinho que contém o código
          const smallElement = linha.querySelector('td:nth-child(1) small.smallzinho');
          if (smallElement) {
            const smallText = smallElement.textContent?.trim() || '';
            const codMatch = smallText.match(/Cód:\s*(\d+)/);
            if (codMatch && codMatch[1]) {
              codigo = codMatch[1];
              console.log('Código extraído do smallzinho:', codigo);
            }
          }
          
          // Verificar também o atributo href do link
          if (nomeElement) {
            const clienteUrl = nomeElement.getAttribute('href') || '';
            const clienteIdMatch = clienteUrl.match(/cod_cliente=(\d+)/);
            if (clienteIdMatch && clienteIdMatch[1]) {
              // Confirmar que o código é o mesmo
              if (codigo !== clienteIdMatch[1]) {
                console.log(`Código diferente encontrado: ${codigo} vs ${clienteIdMatch[1]}`);
              }
              codigo = clienteIdMatch[1];
              console.log('Código extraído do href:', codigo);
            }
          }
          
          // Verificar se há um script com os dados do cliente
          const scriptElement = linha.querySelector('script');
          if (scriptElement) {
            const scriptContent = scriptElement.textContent || '';
            const jsonMatch = scriptContent.match(/var grid_Cliente_param\d+ = (.*);/);
            if (jsonMatch && jsonMatch[1]) {
              try {
                const clienteData = JSON.parse(jsonMatch[1]);
                if (clienteData.cod_cliente) {
                  codigo = clienteData.cod_cliente;
                  console.log('Código extraído do script JSON:', codigo);
                }
              } catch (e) {
                console.error('Erro ao parsear JSON do cliente:', e);
              }
            }
          }
          
          // Extrair CPF/CNPJ (coluna 2)
          const cpfCnpjElement = linha.querySelector('td:nth-child(2)');
          const cpfCnpj = cpfCnpjElement ? cpfCnpjElement.textContent?.trim() || '' : '';
          
          // Extrair contatos (coluna 3)
          const contatosElement = linha.querySelector('td:nth-child(3)');
          const contatosText = contatosElement ? contatosElement.innerHTML.replace(/<br>/g, ', ') : '';
          const telefone = contatosText.replace(/<[^>]*>/g, '').trim();
          
          // Extrair data de cadastro (coluna 4)
          const dataCadastroElement = linha.querySelector('td:nth-child(4)');
          const dataCadastro = dataCadastroElement ? dataCadastroElement.textContent?.trim() || '' : '';
          
          // Extrair animais (coluna 5)
          const animaisContainer = linha.querySelector('td:nth-child(5) .btn-group');
          let quantidadeAnimais = 0;
          let animais: Array<{codigo: string, nome: string}> = [];
          
          if (animaisContainer) {
            // Extrair a quantidade de animais do botão
            const btnAnimais = animaisContainer.querySelector('.btn-animais-cliente');
            const btnText = btnAnimais ? btnAnimais.textContent || '' : '';
            const qtdMatch = btnText.match(/\d+/);
            quantidadeAnimais = qtdMatch ? parseInt(qtdMatch[0], 10) : 0;
            
            // Extrair informações de cada animal da lista dropdown
            const animaisLinks = animaisContainer.querySelectorAll('ul.dropdown-menu li a');
            animais = Array.from(animaisLinks).map(link => {
              const nome = link.textContent?.trim() || '';
              const url = link.getAttribute('href') || '';
              
              // Extrair código do animal da URL
              const animalIdMatch = url.match(/cod_animal=(\d+)/);
              const codigo = animalIdMatch ? animalIdMatch[1] : '';
              
              // Extrair URL completa para a ficha do animal
              const urlCompleta = url.startsWith('/') ? `https://dranimal.vetsoft.com.br${url}` : url;
              
              return {
                codigo,
                nome,
                url: urlCompleta
              };
            });
          }
          
          // Extrair saldo da conta (coluna 6)
          const contaElement = linha.querySelector('td:nth-child(6)');
          const conta = contaElement ? contaElement.textContent?.trim() || '0,00' : '0,00';
          
          // Extrair situação (coluna 7)
          const situacaoElement = linha.querySelector('td:nth-child(7) .label');
          const situacao = situacaoElement ? situacaoElement.textContent?.trim() || '' : '';
          
          // Extrair dados do WhatsApp (se disponível)
          let whatsapp = '';
          let dadosAdicionais: Record<string, any> = {};
          const whatsappButton = linha.querySelector('button.btn-whatsapp');
          if (whatsappButton) {
            const onclickAttr = whatsappButton.getAttribute('onclick') || '';
            const jsonMatch = onclickAttr.match(/MensagemWhatsapp\.viewMessages\('clientes',\s*'(.+?)'\)/);
            if (jsonMatch && jsonMatch[1]) {
              try {
                // Substituir aspas simples escapadas por aspas duplas para criar um JSON válido
                const jsonStr = jsonMatch[1]
                  .replace(/\\'/g, '"')
                  .replace(/'/g, '"');
                
                dadosAdicionais = JSON.parse(jsonStr);
                if (dadosAdicionais && typeof dadosAdicionais === 'object') {
                  whatsapp = dadosAdicionais.whatsapp_to || '';
                }
              } catch (e) {
                console.error('Erro ao parsear JSON dos dados adicionais:', e);
              }
            }
          }
          
          // Criar objeto do cliente com todos os dados extraídos
          const cliente = {
            id,
            codigo,
            nome,
            cpf_cnpj: cpfCnpj,
            telefone,
            contatos: telefone,
            data_cadastro: dataCadastro,
            animais,
            quantidade_animais: quantidadeAnimais,
            saldo_conta: conta,
            situacao,
            whatsapp,
            dados_adicionais: dadosAdicionais
          };
          
          listaResultados.push(cliente);
        } catch (error) {
          console.error('Erro ao processar linha de resultado:', error);
        }
      });
      
      return listaResultados;
    });
  } catch (error: any) {
    console.error('Erro ao extrair resultados da busca:', error);
    throw error;
  }
}

// A função extrairDadosDetalhadosCliente foi removida pois seu código foi incorporado diretamente no endpoint

export default router;
