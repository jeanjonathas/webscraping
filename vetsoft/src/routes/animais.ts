import { Router } from 'express';
import { config } from '../config';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { 
  navigateToRelatorioAnimais, 
  resetSession 
} from '../utils/browserSession';

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
    
    // Usar o modo headless com base no parâmetro da query
    const showBrowser = req.query.show === 'true';
    const headless = !showBrowser;
    
    // Verificar se deve forçar a atualização da página
    const forceRefresh = req.query.refresh === 'true';
    
    // Navegar para a página de relatórios de animais com o ano especificado
    const page = await navigateToRelatorioAnimais(headless, forceRefresh, ano);
    
    // Capturar screenshot para debug
    await page.screenshot({ path: `animais-${ano}-screenshot.png` });
    console.log(`Screenshot salvo em animais-${ano}-screenshot.png`);
    
    // Extrair dados da tabela de animais
    console.log('Extraindo dados de animais...');
    const animais: Animal[] = await page.evaluate(() => {
      const dados: any[] = [];
      
      // Tentar encontrar a tabela pelo ID
      const tabela = document.querySelector('#grid_RelatorioAnimais');
      console.log('Buscando tabela de animais...');
      
      if (!tabela) {
        console.log('Tabela não encontrada pelo ID, tentando outros seletores...');
        // Tentar encontrar por outros seletores
        const todasTabelas = document.querySelectorAll('table');
        console.log('Total de tabelas na página:', todasTabelas.length);
        
        // Converter NodeList para Array para poder usar o filter
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
              conteudoColunas.push(colunas[i].textContent?.trim());
            }
            console.log('Conteúdo das colunas:', conteudoColunas.join(' | '));
            
            if (colunas.length >= 8) {
              // Extrair dados da tabela
              const animalLink = colunas[1].querySelector('a');
              let codigoAnimal = "";
              let nomeAnimal = "";
              
              if (animalLink) {
                nomeAnimal = animalLink.textContent?.trim() || "";
                
                // Extrair o código do animal do link
                const href = animalLink.getAttribute('href') || "";
                const match = href.match(/cod_animal=(\d+)/);
                if (match && match[1]) {
                  codigoAnimal = match[1];
                }
              } else {
                nomeAnimal = colunas[1].textContent?.trim() || "";
              }
              
              // Extrair espécie e raça
              let especie = "";
              let raca = "";
              const especieRaca = colunas[2].textContent?.trim() || "";
              
              if (especieRaca.includes('/')) {
                const partes = especieRaca.split('/');
                especie = partes[0].trim();
                raca = partes.slice(1).join('/').trim();
              } else {
                especie = especieRaca;
              }
              
              // Extrair sexo
              const sexo = colunas[3].textContent?.trim() || "";
              
              // Extrair data de nascimento
              const dataNascimento = colunas[4].textContent?.trim() || "";
              
              // Extrair data de cadastro
              const dataCadastro = colunas[5].textContent?.trim() || "";
              
              // Extrair data de óbito
              const dataObito = colunas[6].textContent?.trim() || null;
              
              // Extrair o código do tutor do link
              const tutorLink = colunas[7].querySelector('a');
              let codigoTutor = "";
              let nomeTutor = "";
              
              if (tutorLink) {
                nomeTutor = tutorLink.textContent?.trim() || "";
                
                // Extrair o código do tutor do link
                const href = tutorLink.getAttribute('href') || "";
                const match = href.match(/cod_cliente=(\d+)/);
                if (match && match[1]) {
                  codigoTutor = match[1];
                }
              } else {
                nomeTutor = colunas[7].textContent?.trim() || "";
              }
              
              // Adicionar dados ao array
              dados.push({
                codigo: codigoAnimal,
                nome: nomeAnimal,
                especie: especie,
                raca: raca,
                sexo: sexo,
                data_nascimento: dataNascimento,
                data_cadastro: dataCadastro,
                data_obito: dataObito,
                tutor_codigo: codigoTutor,
                tutor_nome: nomeTutor,
                codigo_internacao: null
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
          conteudoColunas.push(colunas[i].textContent?.trim());
        }
        console.log('Conteúdo das colunas:', conteudoColunas.join(' | '));
        
        if (colunas.length >= 8) {
          // Extrair dados da tabela
          const animalLink = colunas[1].querySelector('a');
          let codigoAnimal = "";
          let nomeAnimal = "";
          let dataObito = null;
          
          if (animalLink) {
            nomeAnimal = animalLink.textContent?.trim() || "";
            
            // Extrair o código do animal do link
            const href = animalLink.getAttribute('href') || "";
            const match = href.match(/cod_animal=(\d+)/);
            if (match && match[1]) {
              codigoAnimal = match[1];
            }
          } else {
            nomeAnimal = colunas[1].textContent?.trim() || "";
          }
          
          // Extrair espécie e raça
          let especie = "";
          let raca = "";
          const especieRaca = colunas[2].textContent?.trim() || "";
          
          if (especieRaca.includes('/')) {
            const partes = especieRaca.split('/');
            especie = partes[0].trim();
            raca = partes.slice(1).join('/').trim();
          } else {
            especie = especieRaca;
          }
          
          // Extrair sexo
          const sexo = colunas[3].textContent?.trim() || "";
          
          // Extrair data de nascimento
          const dataNascimento = colunas[4].textContent?.trim() || "";
          
          // Extrair data de cadastro
          const dataCadastro = colunas[5].textContent?.trim() || "";
          
          // Extrair data de óbito
          dataObito = colunas[6].textContent?.trim() || null;
          
          // Extrair o código do tutor do link
          const tutorLink = colunas[7].querySelector('a');
          let codigoTutor = "";
          let nomeTutor = "";
          
          if (tutorLink) {
            nomeTutor = tutorLink.textContent?.trim() || "";
            
            // Extrair o código do tutor do link
            const href = tutorLink.getAttribute('href') || "";
            const match = href.match(/cod_cliente=(\d+)/);
            if (match && match[1]) {
              codigoTutor = match[1];
            }
          } else {
            nomeTutor = colunas[7].textContent?.trim() || "";
          }
          
          // Adicionar dados ao array
          dados.push({
            codigo: codigoAnimal,
            nome: nomeAnimal,
            especie: especie,
            raca: raca,
            sexo: sexo,
            data_nascimento: dataNascimento,
            data_cadastro: dataCadastro,
            data_obito: dataObito,
            tutor_codigo: codigoTutor,
            tutor_nome: nomeTutor,
            codigo_internacao: null
          });
        }
      }
      
      return dados;
    });
    console.log(`Extraídos ${animais.length} animais`);
    
    return res.json({
      success: true,
      data: animais,
      total: animais.length
    });
    
  } catch (error: any) {
    console.error('Erro durante a extração:', error);
    
    // Se ocorrer um erro, tenta resetar a sessão para a próxima tentativa
    await resetSession();
    
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
    
    // Usar o modo headless com base no parâmetro da query
    const showBrowser = req.query.show === 'true';
    const headless = !showBrowser;
    
    // Verificar se deve forçar a atualização da página
    const forceRefresh = req.query.refresh === 'true';
    
    // Navegar para a página de relatórios de animais com o ano especificado
    const page = await navigateToRelatorioAnimais(headless, forceRefresh, ano);
    
    // Extrair dados da tabela de animais (mesmo código da rota anterior)
    console.log('Extraindo dados de animais para Excel...');
    const animais: Animal[] = await page.evaluate(() => {
      const dados: any[] = [];
      
      // Tentar encontrar a tabela pelo ID
      const tabela = document.querySelector('#grid_RelatorioAnimais');
      console.log('Buscando tabela de animais...');
      
      if (!tabela) {
        console.log('Tabela não encontrada pelo ID, tentando outros seletores...');
        // Tentar encontrar por outros seletores
        const todasTabelas = document.querySelectorAll('table');
        console.log('Total de tabelas na página:', todasTabelas.length);
        
        // Converter NodeList para Array para poder usar o filter
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
              conteudoColunas.push(colunas[i].textContent?.trim());
            }
            console.log('Conteúdo das colunas:', conteudoColunas.join(' | '));
            
            if (colunas.length >= 8) {
              // Extrair dados da tabela
              const animalLink = colunas[1].querySelector('a');
              let codigoAnimal = "";
              let nomeAnimal = "";
              
              if (animalLink) {
                nomeAnimal = animalLink.textContent?.trim() || "";
                
                // Extrair o código do animal do link
                const href = animalLink.getAttribute('href') || "";
                const match = href.match(/cod_animal=(\d+)/);
                if (match && match[1]) {
                  codigoAnimal = match[1];
                }
              } else {
                nomeAnimal = colunas[1].textContent?.trim() || "";
              }
              
              // Extrair espécie e raça
              let especie = "";
              let raca = "";
              const especieRaca = colunas[2].textContent?.trim() || "";
              
              if (especieRaca.includes('/')) {
                const partes = especieRaca.split('/');
                especie = partes[0].trim();
                raca = partes.slice(1).join('/').trim();
              } else {
                especie = especieRaca;
              }
              
              // Extrair sexo
              const sexo = colunas[3].textContent?.trim() || "";
              
              // Extrair data de nascimento
              const dataNascimento = colunas[4].textContent?.trim() || "";
              
              // Extrair data de cadastro
              const dataCadastro = colunas[5].textContent?.trim() || "";
              
              // Extrair data de óbito
              const dataObito = colunas[6].textContent?.trim() || null;
              
              // Extrair o código do tutor do link
              const tutorLink = colunas[7].querySelector('a');
              let codigoTutor = "";
              let nomeTutor = "";
              
              if (tutorLink) {
                nomeTutor = tutorLink.textContent?.trim() || "";
                
                // Extrair o código do tutor do link
                const href = tutorLink.getAttribute('href') || "";
                const match = href.match(/cod_cliente=(\d+)/);
                if (match && match[1]) {
                  codigoTutor = match[1];
                }
              } else {
                nomeTutor = colunas[7].textContent?.trim() || "";
              }
              
              // Adicionar dados ao array
              dados.push({
                codigo: codigoAnimal,
                nome: nomeAnimal,
                especie: especie,
                raca: raca,
                sexo: sexo,
                data_nascimento: dataNascimento,
                data_cadastro: dataCadastro,
                data_obito: dataObito,
                tutor_codigo: codigoTutor,
                tutor_nome: nomeTutor,
                codigo_internacao: null
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
          conteudoColunas.push(colunas[i].textContent?.trim());
        }
        console.log('Conteúdo das colunas:', conteudoColunas.join(' | '));
        
        if (colunas.length >= 8) {
          // Extrair dados da tabela
          const animalLink = colunas[1].querySelector('a');
          let codigoAnimal = "";
          let nomeAnimal = "";
          let dataObito = null;
          
          if (animalLink) {
            nomeAnimal = animalLink.textContent?.trim() || "";
            
            // Extrair o código do animal do link
            const href = animalLink.getAttribute('href') || "";
            const match = href.match(/cod_animal=(\d+)/);
            if (match && match[1]) {
              codigoAnimal = match[1];
            }
          } else {
            nomeAnimal = colunas[1].textContent?.trim() || "";
          }
          
          // Extrair espécie e raça
          let especie = "";
          let raca = "";
          const especieRaca = colunas[2].textContent?.trim() || "";
          
          if (especieRaca.includes('/')) {
            const partes = especieRaca.split('/');
            especie = partes[0].trim();
            raca = partes.slice(1).join('/').trim();
          } else {
            especie = especieRaca;
          }
          
          // Extrair sexo
          const sexo = colunas[3].textContent?.trim() || "";
          
          // Extrair data de nascimento
          const dataNascimento = colunas[4].textContent?.trim() || "";
          
          // Extrair data de cadastro
          const dataCadastro = colunas[5].textContent?.trim() || "";
          
          // Extrair data de óbito
          dataObito = colunas[6].textContent?.trim() || null;
          
          // Extrair o código do tutor do link
          const tutorLink = colunas[7].querySelector('a');
          let codigoTutor = "";
          let nomeTutor = "";
          
          if (tutorLink) {
            nomeTutor = tutorLink.textContent?.trim() || "";
            
            // Extrair o código do tutor do link
            const href = tutorLink.getAttribute('href') || "";
            const match = href.match(/cod_cliente=(\d+)/);
            if (match && match[1]) {
              codigoTutor = match[1];
            }
          } else {
            nomeTutor = colunas[7].textContent?.trim() || "";
          }
          
          // Adicionar dados ao array
          dados.push({
            codigo: codigoAnimal,
            nome: nomeAnimal,
            especie: especie,
            raca: raca,
            sexo: sexo,
            data_nascimento: dataNascimento,
            data_cadastro: dataCadastro,
            data_obito: dataObito,
            tutor_codigo: codigoTutor,
            tutor_nome: nomeTutor,
            codigo_internacao: null
          });
        }
      }
      
      return dados;
    });
    
    console.log(`Extraídos ${animais.length} animais`);
    
    // Criar planilha Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(animais);
    
    // Ajustar largura das colunas
    const colWidths = [
      { wch: 10 }, // código
      { wch: 30 }, // nome
      { wch: 15 }, // espécie
      { wch: 15 }, // raça
      { wch: 10 }, // sexo
      { wch: 15 }, // data_nascimento
      { wch: 15 }, // data_cadastro
      { wch: 15 }, // data_obito
      { wch: 10 }, // tutor_codigo
      { wch: 30 }  // tutor_nome
    ];
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, `Animais ${ano}`);
    
    // Gerar o arquivo Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Configurar headers para download
    res.setHeader('Content-Disposition', `attachment; filename="animais-${ano}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // Enviar o arquivo
    return res.send(Buffer.from(excelBuffer));
    
  } catch (error: any) {
    console.error('Erro durante a exportação:', error);
    
    // Se ocorrer um erro, tenta resetar a sessão para a próxima tentativa
    await resetSession();
    
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
        error: 'Nenhum animal fornecido para salvar'
      });
    }
    
    console.log(`Iniciando salvamento de ${animais.length} animais no banco de dados`);
    
    const resultados = [];
    const erros = [];
    
    for (const animal of animais) {
      try {
        // Verificar se o cliente existe
        const { data: clienteExistente, error: erroCliente } = await supabase
          .from('clientes')
          .select('*')
          .eq('codigo', animal.tutor_codigo)
          .single();
        
        if (erroCliente && erroCliente.code !== 'PGRST116') {
          console.error(`Erro ao verificar cliente ${animal.tutor_codigo}:`, erroCliente);
          erros.push({
            animal: animal.codigo,
            erro: `Erro ao verificar cliente: ${erroCliente.message}`
          });
          continue;
        }
        
        // Se o cliente não existir, criar um básico
        if (!clienteExistente) {
          console.log(`Cliente ${animal.tutor_codigo} não encontrado, criando...`);
          
          const { error: erroNovoCliente } = await supabase
            .from('clientes')
            .insert({
              codigo: animal.tutor_codigo,
              nome: animal.tutor_nome,
              data_cadastro: new Date().toISOString()
            });
          
          if (erroNovoCliente) {
            console.error(`Erro ao criar cliente ${animal.tutor_codigo}:`, erroNovoCliente);
            erros.push({
              animal: animal.codigo,
              erro: `Erro ao criar cliente: ${erroNovoCliente.message}`
            });
            continue;
          }
          
          console.log(`Cliente ${animal.tutor_codigo} criado com sucesso`);
        }
        
        // Verificar se o animal já existe
        const { data: animalExistente, error: erroAnimal } = await supabase
          .from('animais')
          .select('*')
          .eq('codigo', animal.codigo)
          .single();
        
        if (erroAnimal && erroAnimal.code !== 'PGRST116') {
          console.error(`Erro ao verificar animal ${animal.codigo}:`, erroAnimal);
          erros.push({
            animal: animal.codigo,
            erro: `Erro ao verificar animal: ${erroAnimal.message}`
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
          data_nascimento: animal.data_nascimento,
          data_cadastro: animal.data_cadastro,
          data_obito: animal.data_obito,
          tutor_codigo: animal.tutor_codigo
        };
        
        let resultado;
        
        // Se o animal já existir, atualizar
        if (animalExistente) {
          console.log(`Animal ${animal.codigo} encontrado, atualizando...`);
          
          const { data: animalAtualizado, error: erroAtualizar } = await supabase
            .from('animais')
            .update(dadosAnimal)
            .eq('codigo', animal.codigo)
            .select()
            .single();
          
          if (erroAtualizar) {
            console.error(`Erro ao atualizar animal ${animal.codigo}:`, erroAtualizar);
            erros.push({
              animal: animal.codigo,
              erro: `Erro ao atualizar animal: ${erroAtualizar.message}`
            });
            continue;
          }
          
          resultado = { ...animalAtualizado, acao: 'atualizado' };
          console.log(`Animal ${animal.codigo} atualizado com sucesso`);
        } else {
          // Se o animal não existir, criar
          console.log(`Animal ${animal.codigo} não encontrado, criando...`);
          
          const { data: novoAnimal, error: erroCriar } = await supabase
            .from('animais')
            .insert(dadosAnimal)
            .select()
            .single();
          
          if (erroCriar) {
            console.error(`Erro ao criar animal ${animal.codigo}:`, erroCriar);
            erros.push({
              animal: animal.codigo,
              erro: `Erro ao criar animal: ${erroCriar.message}`
            });
            continue;
          }
          
          resultado = { ...novoAnimal, acao: 'criado' };
          console.log(`Animal ${animal.codigo} criado com sucesso`);
        }
        
        resultados.push(resultado);
      } catch (error: any) {
        console.error(`Erro ao processar animal ${animal.codigo}:`, error);
        erros.push({
          animal: animal.codigo,
          erro: error.message || 'Erro desconhecido'
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