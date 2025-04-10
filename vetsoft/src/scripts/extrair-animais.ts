import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'dranimal'
  }
});

interface Animal {
  codigo: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  data_nascimento: string | null;
  data_cadastro: string;
  tutor_codigo: string;
  tutor_nome: string;
}

async function extrairAnimaisPorAno(ano: number) {
  console.log(`Iniciando extração de animais para o ano ${ano}`);
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Login
    await page.goto('https://dranimal.vetsoft.com.br/');
    await page.getByRole('textbox', { name: 'Usuário *' }).fill(process.env.VETSOFT_USER || '');
    await page.getByRole('textbox', { name: 'Senha * ' }).fill(process.env.VETSOFT_PASSWORD || '');
    await page.getByRole('textbox', { name: 'Senha * ' }).press('Enter');
    
    // Aguardar carregamento da página após login
    await page.waitForSelector('.navbar-brand');
    console.log('Login realizado com sucesso');
    
    // Navegar para relatórios
    await page.getByRole('link', { name: ' Relatórios' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Lista de Animais' }).click();
    await page.waitForTimeout(2000);
    
    // Configurar visualização
    await page.getByRole('button', { name: '+ ' }).click();
    await page.getByLabel('Visualizar').selectOption('3'); // Selecionar visualização completa
    
    // Selecionar período do ano
    await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
    await page.getByText('Escolher período').click();
    
    // Selecionar data inicial (1 de janeiro do ano)
    console.log(`Selecionando período de 01/01/${ano} a 31/12/${ano}`);
    await selecionarDataPeriodo(page, ano);
    
    // Filtrar
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(3000); // Aguardar carregamento dos resultados
    
    // Aguardar carregamento da tabela
    await page.waitForSelector('#datagrid_RelatorioAnimais');
    
    // Extrair dados
    const animais = await extrairDadosDaTabela(page);
    console.log(`Extraídos ${animais.length} animais`);
    
    // Salvar no Supabase
    await salvarNoSupabase(animais);
    
    // Salvar em arquivo JSON como backup
    const outputDir = path.join(__dirname, '..', '..', 'dados');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, `animais_${ano}.json`), 
      JSON.stringify(animais, null, 2)
    );
    
    console.log(`Dados salvos com sucesso em dados/animais_${ano}.json`);
    
  } catch (error) {
    console.error('Erro durante a extração:', error);
  } finally {
    await browser.close();
  }
}

async function selecionarDataPeriodo(page: any, ano: number) {
  // Método simplificado para selecionar o período de um ano inteiro
  // Selecionar data inicial (1 de janeiro)
  await page.evaluate((ano: number) => {
    // Encontrar o seletor de mês/ano e definir para janeiro do ano desejado
    const seletorMesAno = document.querySelector('.datepicker-switch');
    if (seletorMesAno) {
      seletorMesAno.dispatchEvent(new MouseEvent('click'));
    }
    
    // Clicar no ano
    const seletorAno = Array.from(document.querySelectorAll('.year'))
      .find(el => el.textContent === ano.toString());
    if (seletorAno) {
      seletorAno.dispatchEvent(new MouseEvent('click'));
    }
    
    // Clicar em janeiro
    const seletorJaneiro = Array.from(document.querySelectorAll('.month'))
      .find(el => el.textContent === 'Jan');
    if (seletorJaneiro) {
      seletorJaneiro.dispatchEvent(new MouseEvent('click'));
    }
    
    // Clicar no dia 1
    const seletorDia1 = Array.from(document.querySelectorAll('.day:not(.old):not(.new)'))
      .find(el => el.textContent === '1');
    if (seletorDia1) {
      seletorDia1.dispatchEvent(new MouseEvent('click'));
    }
  }, ano);
  
  await page.waitForTimeout(500);
  
  // Selecionar data final (31 de dezembro)
  await page.evaluate((ano: number) => {
    // Encontrar o seletor de mês/ano e definir para dezembro do ano desejado
    const seletorMesAno = document.querySelectorAll('.datepicker-switch')[1];
    if (seletorMesAno) {
      seletorMesAno.dispatchEvent(new MouseEvent('click'));
    }
    
    // Clicar no ano
    const seletorAno = Array.from(document.querySelectorAll('.year'))
      .find(el => el.textContent === ano.toString());
    if (seletorAno) {
      seletorAno.dispatchEvent(new MouseEvent('click'));
    }
    
    // Clicar em dezembro
    const seletorDezembro = Array.from(document.querySelectorAll('.month'))
      .find(el => el.textContent === 'Dez');
    if (seletorDezembro) {
      seletorDezembro.dispatchEvent(new MouseEvent('click'));
    }
    
    // Clicar no dia 31
    const seletorDia31 = Array.from(document.querySelectorAll('.day:not(.old):not(.new)'))
      .find(el => el.textContent === '31');
    if (seletorDia31) {
      seletorDia31.dispatchEvent(new MouseEvent('click'));
    }
  }, ano);
}

