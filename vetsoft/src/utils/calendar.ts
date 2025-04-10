import { Page } from 'playwright';

// Função auxiliar para selecionar uma data no calendário
export async function selecionarData(page: Page, data: string, calendario: 'esquerda' | 'direita' = 'esquerda') {
  const [diaComZero, mesComZero] = data.split('/');
  const dia = diaComZero.replace(/^0+/, '');
  const mes = parseInt(mesComZero);
  console.log(`Procurando dia ${dia} do mês ${mes}...`);
  
  // Determina qual calendário usar
  const calendarIndex = calendario === 'esquerda' ? 0 : 1;
  const calendar = page.locator('.calendar-table').nth(calendarIndex);
  await calendar.waitFor({ state: 'visible' });
  
  // Pega o mês do calendário
  const mesAtual = await calendar.locator('.month').textContent();
  console.log(`Mês do calendário ${calendario}: ${mesAtual}`);
  
  // Encontra a célula do dia
  const cells = await calendar.locator('td.available').all();
  let targetCell;
  
  for (const cell of cells) {
    const text = await cell.textContent();
    if (text?.trim() === dia) {
      const classes = await cell.getAttribute('class');
      if (!classes?.includes('off')) {
        targetCell = cell;
        const dataTitle = await cell.getAttribute('data-title');
        console.log(`Encontrado dia ${dia} com data-title=${dataTitle}`);
        break;
      }
    }
  }
  
  if (!targetCell) {
    throw new Error(`Dia ${dia} não encontrado no calendário ${calendario}`);
  }
  
  await targetCell.click();
  return targetCell;
}

// Função para selecionar o período de um ano inteiro (1 de janeiro a 31 de dezembro)
export async function selecionarDataPeriodo(page: Page, ano: number) {
  // Método simplificado para selecionar o período de um ano inteiro
  console.log(`Selecionando período de 01/01/${ano} a 31/12/${ano}`);
  
  // Selecionar data inicial (1 de janeiro)
  await page.evaluate((ano) => {
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
  await page.evaluate((ano) => {
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
