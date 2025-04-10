import { chromium } from 'playwright';
import { config } from '../config';
import { supabase } from '../lib/supabase';

async function syncClientes() {
  console.log('Iniciando sincronização de clientes...');

  try {
    const browser = await chromium.launch({
      headless: true
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('Iniciando navegação...');
    await page.goto('https://dranimal.vetsoft.com.br/', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    
    await page.waitForTimeout(2000);
    
    console.log('Página carregada, realizando login...');
    await page.getByRole('textbox', { name: 'Usuário *' }).fill(config.vetsoft.username!);
    await page.getByRole('textbox', { name: 'Senha * ' }).fill(config.vetsoft.password!);
    await page.getByRole('textbox', { name: 'Senha * ' }).press('Enter');
    
    console.log('Login realizado, acessando Clientes...');
    await page.waitForTimeout(3000);
    await page.getByRole('link', { name: ' Clientes' }).click();

    // Abre o filtro
    await page.getByRole('button', { name: '+ ' }).click();
    
    // Seleciona "Hoje" como data de cadastro
    await page.getByRole('textbox', { name: 'Data Cadastro' }).click();
    await page.getByText('Hoje').click();

    // Aplica o filtro
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(2000);

    // Pega todos os clientes da tabela
    const rows = await page.locator('#grid_Cliente tbody tr').all();
    
    for (const row of rows) {
      // Pega o ID da linha que contém o código do cliente
      const rowId = await row.getAttribute('id');
      if (!rowId) continue;
      
      const codigo = rowId.replace('grid_Cliente_row', '');
      
      // Clica no botão de detalhes do cliente
      await row.getByRole('button', { name: '' }).click();
      await page.waitForTimeout(1000);

      // Extrai informações do cliente
      const nome = await row.locator('td:nth-child(2)').textContent() || '';

      // Verifica se o cliente já existe no Supabase
      const { data: clienteExistente } = await supabase
        .from('clientes')
        .select()
        .eq('codigo', codigo)
        .single();

      if (!clienteExistente) {
        // Insere o cliente no Supabase
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            codigo,
            nome: nome.trim(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (clienteError) {
          console.error(`Erro ao inserir cliente ${nome}:`, clienteError);
          continue;
        }

        // Na página de detalhes, vai para a aba de animais
        await page.getByRole('tab', { name: 'Animais' }).click();
        await page.waitForTimeout(1000);

        // Pega todos os animais da tabela
        const animaisRows = await page.locator('#grid_Animal tbody tr').all();

        for (const animalRow of animaisRows) {
          const animalNome = await animalRow.locator('td:nth-child(2)').textContent() || '';
          const animalId = await animalRow.getAttribute('id');
          
          if (animalId) {
            const animalCodigo = animalId.replace('grid_Animal_row', '');
            
            // Insere o animal no Supabase
            const { error: animalError } = await supabase
              .from('animais')
              .insert({
                codigo: animalCodigo,
                nome: animalNome.trim(),
                cliente_id: cliente.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (animalError) {
              console.error(`Erro ao inserir animal ${animalNome}:`, animalError);
            } else {
              console.log(`Animal ${animalNome} inserido com sucesso`);
            }
          }
        }

        console.log(`Cliente ${nome} e seus animais inseridos com sucesso`);
      } else {
        console.log(`Cliente ${nome} já existe, pulando...`);
      }

      // Fecha o modal de detalhes
      await page.getByRole('button', { name: '×' }).click();
      await page.waitForTimeout(1000);
    }

    await browser.close();
    console.log('Sincronização concluída!');

  } catch (error) {
    console.error('Erro durante a sincronização:', error);
  }
}

// Executa a sincronização
syncClientes();
