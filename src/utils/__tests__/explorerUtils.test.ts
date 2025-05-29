// src/utils/__tests__/explorerUtils.test.ts
import {
  SUPPORTED_EXPLORERS,
  DEFAULT_EXPLORER_ID,
  getExplorerById,
  buildClusterQueryParam,
  // Explorer, // Removed as it's not explicitly used for typing in this file
} from '../explorerUtils';

describe('Explorer Utilities', () => {
  describe('SUPPORTED_EXPLORERS', () => {
    it('should be a non-empty array', () => {
      expect(SUPPORTED_EXPLORERS).toBeInstanceOf(Array);
      expect(SUPPORTED_EXPLORERS.length).toBeGreaterThan(0);
    });

    it('each explorer should have id, name, and urlPattern', () => {
      for (const explorer of SUPPORTED_EXPLORERS) {
        expect(explorer).toHaveProperty('id');
        expect(typeof explorer.id).toBe('string');
        expect(explorer.id.length).toBeGreaterThan(0);

        expect(explorer).toHaveProperty('name');
        expect(typeof explorer.name).toBe('string');
        expect(explorer.name.length).toBeGreaterThan(0);

        expect(explorer).toHaveProperty('urlPattern');
        expect(typeof explorer.urlPattern).toBe('string');
        expect(explorer.urlPattern).toContain('{signature}');
      }
    });
  });

  describe('DEFAULT_EXPLORER_ID', () => {
    it('should be a valid id present in SUPPORTED_EXPLORERS', () => {
      expect(typeof DEFAULT_EXPLORER_ID).toBe('string');
      expect(SUPPORTED_EXPLORERS.some(e => e.id === DEFAULT_EXPLORER_ID)).toBe(true);
    });
  });

  describe('getExplorerById', () => {
    it('should return the correct explorer for a valid id', () => {
      const solscan = getExplorerById('solscan');
      expect(solscan).toBeDefined();
      expect(solscan?.id).toBe('solscan');
      expect(solscan?.name).toBe('Solscan');

      const solanafm = getExplorerById('solanafm');
      expect(solanafm).toBeDefined();
      expect(solanafm?.id).toBe('solanafm');
    });

    it('should return undefined for an invalid id', () => {
      const invalid = getExplorerById('invalid-explorer-id');
      expect(invalid).toBeUndefined();
    });

    it('should be case-sensitive for ids', () => {
      const mixedCase = getExplorerById('Solscan'); 
      expect(mixedCase).toBeUndefined();
    });
  });

  describe('buildClusterQueryParam', () => {
    it('should return an empty string for mainnet-beta', () => {
      expect(buildClusterQueryParam('mainnet-beta', null)).toBe('');
      expect(buildClusterQueryParam('mainnet-beta', 'https://some.custom.rpc')).toBe('');
    });

    it('should return "?cluster=devnet" for devnet', () => {
      expect(buildClusterQueryParam('devnet', null)).toBe('?cluster=devnet');
    });

    it('should return "?cluster=testnet" for testnet', () => {
      expect(buildClusterQueryParam('testnet', null)).toBe('?cluster=testnet');
    });

    it('should return an empty string for custom network if customRpcUrl does not indicate a known cluster', () => {
      expect(buildClusterQueryParam('custom', 'https://my.custom.rpc.com')).toBe('');
    });

    it('should return "?cluster=devnet" for custom network if customRpcUrl contains "devnet"', () => {
      expect(buildClusterQueryParam('custom', 'https://api.devnet.solana.com')).toBe('?cluster=devnet');
      expect(buildClusterQueryParam('custom', 'https://my-devnet-proxy.com')).toBe('?cluster=devnet');
    });

    it('should return "?cluster=testnet" for custom network if customRpcUrl contains "testnet"', () => {
      expect(buildClusterQueryParam('custom', 'https://api.testnet.solana.com')).toBe('?cluster=testnet');
      expect(buildClusterQueryParam('custom', 'https://my-testnet-server.org')).toBe('?cluster=testnet');
    });
    
    it('should return an empty string if customRpcUrl is null and network is custom', () => {
      expect(buildClusterQueryParam('custom', null)).toBe('');
    });

    it('should return an empty string for unrecognized network strings', () => {
      // Removed // @ts-expect-error directive as it's not needed
      expect(buildClusterQueryParam('unknown-network', null)).toBe('');
    });
  });
});