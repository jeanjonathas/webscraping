/**
 * Sistema de semáforo para controlar o acesso ao navegador
 * Garante que apenas uma requisição use o navegador por vez
 */

// Estado do semáforo
let isLocked = false;
let currentOperation = '';
let queueSize = 0;
let operationStartTime: number | null = null;
let lastActivityTime: number | null = null;

// Conjunto para rastrear operações únicas na fila
let waitingOperations = new Set<string>();

// Tempo máximo (em ms) que uma operação pode manter o bloqueio
const MAX_LOCK_TIME = 90 * 1000; // 1 minuto e meio

// Tempo máximo (em ms) de inatividade antes de considerar uma operação travada
const MAX_INACTIVITY_TIME = 2 * 60 * 1000; // 2 minutos

// Verificar periodicamente se o semáforo está travado
setInterval(() => {
  if (isLocked) {
    const now = Date.now();
    
    // Verificar se a operação está ativa há muito tempo
    if (operationStartTime && now - operationStartTime > MAX_LOCK_TIME) {
      console.log(`Forçando liberação do semáforo para operação "${currentOperation}" por tempo máximo excedido (${Math.floor((now - operationStartTime) / 1000)}s)`); 
      isLocked = false;
      currentOperation = '';
      operationStartTime = null;
      lastActivityTime = null;
    }
    // Verificar se a operação está inativa há muito tempo
    else if (lastActivityTime && now - lastActivityTime > MAX_INACTIVITY_TIME) {
      console.log(`Forçando liberação do semáforo para operação "${currentOperation}" por inatividade (${Math.floor((now - lastActivityTime) / 1000)}s)`);
      isLocked = false;
      currentOperation = '';
      operationStartTime = null;
      lastActivityTime = null;
    }
  }
}, 10000); // Verificar a cada 10 segundos

/**
 * Tenta adquirir o bloqueio para uma operação
 * @param operation Nome da operação que está tentando adquirir o bloqueio
 * @returns true se conseguiu adquirir o bloqueio, false caso contrário
 */
export async function acquireLock(operation: string): Promise<boolean> {
  // Se o semáforo já está bloqueado
  if (isLocked) {
    const now = Date.now();
    
    // Verificar se o bloqueio atual está ativo há muito tempo (timeout absoluto)
    if (operationStartTime && (now - operationStartTime > MAX_LOCK_TIME)) {
      console.warn(`Forçando liberação do bloqueio após timeout absoluto (${MAX_LOCK_TIME/60000} minutos). Operação anterior: ${currentOperation}`);
      releaseLock(currentOperation);
    } 
    // Verificar se não há atividade há muito tempo (timeout de inatividade)
    else if (lastActivityTime && (now - lastActivityTime > MAX_INACTIVITY_TIME)) {
      console.warn(`Forçando liberação do bloqueio após ${MAX_INACTIVITY_TIME/60000} minutos sem atividade. Operação anterior: ${currentOperation}`);
      releaseLock(currentOperation);
    } else {
      // Verificar se esta operação já está na fila
      if (!waitingOperations.has(operation)) {
        // Adicionar a operação à fila e incrementar o contador
        waitingOperations.add(operation);
        queueSize++;
        console.log(`Semáforo bloqueado por "${currentOperation}". "${operation}" adicionada à fila. Tamanho da fila: ${queueSize}`);
      } else {
        console.log(`Semáforo bloqueado por "${currentOperation}". "${operation}" já está aguardando na fila. Tamanho da fila: ${queueSize}`);
      }
      return false;
    }
  }
  
  // Adquirir o bloqueio
  isLocked = true;
  currentOperation = operation;
  const now = Date.now();
  operationStartTime = now;
  lastActivityTime = now;
  
  // Remover a operação da lista de espera, se estiver lá
  if (waitingOperations.has(operation)) {
    waitingOperations.delete(operation);
  }
  
  console.log(`Semáforo adquirido por "${operation}"`);
  return true;
}

/**
 * Libera o bloqueio para uma operação
 * @param operation Nome da operação que está liberando o bloqueio
 * @returns true se o bloqueio foi liberado, false se a operação não era a detentora do bloqueio
 */
