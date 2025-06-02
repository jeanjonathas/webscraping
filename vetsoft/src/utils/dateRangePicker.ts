import { Page } from 'playwright';

/**
 * Função auxiliar para converter nome do mês em texto para índice (0-11)
 * @param mesTexto Nome do mês em português (abreviado ou completo)
 * @returns Índice do mês (0-11) ou -1 se não encontrado
 */
export function obterIndiceMes(mesTexto: string): number {
  const meses: { [key: string]: number } = {
    'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11,
    // Versões completas para garantir
    'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5,
    'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
  };
  
  const mesLower = mesTexto.toLowerCase();
  return meses[mesLower] !== undefined ? meses[mesLower] : -1;
}

/**
 * Configura um período personalizado no DateRangePicker do VetSoft
 * @param page Instância da página Playwright
 * @param dataInicial Data inicial no formato DD/MM/YYYY
 * @param dataFinal Data final no formato DD/MM/YYYY
 * @param seletorCampoData Seletor do campo de data que abre o DateRangePicker (opcional)
 */
export async function configurarPeriodoPersonalizado(
  page: Page, 
  dataInicial: string, 
  dataFinal: string,
  seletorCampoData: string = 'input[name="daterange"]'
): Promise<void> {
  try {
    console.log(`Configurando período personalizado de ${dataInicial} a ${dataFinal}`);
    
    // Converter as datas para o formato esperado (DD/MM/YYYY)
    const [diaInicial, mesInicial, anoInicial] = dataInicial.split('/').map(Number);
    const [diaFinal, mesFinal, anoFinal] = dataFinal.split('/').map(Number);
    
    // Ajustar índices de mês (0-11 para JavaScript)
    const mesInicialIndex = mesInicial - 1;
    
    // Clicar no campo de data para abrir o seletor
    console.log('Clicando no campo de data para abrir o seletor...');
    await page.locator(seletorCampoData).click();
    await page.waitForTimeout(2000);
    
    // Verificar se o DateRangePicker está aberto
    const dateRangePickerVisible = await page.locator('.daterangepicker').isVisible();
    if (!dateRangePickerVisible) {
      console.warn('DateRangePicker não está visível após clicar no campo de data');
      // Tentar clicar novamente
      await page.locator(seletorCampoData).click();
      await page.waitForTimeout(2000);
    }
    
    // Selecionar "Escolher período" nas opções pré-definidas (se disponível)
    const escolherPeriodoSelector = '.ranges li[data-range-key="Escolher período"]';
    const escolherPeriodoExists = await page.locator(escolherPeriodoSelector).count() > 0;
    
    if (escolherPeriodoExists) {
      console.log('Selecionando "Escolher período"...');
      await page.locator(escolherPeriodoSelector).click();
      await page.waitForTimeout(2000);
    }
    
    // Obter o mês e ano atual exibido no calendário
    const mesAnoAtual = await page.locator('.drp-calendar.left .month').textContent();
    if (!mesAnoAtual) {
      throw new Error('Não foi possível obter o mês/ano atual do calendário');
    }
    
    console.log(`Mês/ano atual exibido no calendário: ${mesAnoAtual}`);
    
    // Extrair mês e ano atual do texto (formato "jun 2025")
    const [mesTexto, anoTexto] = mesAnoAtual.trim().split(' ');
    const mesAtualIndex = obterIndiceMes(mesTexto);
    const anoAtual = parseInt(anoTexto);
    
    if (mesAtualIndex === -1) {
      throw new Error(`Não foi possível converter o mês "${mesTexto}" para índice`);
    }
    
    console.log(`Mês atual: ${mesAtualIndex + 1}, Ano atual: ${anoAtual}`);
    console.log(`Mês desejado: ${mesInicial}, Ano desejado: ${anoInicial}`);
    
    // Calcular quantos meses precisamos voltar
    const diferencaMeses = (anoAtual - anoInicial) * 12 + (mesAtualIndex - mesInicialIndex);
    console.log(`Diferença de meses: ${diferencaMeses}`);
    
    // Navegar para o mês/ano inicial
    if (diferencaMeses > 0) {
      console.log(`Clicando no botão 'prev' ${diferencaMeses} vezes para chegar a ${mesInicial}/${anoInicial}...`);
      for (let i = 0; i < diferencaMeses; i++) {
        await page.locator('.drp-calendar.left .prev.available').click();
        await page.waitForTimeout(500); // Pequena pausa entre cliques
      }
      await page.waitForTimeout(1000); // Aguardar um pouco mais após a navegação
    } else if (diferencaMeses < 0) {
      console.log(`Clicando no botão 'next' ${Math.abs(diferencaMeses)} vezes para chegar a ${mesInicial}/${anoInicial}...`);
      for (let i = 0; i < Math.abs(diferencaMeses); i++) {
        await page.locator('.drp-calendar.left .next.available').click();
        await page.waitForTimeout(500); // Pequena pausa entre cliques
      }
      await page.waitForTimeout(1000); // Aguardar um pouco mais após a navegação
    }
    
    // Selecionar o dia inicial no calendário esquerdo
    console.log(`Selecionando dia ${diaInicial} no calendário esquerdo`);
    
    // Estratégia 1: Tentar selecionar pelo texto do dia
    const diasEsquerdo = await page.locator('.drp-calendar.left td.available:not(.off)');
    const diasEsquerdoCount = await diasEsquerdo.count();
    
    let diaInicialEncontrado = false;
    for (let i = 0; i < diasEsquerdoCount; i++) {
      const texto = await diasEsquerdo.nth(i).textContent();
      if (texto && texto.trim() === diaInicial.toString()) {
        await diasEsquerdo.nth(i).click();
        diaInicialEncontrado = true;
        break;
      }
    }
    
    // Estratégia 2: Se não encontrou pelo texto, tentar pelo data-title
    if (!diaInicialEncontrado) {
      console.log('Tentando selecionar dia inicial pelo atributo data-title...');
      
      // Procurar em todas as células do calendário esquerdo
      for (let linha = 0; linha < 6; linha++) {
        for (let coluna = 0; coluna < 7; coluna++) {
          const celula = page.locator(`.drp-calendar.left td[data-title="r${linha}c${coluna}"]`);
          if (await celula.isVisible()) {
            const texto = await celula.textContent();
            if (texto && texto.trim() === diaInicial.toString() && !(await celula.getAttribute('class') || '').includes('off')) {
              await celula.click();
              diaInicialEncontrado = true;
              break;
            }
          }
        }
        if (diaInicialEncontrado) break;
      }
    }
    
    if (!diaInicialEncontrado) {
      console.warn(`Dia ${diaInicial} não encontrado no calendário esquerdo, selecionando o primeiro dia disponível`);
      await diasEsquerdo.first().click();
    }
    
    await page.waitForTimeout(1000);
    
    // Agora precisamos navegar para o mês/ano final (se diferente do inicial)
    if (anoFinal !== anoInicial || mesFinal !== mesInicial) {
      // Calcular a diferença de meses entre data inicial e final
      const diferencaMesesFinal = (anoFinal - anoInicial) * 12 + (mesFinal - mesInicial);
      
      if (diferencaMesesFinal > 0) {
        console.log(`Navegando ${diferencaMesesFinal} meses para frente para chegar a ${mesFinal}/${anoFinal}...`);
        for (let i = 0; i < diferencaMesesFinal; i++) {
          await page.locator('.drp-calendar.right .next.available').click();
          await page.waitForTimeout(500);
        }
      }
      
      await page.waitForTimeout(1000);
    }
    
    // Selecionar o dia final no calendário direito
    console.log(`Selecionando dia ${diaFinal} no calendário direito`);
    
    // Estratégia 1: Tentar selecionar pelo texto do dia
    const diasDireito = await page.locator('.drp-calendar.right td.available:not(.off)');
    const diasDireitoCount = await diasDireito.count();
    
    let diaFinalEncontrado = false;
    for (let i = 0; i < diasDireitoCount; i++) {
      const texto = await diasDireito.nth(i).textContent();
      if (texto && texto.trim() === diaFinal.toString()) {
        await diasDireito.nth(i).click();
        diaFinalEncontrado = true;
        break;
      }
    }
    
    // Estratégia 2: Se não encontrou pelo texto, tentar pelo data-title
    if (!diaFinalEncontrado) {
      console.log('Tentando selecionar dia final pelo atributo data-title...');
      
      // Procurar em todas as células do calendário direito
      for (let linha = 0; linha < 6; linha++) {
        for (let coluna = 0; coluna < 7; coluna++) {
          const celula = page.locator(`.drp-calendar.right td[data-title="r${linha}c${coluna}"]`);
          if (await celula.isVisible()) {
            const texto = await celula.textContent();
            if (texto && texto.trim() === diaFinal.toString() && !(await celula.getAttribute('class') || '').includes('off')) {
              await celula.click();
              diaFinalEncontrado = true;
              break;
            }
          }
        }
        if (diaFinalEncontrado) break;
      }
    }
    
    if (!diaFinalEncontrado) {
      console.warn(`Dia ${diaFinal} não encontrado no calendário direito, selecionando o último dia disponível`);
      await diasDireito.nth(diasDireitoCount - 1).click();
    }
    
    await page.waitForTimeout(1000);
    
    // Clicar no botão Aplicar
    console.log('Clicando no botão Aplicar...');
    const applyBtn = page.locator('.applyBtn');
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.waitForTimeout(2000);
    }
    
    // Verificar se o calendário fechou
    const calendarClosed = !(await page.locator('.daterangepicker').isVisible());
    console.log(`Calendário fechou após selecionar período: ${calendarClosed}`);
    
  } catch (error) {
    console.error('Erro ao configurar período personalizado:', error);
    throw error;
  }
}

