import { Page } from 'playwright';

/**
 * Função auxiliar para converter nome do mês em texto para índice (0-11)
 * @param mesTexto Nome do mês em português (abreviado ou completo)
 * @returns Índice do mês (0-11) ou -1 se não encontrado
 */
export function converterMesTextoParaIndice(mesTexto: string): number {
  const meses = {
    'janeiro': 0, 'jan': 0,
    'fevereiro': 1, 'fev': 1,
    'março': 2, 'mar': 2,
    'abril': 3, 'abr': 3,
    'maio': 4, 'mai': 4,
    'junho': 5, 'jun': 5,
    'julho': 6, 'jul': 6,
    'agosto': 7, 'ago': 7,
    'setembro': 8, 'set': 8,
    'outubro': 9, 'out': 9,
    'novembro': 10, 'nov': 10,
    'dezembro': 11, 'dez': 11
  };
  
  const mesNormalizado = mesTexto.toLowerCase().trim();
  return meses[mesNormalizado as keyof typeof meses] ?? -1;
}

/**
 * Configura o período para um mês específico no DateRangePicker
 * @param page Instância da página Playwright
 * @param mes Mês desejado (0-11, onde 0 é Janeiro)
 * @param ano Ano desejado (ex: 2025)
 */
export async function configurarPeriodoMes(
  page: Page,
  mes: number,
  ano: number
): Promise<void> {
  try {
    console.log(`Configurando período para mês ${mes + 1} e ano ${ano}...`);
    
    // Obter o mês e ano atuais exibidos no calendário
    const headerSelector = '.drp-calendar.left .month';
    await page.waitForSelector(headerSelector, { timeout: 5000 });
    
    const headerText = await page.locator(headerSelector).textContent();
    console.log(`Calendário exibindo: ${headerText}`);
    
    if (!headerText) {
      throw new Error('Não foi possível ler o mês/ano atual do calendário');
    }
    
    // Extrair mês e ano atuais do texto (formato: "Junho 2025")
    const partes = headerText.trim().split(' ');
    const mesAtualTexto = partes[0];
    const anoAtualTexto = parseInt(partes[1]);
    
    // Converter mês de texto para número
    const mesAtual = converterMesTextoParaIndice(mesAtualTexto);
    
    if (mesAtual === -1) {
      throw new Error(`Mês não reconhecido: ${mesAtualTexto}`);
    }
    
    // Calcular quantos meses precisamos navegar
    // Se o ano for diferente, precisamos considerar isso
    let diferencaMeses = (ano - anoAtualTexto) * 12 + (mes - mesAtual);
    
    console.log(`Diferença de meses: ${diferencaMeses} (${mesAtual}/${anoAtualTexto} -> ${mes}/${ano})`);
    
    // Navegar para trás ou para frente conforme necessário
    if (diferencaMeses < 0) {
      // Navegar para trás
      for (let i = 0; i < Math.abs(diferencaMeses); i++) {
        console.log(`Clicando no botão de mês anterior... (${i+1}/${Math.abs(diferencaMeses)})`);
        await page.locator('.prev.available').click();
        await page.waitForTimeout(300); // Pequena pausa entre cliques
      }
    } else if (diferencaMeses > 0) {
      // Navegar para frente
      for (let i = 0; i < diferencaMeses; i++) {
        console.log(`Clicando no botão de próximo mês... (${i+1}/${diferencaMeses})`);
        await page.locator('.next.available').click();
        await page.waitForTimeout(300); // Pequena pausa entre cliques
      }
    }
    
    // Verificar se chegamos ao mês/ano desejado
    const novoHeaderText = await page.locator(headerSelector).textContent();
    console.log(`Calendário agora exibindo: ${novoHeaderText}`);
    
    // Selecionar o primeiro dia do mês
    console.log('Selecionando o primeiro dia do mês...');
    await page.locator('.drp-calendar.left .available:not(.off)').first().click();
    await page.waitForTimeout(500);
    
    // Selecionar o último dia do mês
    console.log('Selecionando o último dia do mês...');
    await page.locator('.drp-calendar.left .available:not(.off)').last().click();
    await page.waitForTimeout(500);
    
  } catch (error) {
    console.error(`Erro ao configurar período para mês ${mes + 1} e ano ${ano}: ${error}`);
    throw error;
  }
}

