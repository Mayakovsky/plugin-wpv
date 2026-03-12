// ════════════════════════════════════════════
// WS-C2: ResourceHandlers
// Serves free resources: Greenlight List and Scam Alert Feed.
// ════════════════════════════════════════════

import type { GreenlightListResponse, ScamAlertFeedResponse, Verdict } from '../types';
import type { WpvVerificationsRepo } from '../db/wpvVerificationsRepo';
import type { WpvWhitepapersRepo } from '../db/wpvWhitepapersRepo';

export class ResourceHandlers {
  constructor(
    private verificationsRepo: WpvVerificationsRepo,
    private whitepaperRepo: WpvWhitepapersRepo,
  ) {}

  async getGreenlightList(): Promise<GreenlightListResponse> {
    const verifications = await this.verificationsRepo.getGreenlightList();

    const projects = await Promise.all(
      verifications.map(async (v) => {
        const wp = await this.whitepaperRepo.findById(v.whitepaperId);
        return {
          name: wp?.projectName ?? 'Unknown',
          tokenAddress: wp?.tokenAddress ?? null,
          verdict: 'PASS' as Verdict,
          score: v.confidenceScore ?? 0,
          hypeTechRatio: v.hypeTechRatio ?? 0,
        };
      }),
    );

    return {
      date: new Date().toISOString().split('T')[0],
      totalVerified: projects.length,
      projects,
    };
  }

  async getScamAlertFeed(): Promise<ScamAlertFeedResponse> {
    const verifications = await this.verificationsRepo.getScamAlerts();

    const flagged = await Promise.all(
      verifications.map(async (v) => {
        const wp = await this.whitepaperRepo.findById(v.whitepaperId);
        const redFlags: string[] = [];
        if ((v.hypeTechRatio ?? 0) > 3.0) redFlags.push('High hype-to-tech ratio');
        if ((v.structuralScore ?? 0) < 2) redFlags.push('Poor structural quality');
        if ((v.totalClaims ?? 0) === 0) redFlags.push('No verifiable claims');

        return {
          name: wp?.projectName ?? 'Unknown',
          tokenAddress: wp?.tokenAddress ?? null,
          verdict: 'FAIL' as const,
          hypeTechRatio: v.hypeTechRatio ?? 0,
          redFlags,
        };
      }),
    );

    return {
      date: new Date().toISOString().split('T')[0],
      flagged,
    };
  }
}