// Função para clicar no botão Filtrar após configurar período personalizado
export async function clicarBotaoFiltrar(page: any): Promise<void> {
  try {
    // Clicar no botão Filtrar para aplicar o filtro
    console.log('Clicando no botão Filtrar...');
    try {
      // Tentar com o seletor mais específico primeiro
      const filtrarBtn = page.locator('button.btn-primary').filter({ hasText: 'Filtrar' });
      if (await filtrarBtn.count() > 0) {
        await filtrarBtn.click();
      } else {
        // Tentar com o seletor por atributo
        await page.locator('button.btn-primary[data-original-title="Aplicar Filtros"]').click({ timeout: 5000 });
      }
    } catch (e) {
      console.log('Tentando seletor alternativo para o botão Filtrar...');
      try {
        // Tentar com o seletor por texto
        await page.getByRole('button', { name: 'Filtrar' }).click({ timeout: 5000 });
      } catch (e2) {
        console.log('Tentando seletor genérico para o botão Filtrar...');
        // Tentar com um seletor mais genérico
        await page.locator('button.btn-primary').first().click({ timeout: 5000 });
      }
    }
    
    // Aguardar o carregamento dos dados
    console.log('Aguardando carregamento dos dados após filtrar...');
    await page.waitForTimeout(10000); // Aumentar para 10 segundos
    
    // Verificar se há overlay de carregamento e aguardar que desapareça
    const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
    if (hasLoadingOverlay) {
      console.log('Detectado overlay de carregamento, aguardando finalizar...');
      await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 60000 });
    }
  } catch (error) {
    console.error('Erro ao clicar no botão filtrar:', error);
    throw error;
  }
}