async function extrairDadosDaTabela(page: any): Promise<Animal[]> {
  return await page.evaluate(() => {
    const animais: Animal[] = [];
    const tabela = document.querySelector('#datagrid_RelatorioAnimais');
    if (!tabela) return animais;
    
    const linhas = tabela.querySelectorAll('tbody tr');
    
    linhas.forEach(linha => {
      const colunas = linha.querySelectorAll('td');
      if (colunas.length < 8) return;
      
      // Extrair código do animal do link
      const linkAnimal = colunas[1].querySelector('a');
      const codigoAnimal = linkAnimal ? 
        new URLSearchParams(linkAnimal.getAttribute('href')?.split('?')[1] || '').get('codigo') || '' : '';
      
      // Extrair código do tutor do link
      const linkTutor = colunas[7].querySelector('a');
      const codigoTutor = linkTutor ? 
        new URLSearchParams(linkTutor.getAttribute('href')?.split('?')[1] || '').get('codigo') || '' : '';
      
      const animal: Animal = {
        codigo: codigoAnimal,
        nome: colunas[1].textContent?.trim() || '',
        especie: colunas[2].textContent?.trim() || '',
        raca: colunas[3].textContent?.trim() || '',
        sexo: colunas[4].textContent?.trim() || '',
        data_nascimento: colunas[5].textContent?.trim() || null,
        data_cadastro: colunas[6].textContent?.trim() || '',
        tutor_codigo: codigoTutor,
        tutor_nome: colunas[7].textContent?.trim() || ''
      };
      
      animais.push(animal);
    });
    
    return animais;
  });
}

async function salvarNoSupabase(animais: Animal[]) {
  console.log(`Salvando ${animais.length} animais no Supabase...`);
  
  let sucessos = 0;
  let falhas = 0;
  
  for (const animal of animais) {
    try {
      // Converter datas para formato ISO
      let dataNascimento = null;
      if (animal.data_nascimento) {
        const partesData = animal.data_nascimento.split('/');
        if (partesData.length === 3) {
          dataNascimento = `${partesData[2]}-${partesData[1]}-${partesData[0]}`;
        }
      }
      
      let dataCadastro = null;
      if (animal.data_cadastro) {
        const partesData = animal.data_cadastro.split('/');
        if (partesData.length === 3) {
          dataCadastro = `${partesData[2]}-${partesData[1]}-${partesData[0]}`;
        }
      }
      
      const { error } = await supabase
        .from('animais')
        .insert([{
          codigo: animal.codigo,
          nome: animal.nome,
          especie: animal.especie,
          raca: animal.raca,
          sexo: animal.sexo,
          data_nascimento: dataNascimento,
          data_cadastro: dataCadastro,
          tutor_codigo: animal.tutor_codigo,
          tutor_nome: animal.tutor_nome
        }]);
      
      if (error) {
        console.error(`Erro ao inserir animal ${animal.codigo}:`, error);
        falhas++;
      } else {
        sucessos++;
      }
    } catch (error) {
      console.error(`Exceção ao inserir animal ${animal.codigo}:`, error);
      falhas++;
    }
  }
  
  console.log(`Inserção concluída: ${sucessos} sucessos, ${falhas} falhas`);
}

// Executar para o ano de 2022
extrairAnimaisPorAno(2022).catch(console.error);
