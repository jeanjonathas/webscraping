/**
 * Sistema de semáforo para controlar o acesso ao navegador
 * Garante que apenas uma requisição use o navegador por vez
 */

// Estado do semáforo
let isLocked = false;
let currentOperation = '';
let queueSize = 0;
let operationStartTime: number | null = null;

// Tempo máximo (em ms) que uma operação pode manter o bloqueio
const MAX_LOCK_TIME = 5 * 60 * 1000; // 5 minutos

/**
 * Tenta adquirir o bloqueio para uma operação
 * @param operation Nome da operação que está tentando adquirir o bloqueio
 * @returns true se conseguiu adquirir o bloqueio, false caso contrário
 */
export async function acquireLock(operation: string): Promise<boolean> {
  // Se o semáforo já está bloqueado
  if (isLocked) {
    // Verificar se o bloqueio atual está ativo há muito tempo
    if (operationStartTime && (Date.now() - operationStartTime > MAX_LOCK_TIME)) {
      console.warn(`Forçando liberação do bloqueio após timeout. Operação anterior: ${currentOperation}`);
      releaseLock(currentOperation);
    } else {
      // Incrementar o tamanho da fila
      queueSize++;
      console.log(`Semáforo bloqueado por "${currentOperation}". "${operation}" aguardando na fila. Tamanho da fila: ${queueSize}`);
      return false;
    }
  }
  
  // Adquirir o bloqueio
  isLocked = true;
  currentOperation = operation;
  operationStartTime = Date.now();
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
    
    // Decrementar o tamanho da fila se houver requisições aguardando
    if (queueSize > 0) {
      queueSize--;
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
 * Retorna informações sobre o estado atual do semáforo
 * @returns Objeto com informações sobre o estado do semáforo
 */
export function getSemaphoreStatus() {
  return {
    isLocked,
    currentOperation,
    queueSize,
    operationStartTime,
    elapsedTime: operationStartTime ? Math.floor((Date.now() - operationStartTime) / 1000) + 's' : null
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
 * @returns Resultado da função
 */
export async function withLockWait<T>(
  operation: string, 
  fn: () => Promise<T>, 
  maxWaitTime: number = 60000
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
  
  try {
    // Executar a função com o bloqueio
    return await fn();
  } finally {
    // Garantir que o bloqueio seja liberado mesmo em caso de erro
    releaseLock(operation);
  }
}
