// ════════════════════════════════════════════
// WS-A2: AcpMetadataEnricher
// Given a token address, queries ACP registry for agent profile and metadata.
// Codes against IAcpClient interface (NOT AcpWrapper implementation).
// ════════════════════════════════════════════

import type { IAcpClient, ProjectMetadata } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger({ operation: 'AcpMetadataEnricher' });

/** Regex patterns for extracting document URLs from descriptions */
const PDF_URL_PATTERN = /https?:\/\/\S+\.pdf/gi;
const IPFS_CID_PATTERN = /(?:Qm[1-9A-HJ-NP-Za-km-z]{44,}|bafy[a-z2-7]{50,})/g;
const GENERIC_URL_PATTERN = /https?:\/\/\S+/gi;

export class AcpMetadataEnricher {
  constructor(private acpClient: IAcpClient) {}

  /**
   * Enrich a token address with ACP metadata.
   * Returns null if no matching agent is found.
   */
  async enrichToken(tokenAddress: string): Promise<ProjectMetadata | null> {
    try {
      const agents = await this.acpClient.browseAgents(tokenAddress);

      if (!agents || agents.length === 0) {
        return null;
      }

      // Use the first matching agent
      const agent = agents[0];
      const linkedUrls = this.extractUrls(agent.description ?? '');

      return {
        agentName: agent.name ?? null,
        entityId: agent.entityId ?? null,
        description: agent.description ?? null,
        linkedUrls,
        category: agent.role ?? null,
        graduationStatus: agent.graduationStatus ?? null,
      };
    } catch (err) {
      log.warn('Failed to enrich token', { tokenAddress }, err);
      return null;
    }
  }

  /**
   * Search for projects by keyword.
   */
  async searchByKeyword(keyword: string): Promise<ProjectMetadata[]> {
    try {
      const agents = await this.acpClient.browseAgents(keyword);
      if (!agents || agents.length === 0) return [];

      return agents.map((agent) => ({
        agentName: agent.name ?? null,
        entityId: agent.entityId ?? null,
        description: agent.description ?? null,
        linkedUrls: this.extractUrls(agent.description ?? ''),
        category: agent.role ?? null,
        graduationStatus: agent.graduationStatus ?? null,
      }));
    } catch (err) {
      log.warn('Failed to search by keyword', { keyword }, err);
      return [];
    }
  }

  /**
   * Extract PDF URLs and IPFS CIDs from a description string.
   */
  private extractUrls(text: string): string[] {
    const urls = new Set<string>();

    // Extract direct PDF URLs
    const pdfMatches = text.match(PDF_URL_PATTERN);
    if (pdfMatches) {
      for (const url of pdfMatches) urls.add(url);
    }

    // Extract IPFS CIDs and convert to gateway URLs
    const ipfsMatches = text.match(IPFS_CID_PATTERN);
    if (ipfsMatches) {
      for (const cid of ipfsMatches) {
        urls.add(`https://ipfs.io/ipfs/${cid}`);
      }
    }

    // If no PDFs or IPFS found, try generic URLs
    if (urls.size === 0) {
      const genericMatches = text.match(GENERIC_URL_PATTERN);
      if (genericMatches) {
        for (const url of genericMatches) urls.add(url);
      }
    }

    return Array.from(urls);
  }
}