/**
 * Seleciona o período "Hoje" diretamente no DateRangePicker
 * @param page Instância da página Playwright
 * @param seletorCampoData Seletor do campo de data que abre o DateRangePicker (opcional)
 */
export async function selecionarPeriodoHoje(
  page: Page,
  seletorCampoData: string = 'input[name="daterange"]'
): Promise<void> {
  try {
    console.log('Selecionando período "Hoje"...');
    
    // Clicar no campo de data para abrir o seletor
    console.log('Clicando no campo de data para abrir o seletor...');
    try {
      // Tentar primeiro com o seletor fornecido
      await page.locator(seletorCampoData).click({ timeout: 5000 });
    } catch (error) {
      console.log('Seletor fornecido não encontrado, tentando alternativa...');
      // Tentar com o seletor alternativo
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click({ timeout: 5000 });
    }
    await page.waitForTimeout(1000);
    
    // Verificar se o DateRangePicker está aberto
    const dateRangePickerVisible = await page.locator('.daterangepicker').isVisible();
    if (!dateRangePickerVisible) {
      console.warn('DateRangePicker não está visível após clicar no campo de data');
      // Tentar clicar novamente
      await page.locator(seletorCampoData).click();
      await page.waitForTimeout(1000);
    }
    
    // Selecionar "Hoje" nas opções pré-definidas
    const hojeSelector = '.ranges li[data-range-key="Hoje"]';
    const hojeExists = await page.locator(hojeSelector).count() > 0;
    
    if (hojeExists) {
      console.log('Selecionando opção "Hoje"...');
      await page.locator(hojeSelector).click();
      await page.waitForTimeout(1000);
      
      // Verificar se o calendário fechou automaticamente
      const calendarioFechado = !(await page.locator('.daterangepicker').isVisible());
      console.log(`Calendário fechou após selecionar período: ${calendarioFechado}`);
      
      // Se não fechou automaticamente, clicar no botão Aplicar
      if (!calendarioFechado) {
        console.log('Clicando no botão Aplicar...');
        await page.locator('.applyBtn').click();
        await page.waitForTimeout(1000);
      }
      
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
      await page.waitForTimeout(5000);
      
      // Verificar se há overlay de carregamento e aguardar que desapareça
      const hasLoadingOverlay = await page.locator('.loadingoverlay').isVisible();
      if (hasLoadingOverlay) {
        console.log('Detectado overlay de carregamento, aguardando finalizar...');
        await page.waitForSelector('.loadingoverlay', { state: 'hidden', timeout: 30000 }).catch((e: Error) => {
          console.warn('Timeout aguardando overlay de carregamento desaparecer:', e);
        });
      }
    } else {
      throw new Error('Opção "Hoje" não encontrada no DateRangePicker');
    }
  } catch (error) {
    console.error(`Erro ao selecionar período "Hoje": ${error}`);
    throw error;
  }
}

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
    let [diaFinal, mesFinal, anoFinal] = dataFinal.split('/').map(Number);
    
    // Ajustar índices de mês (0-11 para JavaScript)
    const mesInicialIndex = mesInicial - 1;
    
    // Clicar no campo de data para abrir o seletor
    console.log('Clicando no campo de data para abrir o seletor...');
    try {
      // Tentar primeiro com o seletor fornecido
      await page.locator(seletorCampoData).click({ timeout: 5000 });
    } catch (error) {
      console.log('Seletor fornecido não encontrado, tentando alternativa...');
      // Tentar com o seletor alternativo
      await page.getByRole('textbox', { name: 'Data Cadastro' }).click({ timeout: 5000 });
    }
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
    const diferencaMesesInicial = (anoAtual - anoInicial) * 12 + (mesAtualIndex - mesInicialIndex);
    console.log(`Diferença de meses para data inicial: ${diferencaMesesInicial}`);
    
    // Navegar para o mês/ano inicial
    if (diferencaMesesInicial > 0) {
      console.log(`Clicando no botão 'prev' ${diferencaMesesInicial} vezes para chegar a ${mesInicial}/${anoInicial}...`);
      for (let i = 0; i < diferencaMesesInicial; i++) {
        await page.locator('.drp-calendar.left .prev.available').click();
        await page.waitForTimeout(500); // Pequena pausa entre cliques
      }
      await page.waitForTimeout(1000); // Aguardar um pouco mais após a navegação
    } else if (diferencaMesesInicial < 0) {
      console.log(`Clicando no botão 'next' ${Math.abs(diferencaMesesInicial)} vezes para chegar a ${mesInicial}/${anoInicial}...`);
      for (let i = 0; i < Math.abs(diferencaMesesInicial); i++) {
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
    
    // Verificar se o mês inicial e final são os mesmos
    const mesmoMes = mesInicial === mesFinal && anoInicial === anoFinal;
    console.log(`Período no mesmo mês: ${mesmoMes}`);
    
    // Função auxiliar para obter o nome do mês
    function obterNomeMes(indice: number): string {
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      return meses[indice];
    }
    
    // Navegar para o mês final (que é o mês que precisamos para selecionar ambas as datas)
    // Primeiro precisamos verificar o mês atual exibido no calendário
    const mesEsquerdoAtual = await page.locator('.drp-calendar.left .month').textContent();
    const mesDireitoAtual = await page.locator('.drp-calendar.right .month').textContent();
    console.log(`Mês atual exibido no calendário esquerdo: ${mesEsquerdoAtual}`);
    console.log(`Mês atual exibido no calendário direito: ${mesDireitoAtual}`);
    
    // Extrair o mês e ano atuais do calendário esquerdo
    const mesAtualMatch = mesEsquerdoAtual?.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{4})/);
    let mesAtualNome = mesAtualMatch?.[1] || '';
    let anoAtualCalendario = parseInt(mesAtualMatch?.[2] || '0');
    
    // Converter nome do mês para número
    const mesesNomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mesAtualNumero = mesesNomes.findIndex(m => mesAtualNome.toLowerCase().includes(m)) + 1;
    
    // Determinar qual mês precisamos navegar (mês final)
    console.log(`Mês atual do calendário: ${mesAtualNumero}, Ano atual do calendário: ${anoAtualCalendario}`);
    console.log(`Mês final desejado: ${mesFinal}, Ano final desejado: ${anoFinal}`);
    
    // Calcular diferença de meses entre o mês atual do calendário e o mês final desejado
    const diferencaMesesFinal = (anoFinal - anoAtualCalendario) * 12 + (mesFinal - mesAtualNumero);
    console.log(`Diferença de meses para o mês final: ${diferencaMesesFinal}`);
    
    // Navegar para o mês final
    if (diferencaMesesFinal !== 0) {
      if (diferencaMesesFinal > 0) {
        // Navegar para frente
        console.log(`Clicando no botão 'next' ${diferencaMesesFinal} vezes para chegar a ${mesFinal}/${anoFinal}...`);
        for (let i = 0; i < diferencaMesesFinal; i++) {
          await page.locator('.drp-calendar.right .next.available').click();
          await page.waitForTimeout(500);
        }
      } else {
        // Navegar para trás
        const passosTras = Math.abs(diferencaMesesFinal);
        console.log(`Clicando no botão 'prev' ${passosTras} vezes para chegar a ${mesFinal}/${anoFinal}...`);
        for (let i = 0; i < passosTras; i++) {
          await page.locator('.drp-calendar.left .prev.available').click();
          await page.waitForTimeout(500);
        }
      }
      
      // Verificar se a navegação foi bem-sucedida
      await page.waitForTimeout(1000);
      const mesEsquerdoDepois = await page.locator('.drp-calendar.left .month').textContent();
      const mesDireitoDepois = await page.locator('.drp-calendar.right .month').textContent();
      console.log(`Mês esquerdo após navegação: ${mesEsquerdoDepois}`);
      console.log(`Mês direito após navegação: ${mesDireitoDepois}`);
      
      // Verificar se chegamos ao mês correto
      const mesFinalNome = obterNomeMes(mesFinal - 1); // -1 porque os meses em JS são 0-indexed
      const mesEsquerdoCorreto = mesEsquerdoDepois?.toLowerCase().includes(mesFinalNome.toLowerCase());
      const mesDireitoCorreto = mesDireitoDepois?.toLowerCase().includes(mesFinalNome.toLowerCase());
      
      console.log(`Mês esperado: ${mesFinalNome}, Mês esquerdo correto: ${mesEsquerdoCorreto}, Mês direito correto: ${mesDireitoCorreto}`);
    }
    
    await page.waitForTimeout(1000);
    
    // Selecionar o dia final no calendário apropriado (mesmo calendário se for o mesmo mês)
    console.log(`Selecionando dia ${diaFinal} no calendário ${mesmoMes ? 'esquerdo' : 'apropriado'}`);
    
    // Obter o mês exibido em cada calendário após a navegação
    const mesEsquerdo = await page.locator('.drp-calendar.left .month').textContent();
    const mesDireito = await page.locator('.drp-calendar.right .month').textContent();
    console.log(`Mês exibido no calendário esquerdo: ${mesEsquerdo}`);
    console.log(`Mês exibido no calendário direito: ${mesDireito}`);
    
    // Extrair os meses e anos dos calendários
    const mesEsquerdoMatch = mesEsquerdo?.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{4})/);
    const mesDireitoMatch = mesDireito?.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{4})/);
    
    const mesEsquerdoNome = mesEsquerdoMatch?.[1] || '';
    const mesDireitoNome = mesDireitoMatch?.[1] || '';
    const anoEsquerdo = parseInt(mesEsquerdoMatch?.[2] || '0');
    const anoDireito = parseInt(mesDireitoMatch?.[2] || '0');
    
    console.log(`Mês esquerdo: ${mesEsquerdoNome}, Ano esquerdo: ${anoEsquerdo}`);
    console.log(`Mês direito: ${mesDireitoNome}, Ano direito: ${anoDireito}`);
    
    // Determinar qual calendário usar para a data final
    const mesFinalNome = obterNomeMes(mesFinal - 1); // -1 porque os meses em JS são 0-indexed
    
    // Determinar qual calendário usar com base no mês e ano
    const mesEsquerdoCorreto = mesEsquerdoNome.toLowerCase().includes(mesFinalNome.toLowerCase()) && anoEsquerdo === anoFinal;
    const mesDireitoCorreto = mesDireitoNome.toLowerCase().includes(mesFinalNome.toLowerCase()) && anoDireito === anoFinal;
    
    console.log(`Mês/ano final esperado: ${mesFinalNome}/${anoFinal}`);
    console.log(`Calendário esquerdo correto: ${mesEsquerdoCorreto}, Calendário direito correto: ${mesDireitoCorreto}`);
    
    // Determinar qual seletor usar para o calendário
    let seletorCalendario = '.drp-calendar.right';
    
    // Prioridade de seleção do calendário:
    // 1. Se for o mesmo mês da data inicial, usar o calendário esquerdo
    // 2. Se o mês final estiver no calendário esquerdo, usar o esquerdo
    // 3. Se o mês final estiver no calendário direito, usar o direito
    // 4. Se não encontrou o mês em nenhum calendário, usar o direito por padrão
    if (mesmoMes) {
      console.log('Usando calendário esquerdo porque o período está no mesmo mês');
      seletorCalendario = '.drp-calendar.left';
    } else if (mesEsquerdoCorreto && !mesDireitoCorreto) {
      console.log('Usando calendário esquerdo porque o mês final está apenas nele');
      seletorCalendario = '.drp-calendar.left';
    } else if (!mesEsquerdoCorreto && mesDireitoCorreto) {
      console.log('Usando calendário direito porque o mês final está apenas nele');
      seletorCalendario = '.drp-calendar.right';
    } else {
      console.warn(`Mês ${mesFinalNome}/${anoFinal} não encontrado em nenhum calendário, usando o direito por padrão`);
    }
    console.log(`Usando seletor de calendário: ${seletorCalendario}`);
    
    // Estratégia 1: Tentar selecionar pelo texto do dia (incluindo todos os dias disponíveis, mesmo com classes adicionais)
    const diasCalendario = await page.locator(`${seletorCalendario} td.available`);
    const diasCalendarioCount = await diasCalendario.count();
    
    console.log(`Encontrados ${diasCalendarioCount} dias disponíveis no calendário selecionado`);
    
    // Coletar todos os dias disponíveis para debug e para encontrar o último dia do mês
    console.log('Dias disponíveis no calendário:');
    const diasDisponiveis = [];
    for (let i = 0; i < diasCalendarioCount; i++) {
      const texto = await diasCalendario.nth(i).textContent();
      const classes = await diasCalendario.nth(i).getAttribute('class') || '';
      const diaNumero = texto ? parseInt(texto.trim()) : 0;
      
      // Verificar se o dia pertence ao mês atual (não tem a classe 'off')
      if (!classes.includes('off') && diaNumero > 0) {
        diasDisponiveis.push(diaNumero);
      }
      console.log(`- Dia ${texto?.trim()} (classes: ${classes})`);
    }
    
    // Ordenar os dias disponíveis para encontrar o último dia do mês
    diasDisponiveis.sort((a, b) => a - b);
    const ultimoDiaMes = diasDisponiveis.length > 0 ? diasDisponiveis[diasDisponiveis.length - 1] : 0;
    console.log(`Último dia disponível no mês: ${ultimoDiaMes}`);
    
    // Se o dia final solicitado for maior que o último dia disponível, ajustar para o último dia
    if (diaFinal > ultimoDiaMes && ultimoDiaMes > 0) {
      console.log(`Dia ${diaFinal} não disponível, ajustando para o último dia do mês: ${ultimoDiaMes}`);
      diaFinal = ultimoDiaMes;
    }
    
    let diaFinalEncontrado = false;
    for (let i = 0; i < diasCalendarioCount; i++) {
      const texto = await diasCalendario.nth(i).textContent();
      const classes = await diasCalendario.nth(i).getAttribute('class') || '';
      
      // Verificar se o dia corresponde e não está na classe 'off' (mês anterior/próximo)
      if (texto && texto.trim() === diaFinal.toString() && !classes.includes('off')) {
        console.log(`Dia ${diaFinal} encontrado na posição ${i} com classes: ${classes}`);
        await diasCalendario.nth(i).click();
        diaFinalEncontrado = true;
        break;
      }
    }
    
    // Estratégia 2: Se não encontrou pelo texto, tentar pelo data-title
    if (!diaFinalEncontrado) {
      console.log('Tentando selecionar dia final pelo atributo data-title...');
      
      // Determinar qual calendário usar (esquerdo ou direito)
      const calendarioSeletor = mesmoMes ? '.drp-calendar.left' : seletorCalendario;
      
      // Procurar em todas as células do calendário selecionado
      for (let linha = 0; linha < 6; linha++) {
        for (let coluna = 0; coluna < 7; coluna++) {
          const celula = page.locator(`${calendarioSeletor} td[data-title="r${linha}c${coluna}"]`);
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
      console.warn(`Dia ${diaFinal} não encontrado no calendário, selecionando o último dia disponível`);
      await diasCalendario.nth(diasCalendarioCount - 1).click();
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
      const filtrarBtn = page.locator('button.btn-primary').getByText('Filtrar');
      if (await filtrarBtn.count() > 0) {
        await filtrarBtn.click({ timeout: 5000 });
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
        try {
          // Tentar com um seletor mais genérico
          await page.locator('button.btn-primary').first().click({ timeout: 5000 });
        } catch (e3) {
          console.log('Tentando último recurso para o botão Filtrar...');
          // Último recurso - tentar clicar no botão azul visível
          await page.locator('.btn.btn-primary:visible').click({ timeout: 5000 });
        }
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