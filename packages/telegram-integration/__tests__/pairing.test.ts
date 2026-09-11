import { describe, expect, it } from 'vitest';
import { TelegramPairingService } from '../src/pairing';

describe('TelegramPairingService', () => {
  describe('createPairingRequest', () => {
    it('creates a pairing request with a token', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');

      expect(request.id).toMatch(/^pair-/);
      expect(request.telegramUserId).toBe('tg-123');
      expect(request.telegramDisplayName).toBe('Alice');
      expect(request.token).toHaveLength(8);
      expect(request.status).toBe('pending');
      expect(request.expiresAt).toBeDefined();
    });

    it('rejects if user is already paired', () => {
      const service = new TelegramPairingService();
      service.createPairingRequest('tg-123', 'Alice');
      service.approvePairing(
        service.getPendingRequest(Array.from(service.tokenToRequest.keys())[0]!)!.token,
        'principal-1',
        'Alice Principal',
      );

      expect(() => service.createPairingRequest('tg-123', 'Alice')).toThrow('Telegram user is already paired');
    });

    it('rejects if max pending requests reached', () => {
      const service = new TelegramPairingService({ maxPendingPerUser: 1 });
      service.createPairingRequest('tg-123', 'Alice');

      expect(() => service.createPairingRequest('tg-123', 'Alice')).toThrow('Maximum pending pairing requests reached');
    });
  });

  describe('approvePairing', () => {
    it('approves a pending request and creates binding', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      const binding = service.approvePairing(request.token, 'principal-1', 'Alice Principal');

      expect(binding.id).toMatch(/^binding-/);
      expect(binding.telegramUserId).toBe('tg-123');
      expect(binding.principalId).toBe('principal-1');
      expect(binding.active).toBe(true);
    });

    it('rejects invalid token', () => {
      const service = new TelegramPairingService();
      expect(() => service.approvePairing('INVALID', 'p-1', 'User')).toThrow('Invalid pairing token');
    });

    it('rejects expired token', () => {
      const service = new TelegramPairingService({ tokenExpiryMs: -1 }); // already expired
      const request = service.createPairingRequest('tg-123', 'Alice');

      expect(() => service.approvePairing(request.token, 'p-1', 'User')).toThrow('Pairing request has expired');
    });

    it('rejects already-approved token (token consumed)', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      service.approvePairing(request.token, 'p-1', 'User');

      // Token is consumed after approval — second use is "Invalid pairing token"
      expect(() => service.approvePairing(request.token, 'p-2', 'User2')).toThrow('Invalid pairing token');
    });
  });

  describe('resolvePrincipalId', () => {
    it('resolves paired user to principal', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      service.approvePairing(request.token, 'principal-1', 'Alice Principal');

      expect(service.resolvePrincipalId('tg-123')).toBe('principal-1');
    });

    it('returns undefined for unpaired user', () => {
      const service = new TelegramPairingService();
      expect(service.resolvePrincipalId('tg-999')).toBeUndefined();
    });
  });

  describe('isPaired', () => {
    it('returns true for paired user', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      service.approvePairing(request.token, 'p-1', 'User');

      expect(service.isPaired('tg-123')).toBe(true);
    });

    it('returns false for unpaired user', () => {
      const service = new TelegramPairingService();
      expect(service.isPaired('tg-999')).toBe(false);
    });
  });

  describe('revokeBinding', () => {
    it('revokes an active binding', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      const binding = service.approvePairing(request.token, 'p-1', 'User');

      service.revokeBinding(binding.id);
      expect(service.isPaired('tg-123')).toBe(false);
    });
  });

  describe('getBindingByPrincipalId', () => {
    it('finds binding by principal ID', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      const binding = service.approvePairing(request.token, 'p-1', 'User');

      expect(service.getBindingByPrincipalId('p-1')?.id).toBe(binding.id);
    });

    it('returns undefined for unknown principal', () => {
      const service = new TelegramPairingService();
      expect(service.getBindingByPrincipalId('unknown')).toBeUndefined();
    });
  });

  describe('token generation', () => {
    it('generates tokens of configured length', () => {
      const service = new TelegramPairingService({ tokenLength: 12 });
      const request = service.createPairingRequest('tg-123', 'Alice');
      expect(request.token).toHaveLength(12);
    });

    it('generates tokens with valid characters', () => {
      const service = new TelegramPairingService();
      const request = service.createPairingRequest('tg-123', 'Alice');
      expect(request.token).toMatch(/^[A-Z0-9]+$/);
    });
  });
});
