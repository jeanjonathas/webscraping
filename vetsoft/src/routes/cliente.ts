import { Router } from 'express';
import { ensureLoggedIn, resetSession } from '../utils/browserSession';
import { withLockWait } from '../utils/requestSemaphore';

const router = Router();

// Interface para os dados de contato
interface Contato {
  tipo: string;
  valor: string;
  whatsapp: boolean;
  operadora?: string;
  observacao?: string;
}

// Interface para os dados do animal
interface Animal {
  codigo: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  situacao: string;
  internado: boolean;
}

// Interface para os dados do cliente
interface Cliente {
  codigo: string;
  nome: string;
  tipo_pessoa: string;
  cpf_cnpj?: string;
  rg?: string;
  data_nascimento?: string;
  endereco?: {
    cep?: string;
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
  };
  contatos: Contato[];
  data_cadastro?: string;
  data_atualizacao?: string;
  situacao?: string;
  observacoes?: string;
  como_conheceu?: string;
  local_trabalho?: string;
  grupos?: string[];
  animais: Animal[];
}

// Rota para obter dados de um cliente específico
router.get('/:id', async (req, res) => {
  const codCliente = req.params.id;
  const operationId = `cliente-${codCliente}-${Date.now()}`;
  
  if (!codCliente) {
    return res.status(400).json({
      success: false,
      error: 'Código do cliente não fornecido'
    });
  }
  
  try {
    console.log(`Buscando dados do cliente: ${codCliente}`);
    
    // Usar o modo headless com base no parâmetro da query
    const showBrowser = req.query.show === 'true';
    const headless = !showBrowser;
    
    // IMPORTANTE: Obter uma página com login já feito ANTES de adquirir o semáforo principal
    // Isso evita deadlock entre os semáforos
    console.log('Obtendo página com login já feito (antes do semáforo principal)...');
    const page = await ensureLoggedIn(headless);
    
    // Agora usar o sistema de semáforo para garantir acesso exclusivo ao navegador
    // para a operação de extração de dados do cliente
    console.log(`Adquirindo semáforo para operação de cliente ${codCliente}...`);
    const result = await withLockWait(operationId, async () => {
      try {
        console.log(`Navegando para a ficha do cliente ${codCliente}...`);
        
        // Navegar diretamente para a URL da ficha do cliente
        await page.goto(`https://dranimal.vetsoft.com.br/m/clientes/ficha.php?cod_cliente=${codCliente}#///1`, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        console.log('Página da ficha do cliente carregada');
        
        // Verificar se está na página correta
        const url = page.url();
        if (!url.includes(`cod_cliente=${codCliente}`)) {
          console.warn(`URL atual não contém o código do cliente esperado: ${url}`);
          
          // Se fomos redirecionados para a página inicial ou de login, a sessão expirou
          if (url === 'https://dranimal.vetsoft.com.br/' || url.includes('/login')) {
            console.log('Redirecionado para a página inicial ou de login. Sessão expirada.');
            
            // Resetar a sessão e tentar novamente
            await resetSession();
            
            return {
              success: false,
              error: 'Sessão expirada durante a navegação. Por favor, tente novamente.'
            };
          }
        }
        
        // Aguardar um tempo adicional para garantir que todos os dados sejam carregados
        console.log('Aguardando carregamento completo dos dados do cliente...');
        await page.waitForTimeout(3000); // Aguardar 3 segundos
        
        // Verificar se há elementos de carregamento visíveis e aguardar que desapareçam
        const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
        if (hasLoadingOverlay) {
          console.log('Detectado overlay de carregamento, aguardando finalizar...');
          await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 10000 }).catch(e => {
            console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
          });
        }
        
        // Verificar se há requisições AJAX em andamento
        await page.waitForFunction(() => {
          // @ts-ignore - Verificar se o jQuery está disponível e se há requisições AJAX ativas
          return !window.jQuery || jQuery.active === 0;
        }, { timeout: 10000 }).catch(e => {
          console.warn('Timeout aguardando requisições AJAX completarem:', e);
        });
        
        console.log(`Extraindo dados do cliente ${codCliente}...`);
        
        // Extrair dados do cliente da página
        console.log('Extraindo dados do cliente...');
        const dadosCliente: Cliente = await page.evaluate(() => {
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
        
        console.log(`Dados do cliente ${codCliente} extraídos com sucesso`);
        
        // Verificar se os dados do cliente foram realmente encontrados
        if (!dadosCliente.nome && !dadosCliente.contatos.length && !dadosCliente.animais.length) {
          console.warn(`Dados do cliente ${codCliente} parecem estar vazios ou incompletos`);
          
          // Verificar se estamos na página correta
          const isClientePage = await page.evaluate(() => {
            return document.querySelector('#cod_cliente') !== null;
          });
          
          if (!isClientePage) {
            console.error(`Não estamos na página do cliente ${codCliente}. Possível erro de navegação.`);
            return {
              success: false,
              error: `Não foi possível acessar a página do cliente ${codCliente}`
            };
          }
          
          // Se estamos na página correta mas os dados estão vazios, pode ser um cliente sem dados
          console.log(`Cliente ${codCliente} existe, mas tem poucos ou nenhum dado preenchido`);
        }
        
        // Após extrair os dados, navegar para o dashboard para evitar que outras requisições
        // assumam que já estão na página correta
        try {
          console.log('Navegando para o dashboard após extrair dados do cliente...');
          await page.goto('https://dranimal.vetsoft.com.br/m/dashboard/', { 
            waitUntil: 'networkidle',
            timeout: 10000 // 10 segundos de timeout
          });
          console.log('Navegação para o dashboard concluída');
        } catch (navError) {
          console.warn('Aviso: Não foi possível navegar para o dashboard após extrair dados:', navError);
          // Não falhar a requisição se a navegação para o dashboard falhar
        }
        
        return {
          success: true,
          data: dadosCliente
        };
      } catch (error) {
        console.error(`Erro durante a extração de dados do cliente ${codCliente}:`, error);
        throw error;
      }
    }, 120000); // Aguardar até 2 minutos pelo bloqueio
    
    return res.json(result);
    
  } catch (error: any) {
    console.error(`Erro ao buscar dados do cliente ${codCliente}:`, error);
    
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
      error: `Erro ao buscar dados do cliente: ${error.message}`
    });
  }
});

export default router;
