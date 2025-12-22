/**
 * Pending Bridges Manager
 * 
 * Gerencia bridges pendentes que precisam de mint na ARC Testnet
 * Armazena burnTxHash de bridges que completaram o burn mas estão aguardando attestation
 */

interface PendingBridge {
  burnTxHash: string;
  recipient: string;
  amount: string;
  createdAt: number; // timestamp
  lastChecked: number; // timestamp
  status: 'pending_attestation' | 'attestation_ready' | 'mint_completed' | 'expired';
  messageHash?: string;
  mintTxHash?: string;
}

// In-memory storage (em produção, usar banco de dados ou Redis)
// Limpa automaticamente bridges completadas há mais de 24 horas
const pendingBridges = new Map<string, PendingBridge>();

/**
 * Adiciona uma bridge pendente à lista
 */
export function addPendingBridge(
  burnTxHash: string,
  recipient: string,
  amount: string,
  messageHash?: string
): void {
  console.log(`[PENDING_BRIDGES] Adding pending bridge: ${burnTxHash}`);
  
  pendingBridges.set(burnTxHash, {
    burnTxHash,
    recipient,
    amount,
    createdAt: Date.now(),
    lastChecked: Date.now(),
    status: 'pending_attestation',
    messageHash,
  });
  
  console.log(`[PENDING_BRIDGES] Total pending bridges: ${pendingBridges.size}`);
}

/**
 * Remove uma bridge da lista (quando mint é completado)
 */
export function removePendingBridge(burnTxHash: string): void {
  console.log(`[PENDING_BRIDGES] Removing completed bridge: ${burnTxHash}`);
  pendingBridges.delete(burnTxHash);
  console.log(`[PENDING_BRIDGES] Remaining pending bridges: ${pendingBridges.size}`);
}

/**
 * Marca bridge como tendo attestation pronta
 */
export function markAttestationReady(burnTxHash: string): void {
  const bridge = pendingBridges.get(burnTxHash);
  if (bridge) {
    bridge.status = 'attestation_ready';
    bridge.lastChecked = Date.now();
    console.log(`[PENDING_BRIDGES] Marked bridge as attestation ready: ${burnTxHash}`);
  }
}

/**
 * Marca bridge como mint completado
 */
export function markMintCompleted(burnTxHash: string, mintTxHash: string): void {
  const bridge = pendingBridges.get(burnTxHash);
  if (bridge) {
    bridge.status = 'mint_completed';
    bridge.mintTxHash = mintTxHash;
    bridge.lastChecked = Date.now();
    console.log(`[PENDING_BRIDGES] Marked bridge as mint completed: ${burnTxHash}`);
  }
}

/**
 * Marca bridge como expirada
 */
export function markExpired(burnTxHash: string): void {
  const bridge = pendingBridges.get(burnTxHash);
  if (bridge) {
    bridge.status = 'expired';
    bridge.lastChecked = Date.now();
    console.log(`[PENDING_BRIDGES] Marked bridge as expired: ${burnTxHash}`);
  }
}

/**
 * Obtém todas as bridges pendentes
 */
export function getPendingBridges(): PendingBridge[] {
  // Limpar bridges antigas (completadas há mais de 24 horas)
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  for (const [burnTxHash, bridge] of pendingBridges.entries()) {
    if (bridge.status === 'mint_completed' && (now - bridge.lastChecked) > oneDay) {
      pendingBridges.delete(burnTxHash);
    }
  }
  
  return Array.from(pendingBridges.values());
}

/**
 * Obtém uma bridge pendente específica
 */
export function getPendingBridge(burnTxHash: string): PendingBridge | undefined {
  return pendingBridges.get(burnTxHash);
}

/**
 * Atualiza lastChecked de uma bridge
 */
export function updateLastChecked(burnTxHash: string): void {
  const bridge = pendingBridges.get(burnTxHash);
  if (bridge) {
    bridge.lastChecked = Date.now();
  }
}
