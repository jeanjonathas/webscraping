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
