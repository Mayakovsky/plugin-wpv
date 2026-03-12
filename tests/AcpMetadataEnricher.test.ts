import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpMetadataEnricher } from '../src/discovery/AcpMetadataEnricher';
import type { IAcpClient, AgentProfile } from '../src/types';

function createMockAcpClient(overrides: Partial<IAcpClient> = {}): IAcpClient {
  return {
    browseAgents: vi.fn().mockResolvedValue([]),
    handleNewTask: vi.fn(),
    deliverResult: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    name: 'TestAgent',
    entityId: 'entity-123',
    description: 'A test agent with docs at https://example.com/whitepaper.pdf',
    role: 'Provider',
    offerings: [],
    graduationStatus: 'graduated',
    ...overrides,
  };
}

describe('AcpMetadataEnricher', () => {
  let client: IAcpClient;
  let enricher: AcpMetadataEnricher;

  beforeEach(() => {
    client = createMockAcpClient();
    enricher = new AcpMetadataEnricher(client);
  });

  it('enriches a known token with metadata', async () => {
    const agent = makeAgent();
    (client.browseAgents as ReturnType<typeof vi.fn>).mockResolvedValue([agent]);

    const result = await enricher.enrichToken('0xabc123');
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('TestAgent');
    expect(result!.entityId).toBe('entity-123');
    expect(result!.graduationStatus).toBe('graduated');
    expect(client.browseAgents).toHaveBeenCalledWith('0xabc123');
  });

  it('returns null for unknown token', async () => {
    (client.browseAgents as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await enricher.enrichToken('0xunknown');
    expect(result).toBeNull();
  });

  it('extracts PDF URLs from description text', async () => {
    const agent = makeAgent({
      description: 'Check our docs: https://example.com/whitepaper.pdf and more info at https://other.com/doc.pdf',
    });
    (client.browseAgents as ReturnType<typeof vi.fn>).mockResolvedValue([agent]);

    const result = await enricher.enrichToken('0xabc');
    expect(result!.linkedUrls).toContain('https://example.com/whitepaper.pdf');
    expect(result!.linkedUrls).toContain('https://other.com/doc.pdf');
  });

  it('extracts IPFS CIDs from description text', async () => {
    const agent = makeAgent({
      description: 'Whitepaper on IPFS: QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    });
    (client.browseAgents as ReturnType<typeof vi.fn>).mockResolvedValue([agent]);

    const result = await enricher.enrichToken('0xabc');
    expect(result!.linkedUrls).toHaveLength(1);
    expect(result!.linkedUrls[0]).toContain('ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
  });

  it('handles IAcpClient timeout gracefully', async () => {
    (client.browseAgents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));

    const result = await enricher.enrichToken('0xabc');
    expect(result).toBeNull();
  });

  it('handles agents with no linked documents', async () => {
    const agent = makeAgent({
      description: 'No URLs in this description at all.',
    });
    (client.browseAgents as ReturnType<typeof vi.fn>).mockResolvedValue([agent]);

    const result = await enricher.enrichToken('0xabc');
    expect(result).not.toBeNull();
    expect(result!.linkedUrls).toEqual([]);
  });

  it('searchByKeyword returns multiple ProjectMetadata entries', async () => {
    const agents = [makeAgent({ name: 'Agent1' }), makeAgent({ name: 'Agent2' })];
    (client.browseAgents as ReturnType<typeof vi.fn>).mockResolvedValue(agents);

    const results = await enricher.searchByKeyword('defi');
    expect(results).toHaveLength(2);
    expect(results[0].agentName).toBe('Agent1');
    expect(results[1].agentName).toBe('Agent2');
  });

  it('searchByKeyword returns empty array on error', async () => {
    (client.browseAgents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

    const results = await enricher.searchByKeyword('defi');
    expect(results).toEqual([]);
  });
});
