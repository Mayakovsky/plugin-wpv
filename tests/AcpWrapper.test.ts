import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpWrapper, type AcpWrapperConfig } from '../src/acp/AcpWrapper';
import type { IAcpClient, AcpJob } from '../src/types';

const validConfig: AcpWrapperConfig = {
  walletPrivateKey: 'test-private-key',
  sessionEntityKeyId: 'test-entity-key',
  agentWalletAddress: '0x1234567890abcdef',
  rpcUrl: 'https://mainnet.base.org',
};

describe('AcpWrapper', () => {
  let wrapper: AcpWrapper;

  beforeEach(() => {
    wrapper = new AcpWrapper(validConfig);
  });

  it('implements IAcpClient interface', () => {
    // Type check: AcpWrapper implements IAcpClient
    const client: IAcpClient = wrapper;
    expect(typeof client.browseAgents).toBe('function');
    expect(typeof client.handleNewTask).toBe('function');
    expect(typeof client.deliverResult).toBe('function');
  });

  it('init with valid config succeeds', async () => {
    await wrapper.init();
    expect(wrapper.isInitialized()).toBe(true);
  });

  it('init with missing walletPrivateKey fails', async () => {
    const badWrapper = new AcpWrapper({ ...validConfig, walletPrivateKey: '' });
    await expect(badWrapper.init()).rejects.toThrow('ACP_WALLET_PRIVATE_KEY');
  });

  it('init with missing sessionEntityKeyId fails', async () => {
    const badWrapper = new AcpWrapper({ ...validConfig, sessionEntityKeyId: '' });
    await expect(badWrapper.init()).rejects.toThrow('ACP_SESSION_ENTITY_KEY_ID');
  });

  it('init with missing agentWalletAddress fails', async () => {
    const badWrapper = new AcpWrapper({ ...validConfig, agentWalletAddress: '' });
    await expect(badWrapper.init()).rejects.toThrow('ACP_AGENT_WALLET_ADDRESS');
  });

  it('browseAgents returns parsed AgentProfile array', async () => {
    await wrapper.init();
    const results = await wrapper.browseAgents('test-keyword');
    expect(Array.isArray(results)).toBe(true);
  });

  it('browseAgents throws if not initialized', async () => {
    await expect(wrapper.browseAgents('test')).rejects.toThrow('not initialized');
  });

  it('handleNewTask callback fires on dispatchJob', async () => {
    const callback = vi.fn();
    wrapper.handleNewTask(callback);

    const job: AcpJob = {
      jobId: 'job-1',
      offeringId: 'project_legitimacy_scan',
      buyerEntityId: 'buyer-1',
      input: { projectName: 'Test' },
      createdAt: Date.now(),
    };

    wrapper.dispatchJob(job);
    expect(callback).toHaveBeenCalledWith(job);
  });

  it('deliverResult calls without error when initialized', async () => {
    await wrapper.init();
    await expect(wrapper.deliverResult('job-1', { result: 'ok' })).resolves.not.toThrow();
  });

  it('deliverResult throws if not initialized', async () => {
    await expect(wrapper.deliverResult('job-1', {})).rejects.toThrow('not initialized');
  });

  it('registerOfferings succeeds when initialized', async () => {
    await wrapper.init();
    await expect(
      wrapper.registerOfferings([{ id: 'test', name: 'Test', description: 'Desc', price: 1.0, inputSchema: {} }])
    ).resolves.not.toThrow();
  });
});
