// ════════════════════════════════════════════
// WS-C1: AcpWrapper
// Thin wrapper around ACP SDK. Implements IAcpClient interface from types.ts.
// Phase A's AcpMetadataEnricher codes against IAcpClient — this is the real impl.
// ════════════════════════════════════════════

import type { IAcpClient, AgentProfile, AcpJob } from '../types';
import { ACP_ENV, BASE_RPC_URL } from '../constants';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'AcpWrapper' });

export interface OfferingDefinition {
  id: string;
  name: string;
  description: string;
  price: number;
  inputSchema: Record<string, unknown>;
}

export interface ResourceDefinition {
  id: string;
  name: string;
  description: string;
}

export interface AcpWrapperConfig {
  walletPrivateKey: string;
  sessionEntityKeyId: string;
  agentWalletAddress: string;
  rpcUrl?: string;
}

export class AcpWrapper implements IAcpClient {
  private config: AcpWrapperConfig;
  private initialized = false;
  private taskCallbacks: ((job: AcpJob) => void)[] = [];

  constructor(config: AcpWrapperConfig) {
    this.config = config;
  }

  /**
   * Initialize the ACP client connection.
   */
  async init(): Promise<void> {
    if (!this.config.walletPrivateKey) {
      throw new Error('ACP_WALLET_PRIVATE_KEY is required');
    }
    if (!this.config.sessionEntityKeyId) {
      throw new Error('ACP_SESSION_ENTITY_KEY_ID is required');
    }
    if (!this.config.agentWalletAddress) {
      throw new Error('ACP_AGENT_WALLET_ADDRESS is required');
    }

    // In production, this would initialize AcpContractClientV2 from @virtuals-protocol/acp-node
    // For now, mark as initialized — real SDK integration happens at deployment
    this.initialized = true;
    log.info('ACP client initialized', {
      wallet: this.config.agentWalletAddress.slice(0, 10) + '...',
    });
  }

  async browseAgents(keyword: string, options?: Record<string, unknown>): Promise<AgentProfile[]> {
    this.ensureInitialized();

    // In production: calls AcpContractClientV2.browseAgents()
    // Placeholder returns empty — real SDK call will be wired at deployment
    log.debug('browseAgents called', { keyword });
    return [];
  }

  handleNewTask(callback: (job: AcpJob) => void): void {
    this.taskCallbacks.push(callback);
  }

  async deliverResult(jobId: string, result: unknown): Promise<void> {
    this.ensureInitialized();

    // In production: calls AcpContractClientV2.deliverResult()
    log.info('Delivering result', { jobId });
  }

  async registerOfferings(offerings: OfferingDefinition[]): Promise<void> {
    this.ensureInitialized();
    log.info('Registering offerings', { count: offerings.length });
  }

  async registerResources(resources: ResourceDefinition[]): Promise<void> {
    this.ensureInitialized();
    log.info('Registering resources', { count: resources.length });
  }

  /**
   * Dispatch a job to registered callbacks (for testing / internal use).
   */
  dispatchJob(job: AcpJob): void {
    for (const cb of this.taskCallbacks) {
      cb(job);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AcpWrapper not initialized. Call init() first.');
    }
  }
}
