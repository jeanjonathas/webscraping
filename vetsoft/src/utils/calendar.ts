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
  // Método para navegar até o ano desejado e selecionar datas
  console.log(`Selecionando período de 01/01/${ano} a 31/12/${ano}`);
  
  // Selecionar data inicial (1 de janeiro)
  // Primeiro, vamos clicar no seletor de mês para abrir o calendário
  await page.waitForTimeout(1000);
  
  // Navegação manual para o ano e mês desejados
  await page.evaluate(async (targetYear) => {
    // Função para clicar em um elemento
    function clickElement(element: Element | null) {
      if (element) {
        element.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      }
    }
    
    // Abrir o seletor de mês/ano no primeiro calendário
    const dateSwitch = document.querySelector('.datepicker-switch');
    clickElement(dateSwitch);
    
    // Aguardar um pouco para a animação
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Abrir o seletor de ano
    const yearSwitch = document.querySelector('.datepicker-switch');
    clickElement(yearSwitch);
    
    // Aguardar um pouco para a animação
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Navegar pelos anos até encontrar o desejado
    let foundYear = false;
    let attempts = 0;
    const maxAttempts = 20; // Limite de tentativas para evitar loop infinito
    
    while (!foundYear && attempts < maxAttempts) {
      // Verificar se o ano desejado está visível
      const yearElements = Array.from(document.querySelectorAll('.year'));
      const targetYearElement = yearElements.find(el => el.textContent === targetYear.toString());
      
      if (targetYearElement) {
        // Encontramos o ano, vamos clicar nele
        clickElement(targetYearElement);
        foundYear = true;
        
        // Aguardar um pouco para a animação
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Selecionar janeiro
        const monthElements = Array.from(document.querySelectorAll('.month'));
        const janElement = monthElements.find(el => el.textContent === 'Jan');
        if (janElement) {
          clickElement(janElement);
          
          // Aguardar um pouco para a animação
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Selecionar dia 1
          const dayElements = Array.from(document.querySelectorAll('.day:not(.old):not(.new)'));
          const day1Element = dayElements.find(el => el.textContent === '1');
          if (day1Element) {
            clickElement(day1Element);
          }
        }
      } else {
        // Ano não encontrado, vamos navegar para anos anteriores
        const prevButton = document.querySelector('.prev');
        if (prevButton) {
          clickElement(prevButton);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      attempts++;
    }
    
    // Aguardar um pouco antes de prosseguir
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Agora vamos selecionar a data final (31 de dezembro)
    // Abrir o seletor de mês/ano no segundo calendário
    const dateSwitch2 = document.querySelectorAll('.datepicker-switch')[1];
    clickElement(dateSwitch2);
    
    // Aguardar um pouco para a animação
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Abrir o seletor de ano
    const yearSwitch2 = document.querySelectorAll('.datepicker-switch')[1];
    clickElement(yearSwitch2);
    
    // Aguardar um pouco para a animação
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Navegar pelos anos até encontrar o desejado
    foundYear = false;
    attempts = 0;
    
    while (!foundYear && attempts < maxAttempts) {
      // Verificar se o ano desejado está visível
      const yearElements = Array.from(document.querySelectorAll('.year'));
      const targetYearElement = yearElements.find(el => el.textContent === targetYear.toString());
      
      if (targetYearElement) {
        // Encontramos o ano, vamos clicar nele
        clickElement(targetYearElement);
        foundYear = true;
        
        // Aguardar um pouco para a animação
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Selecionar dezembro
        const monthElements = Array.from(document.querySelectorAll('.month'));
        const decElement = monthElements.find(el => el.textContent === 'Dez');
        if (decElement) {
          clickElement(decElement);
          
          // Aguardar um pouco para a animação
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Selecionar dia 31
          const dayElements = Array.from(document.querySelectorAll('.day:not(.old):not(.new)'));
          const day31Element = dayElements.find(el => el.textContent === '31');
          if (day31Element) {
            clickElement(day31Element);
          }
        }
      } else {
        // Ano não encontrado, vamos navegar para anos anteriores
        const prevButton = document.querySelector('.prev');
        if (prevButton) {
          clickElement(prevButton);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      attempts++;
    }
  }, ano);
  
  // Aguardar para garantir que a seleção foi concluída
  await page.waitForTimeout(2000);
}
