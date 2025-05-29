// src/utils/__tests__/solanaSignInUtils.test.ts
import {
  parseSignInMessage,
  verifySignInMessage,
  SignInMessageErrorType,
  ParsedSignInMessage,
} from '../solanaSignInUtils';

describe('Solana Sign-In Utilities', () => {
  describe('parseSignInMessage', () => {
    const basicValidMessage =
      'test.example.com wants you to sign in with your Solana account:\n' +
      'HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz\n\n' + // Address
      'I accept the ExampleApp Terms of Service: https://test.example.com/tos\n\n' + // Statement
      'URI: https://test.example.com/login\n' +
      'Version: 1\n' +
      'Chain ID: 1\n' + // Assuming 1 for mainnet, adjust if your app uses different chain IDs for SIWS
      'Nonce: aAbBcC123\n' +
      'Issued At: 2023-10-27T10:00:00.000Z\n' +
      'Expiration Time: 2023-10-27T12:00:00.000Z\n' +
      'Not Before: 2023-10-27T09:59:00.000Z\n' +
      'Request ID: some-request-id-789\n' +
      'Resources:\n' +
      '- https://test.example.com/documents/doc1\n' +
      '- ipfs://QmfM2r8seH2GiRaC42gRAGZTstra2wH4uMkMAMK2HH3F7F';

    const messageWithoutOptionalFields =
      'minimal.app wants you to sign in with your Solana account:\n' +
      'HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz'; // Only required fields (domain, address)

    it('should parse a valid, complete SIWE message', () => {
      const parsed = parseSignInMessage(basicValidMessage);
      expect(parsed).not.toBeNull();
      expect(parsed?.domain).toBe('test.example.com');
      expect(parsed?.address).toBe('HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz');
      expect(parsed?.statement).toBe('I accept the ExampleApp Terms of Service: https://test.example.com/tos');
      expect(parsed?.uri).toBe('https://test.example.com/login');
      expect(parsed?.version).toBe('1');
      expect(parsed?.chainId).toBe('1');
      expect(parsed?.nonce).toBe('aAbBcC123');
      expect(parsed?.issuedAt).toBe('2023-10-27T10:00:00.000Z');
      expect(parsed?.expirationTime).toBe('2023-10-27T12:00:00.000Z');
      expect(parsed?.notBefore).toBe('2023-10-27T09:59:00.000Z');
      expect(parsed?.requestId).toBe('some-request-id-789');
      expect(parsed?.resources).toEqual([
        'https://test.example.com/documents/doc1',
        'ipfs://QmfM2r8seH2GiRaC42gRAGZTstra2wH4uMkMAMK2HH3F7F',
      ]);
      expect(parsed?.originalMessage).toBe(basicValidMessage);
    });

    it('should parse a message with only required fields (domain and address)', () => {
      const parsed = parseSignInMessage(messageWithoutOptionalFields);
      expect(parsed).not.toBeNull();
      expect(parsed?.domain).toBe('minimal.app');
      expect(parsed?.address).toBe('HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz');
      expect(parsed?.statement).toBeUndefined();
      expect(parsed?.uri).toBeUndefined();
      // ... other optional fields should be undefined
    });

    it('should return null for an invalid message format (e.g., missing domain)', () => {
      const invalidMessage =
        'wants you to sign in with your Solana account:\n' + // Missing domain
        'HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz';
      expect(parseSignInMessage(invalidMessage)).toBeNull();
    });

    it('should return null for a message missing the address', () => {
      const invalidMessage = 'test.example.com wants you to sign in with your Solana account:';
      expect(parseSignInMessage(invalidMessage)).toBeNull();
    });
    
    it('should handle statement with multiple newlines correctly', () => {
        const messageWithMultilineStatement =
        'test.example.com wants you to sign in with your Solana account:\n' +
        'HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz\n\n' +
        'This is line 1.\nThis is line 2.\n\nStill part of statement.\n\n' + // Statement can contain newlines
        'URI: https://test.example.com/login';
        const parsed = parseSignInMessage(messageWithMultilineStatement);
        expect(parsed?.statement).toBe('This is line 1.\nThis is line 2.\n\nStill part of statement.');
    });

    it('should parse correctly if statement is missing but other fields are present', () => {
        const messageWithoutStatement =
          'test.example.com wants you to sign in with your Solana account:\n' +
          'HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz\n\n' + // Double newline indicates start of optional fields
          'URI: https://test.example.com/login\n' +
          'Nonce: 12345';
        const parsed = parseSignInMessage(messageWithoutStatement);
        expect(parsed).not.toBeNull();
        expect(parsed?.statement).toBeUndefined();
        expect(parsed?.uri).toBe('https://test.example.com/login');
        expect(parsed?.nonce).toBe('12345');
    });
  });

  describe('verifySignInMessage', () => {
    const mockDappOrigin = 'https://dapp.example.com';
    const mockWalletAddress = 'HXZTuD72S22Tua33PA1HyqsN7K3c3mgUBK2R2pH3cZHz';
    const now = new Date('2023-10-27T10:05:00.000Z').getTime(); // Current time for tests

    const baseParsedMessage: ParsedSignInMessage = {
      domain: 'dapp.example.com',
      address: mockWalletAddress,
      uri: mockDappOrigin + '/login',
      version: '1',
      chainId: '1',
      nonce: 'someNonceAbc',
      issuedAt: '2023-10-27T10:00:00.000Z', // 5 minutes ago
      expirationTime: '2023-10-27T11:00:00.000Z', // In 55 minutes
      originalMessage: 'Full message string here',
    };

    it('should return no errors for a perfectly valid message', () => {
      const errors = verifySignInMessage(baseParsedMessage, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toEqual([]);
    });

    it('should detect DOMAIN_MISMATCH', () => {
      const msg = { ...baseParsedMessage, domain: 'phishing.example.com' };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.DOMAIN_MISMATCH);
    });

    it('should detect URI_MISMATCH if URI origin is different', () => {
      const msg = { ...baseParsedMessage, uri: 'https://phishing.example.com/login' };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.URI_MISMATCH);
    });
    
    it('should NOT detect URI_MISMATCH if URI path is different but origin matches', () => {
      const msg = { ...baseParsedMessage, uri: mockDappOrigin + '/different/path' }; // Same origin, different path
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).not.toContain(SignInMessageErrorType.URI_MISMATCH);
    });

    it('should detect ADDRESS_MISMATCH', () => {
      const msg = { ...baseParsedMessage, address: 'DifferentWalletAddressxxxxxxxxxxxxxxxxxxxx' };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.ADDRESS_MISMATCH);
    });

    it('should detect EXPIRED message', () => {
      const msg = { ...baseParsedMessage, expirationTime: '2023-10-27T10:04:00.000Z' }; // Expired 1 min ago
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.EXPIRED);
    });

    it('should detect NOT_YET_VALID message', () => {
      const msg = { ...baseParsedMessage, notBefore: '2023-10-27T10:06:00.000Z' }; // Valid in 1 min
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.NOT_YET_VALID);
    });
    
    it('should detect ISSUED_TOO_FAR_IN_PAST', () => {
      const msg = { ...baseParsedMessage, issuedAt: '2023-10-27T09:00:00.000Z' }; // Issued 1 hour 5 mins ago
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now, { issuedAtThresholdMs: 60 * 60 * 1000 }); // 1hr threshold
      expect(errors).toContain(SignInMessageErrorType.ISSUED_TOO_FAR_IN_PAST);
    });

    it('should detect ISSUED_IN_FUTURE', () => {
      const msg = { ...baseParsedMessage, issuedAt: '2023-10-27T11:00:00.000Z' }; // Issued in 55 minutes
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.ISSUED_IN_FUTURE);
    });
    
    it('should detect NONCE_MISSING', () => {
      const msg = { ...baseParsedMessage, nonce: undefined };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.NONCE_MISSING);
    });

    it('should detect ISSUED_AT_MISSING', () => {
      const msg = { ...baseParsedMessage, issuedAt: undefined };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.ISSUED_AT_MISSING);
    });
    
    it('should detect INVALID_ISSUED_AT_FORMAT', () => {
      const msg = { ...baseParsedMessage, issuedAt: "not a date" };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.INVALID_ISSUED_AT_FORMAT);
    });
    
    it('should detect INVALID_EXPIRATION_TIME_FORMAT', () => {
      const msg = { ...baseParsedMessage, expirationTime: "not a date" };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.INVALID_EXPIRATION_TIME_FORMAT);
    });

    it('should detect EXPIRES_BEFORE_ISSUANCE', () => {
      const msg = { ...baseParsedMessage, issuedAt: '2023-10-27T10:00:00.000Z', expirationTime: '2023-10-27T09:00:00.000Z' };
      const errors = verifySignInMessage(msg, mockDappOrigin, mockWalletAddress, now);
      expect(errors).toContain(SignInMessageErrorType.EXPIRES_BEFORE_ISSUANCE);
    });

    // Add more tests for other error types and combinations as needed
  });
});