export function releaseLock(operation: string): boolean {
  // Verificar se a operação é a detentora do bloqueio
  if (isLocked && currentOperation === operation) {
    isLocked = false;
    currentOperation = '';
    operationStartTime = null;
    
    // Remover a operação da lista de espera, se estiver lá
    if (waitingOperations.has(operation)) {
      waitingOperations.delete(operation);
    }
    
    console.log(`Semáforo liberado por "${operation}". Requisições aguardando: ${queueSize}`);
    return true;
  }
  
  return false;
}

/**
 * Verifica se o semáforo está bloqueado
 * @returns true se o semáforo está bloqueado, false caso contrário
 */
export function isLockActive(): boolean {
  return isLocked;
}

/**
 * Retorna o nome da operação atual que detém o bloqueio do semáforo
 * @returns Nome da operação atual ou string vazia se o semáforo não estiver bloqueado
 */
export function getCurrentOperation(): string {
  return currentOperation;
}

/**
 * Registra atividade para a operação atual
 * Isso evita que o semáforo seja liberado por inatividade se a operação estiver fazendo progresso
 */
export function registerActivity() {
  if (isLocked) {
    lastActivityTime = Date.now();
    console.log(`Atividade registrada para operação "${currentOperation}"`);
  }
}

/**
 * Retorna informações sobre o estado atual do semáforo
 * @returns Objeto com informações sobre o estado do semáforo
 */
export function getSemaphoreStatus() {
  const now = Date.now();
  return {
    isLocked,
    currentOperation,
    queueSize,
    waitingOperations: Array.from(waitingOperations),
    operationStartTime,
    lastActivityTime,
    elapsedTime: operationStartTime ? Math.floor((now - operationStartTime) / 1000) + 's' : null,
    inactiveTime: lastActivityTime ? Math.floor((now - lastActivityTime) / 1000) + 's' : null
  };
}

/**
 * Executa uma função com o bloqueio do semáforo
 * Se não conseguir adquirir o bloqueio, retorna null
 * @param operation Nome da operação
 * @param fn Função a ser executada com o bloqueio
 * @returns Resultado da função ou null se não conseguiu adquirir o bloqueio
 */
export async function withLock<T>(operation: string, fn: () => Promise<T>): Promise<T | null> {
  // Tentar adquirir o bloqueio
  if (!await acquireLock(operation)) {
    return null;
  }
  
  try {
    // Executar a função com o bloqueio
    return await fn();
  } finally {
    // Garantir que o bloqueio seja liberado mesmo em caso de erro
    releaseLock(operation);
  }
}

/**
 * Executa uma função com o bloqueio do semáforo
 * Se não conseguir adquirir o bloqueio, aguarda até conseguir
 * @param operation Nome da operação
 * @param fn Função a ser executada com o bloqueio
 * @param maxWaitTime Tempo máximo (em ms) para aguardar o bloqueio
 * @param keepLock Se true, não libera o semáforo após a execução da função
 * @param activityCheckInterval Intervalo (em ms) para registrar atividade
 * @returns Resultado da função
 */
export async function withLockWait<T>(
  operation: string, 
  fn: () => Promise<T>, 
  maxWaitTime: number = 60000,
  keepLock: boolean = false,
  activityCheckInterval: number = 10000 // 10 segundos
): Promise<T> {
  const startTime = Date.now();
  
  // Tentar adquirir o bloqueio
  while (!await acquireLock(operation)) {
    // Verificar se excedeu o tempo máximo de espera
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error(`Timeout ao aguardar o bloqueio para "${operation}"`);
    }
    
    // Aguardar um pouco antes de tentar novamente
    console.log(`Aguardando bloqueio para "${operation}"...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Configurar um intervalo para registrar atividade periodicamente
  // Isso evita que o semáforo seja liberado por inatividade durante operações longas
  const activityInterval = setInterval(() => {
    if (isLocked && currentOperation === operation) {
      registerActivity();
    }
  }, activityCheckInterval);
  
  try {
    // Executar a função com o bloqueio
    return await fn();
  } catch (error) {
    console.error(`Erro durante execução da operação "${operation}":`, error);
    throw error;
  } finally {
    // Limpar o intervalo de atividade
    clearInterval(activityInterval);
    
    // Garantir que o bloqueio seja liberado mesmo em caso de erro, a menos que keepLock seja true
    if (!keepLock) {
      releaseLock(operation);
    } else {
      console.log(`Mantendo semáforo bloqueado para "${operation}" (keepLock=true)`);
    }
  }
}
