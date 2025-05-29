// src/utils/cryptoutils.test.ts
import { CryptoUtils, CryptoError, DEFAULT_DERIVATION_PATH } from '../cryptoutils';
import * as bip39 from 'bip39'; // Import the actual module
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// --- Test Suite ---
describe('CryptoUtils', () => {
  // Store original implementations before overriding
  const originalValidateMnemonic = bip39.validateMnemonic;
  const originalMnemonicToSeedSync = bip39.mnemonicToSeedSync;
  const originalGenerateMnemonic = bip39.generateMnemonic;

  // Apply direct mocks before all tests
  beforeAll(() => {
    // Directly replace functions on the imported object with jest.fn()
    (bip39 as any).validateMnemonic = jest.fn((mnemonic: string): boolean => {
      if (!mnemonic) return false;
      const wordCount = mnemonic.trim().split(/\s+/).length;
      return wordCount === 12 || wordCount === 24;
    });

    (bip39 as any).mnemonicToSeedSync = jest.fn((mnemonic: string, password?: string): Buffer => {
      // Use the *mocked* validateMnemonic for the check
      if (!bip39.validateMnemonic(mnemonic)) {
          throw new Error('Mock Error: mnemonicToSeedSync called with invalid mnemonic according to mock');
      }
      // Call the *original* implementation if validation passes
      return originalMnemonicToSeedSync(mnemonic.trim(), password);
    });

    (bip39 as any).generateMnemonic = jest.fn((...args: any[]): string => {
      // Call the *original* implementation
      return originalGenerateMnemonic(args[0], args[1], args[2] || bip39.wordlists.EN);
    });
  });

  // Restore original implementations after all tests
  afterAll(() => {
    (bip39 as any).validateMnemonic = originalValidateMnemonic;
    (bip39 as any).mnemonicToSeedSync = originalMnemonicToSeedSync;
    (bip39 as any).generateMnemonic = originalGenerateMnemonic;
  });

  // Clear call counts before each test
  beforeEach(() => {
    // Cast to jest.Mock to clear calls
    (bip39.validateMnemonic as jest.Mock).mockClear();
    (bip39.mnemonicToSeedSync as jest.Mock).mockClear();
    (bip39.generateMnemonic as jest.Mock).mockClear();
  });


  // --- Mnemonic Tests ---
  const validMnemonic12 = 'legal winner thank year wave sausage worth useful legal winner thank wave';
  const validMnemonic24 = 'logic easily waste eager injury oval sentence wine bomb embrace gossip supreme scene seed good daughter slide tragic cause weapon rhythm marine exhaust mandate';

  it('generateMnemonicPhrase: should generate a valid 12-word mnemonic phrase by default', () => {
    const generatedMnemonic = CryptoUtils.generateMnemonicPhrase(); // Calls mocked generate
    const words = generatedMnemonic.split(' ');
    expect(words).toHaveLength(12);
    words.forEach(word => expect(word.length).toBeGreaterThan(0));
    // Test validation using the mocked validator
    expect(CryptoUtils.isValidMnemonic(generatedMnemonic)).toBe(true);
    // Check if the generate mock was called
    expect(bip39.generateMnemonic).toHaveBeenCalled();
  });


  it('isValidMnemonic: should return true for valid mnemonics (using direct mock)', () => {
    expect(CryptoUtils.isValidMnemonic(validMnemonic12)).toBe(true);
    expect(CryptoUtils.isValidMnemonic(validMnemonic24)).toBe(true);
    // Check the mock was called
    expect(bip39.validateMnemonic).toHaveBeenCalledWith(validMnemonic12, bip39.wordlists.EN);
    expect(bip39.validateMnemonic).toHaveBeenCalledWith(validMnemonic24, bip39.wordlists.EN);
  });

  it('isValidMnemonic: should return false for invalid mnemonics (using direct mock)', () => {
    expect(CryptoUtils.isValidMnemonic('invalid phrase words')).toBe(false);
    expect(CryptoUtils.isValidMnemonic('legal winner thank year wave sausage worth useful legal winner thank')).toBe(false);
    expect(CryptoUtils.isValidMnemonic('')).toBe(false);
  });

  it('isValidMnemonic: should handle leading/trailing whitespace (using direct mock)', () => {
     const mnemonicWithSpaces = `  ${validMnemonic12}  `;
     expect(CryptoUtils.isValidMnemonic(mnemonicWithSpaces)).toBe(true);
     // Check mock was called with the trimmed version internally by our wrapper
     expect(bip39.validateMnemonic).toHaveBeenCalledWith(validMnemonic12, bip39.wordlists.EN);
  });


  // --- Seed Conversion Tests ---

  it('mnemonicToSeed: should convert a valid mnemonic to a seed buffer (using direct mock)', () => {
    const seed = CryptoUtils.mnemonicToSeed(validMnemonic12);
    expect(seed).toBeInstanceOf(Buffer);
    expect(seed.length).toBe(64);
    // Check that validation mock was called
    expect(bip39.validateMnemonic).toHaveBeenCalledWith(validMnemonic12, bip39.wordlists.EN);
    // Check that seed sync mock was called
    expect(bip39.mnemonicToSeedSync).toHaveBeenCalledWith(validMnemonic12);
  });

  it('mnemonicToSeed: should throw CryptoError for an invalid mnemonic (using direct mock)', () => {
    const invalidMnemonic = 'invalid phrase words';
    expect(() => CryptoUtils.mnemonicToSeed(invalidMnemonic))
        .toThrow(new CryptoError('Invalid mnemonic phrase provided.'));
    // Check validation mock was called
    expect(bip39.validateMnemonic).toHaveBeenCalledWith(invalidMnemonic, bip39.wordlists.EN);
    // Check seed sync was NOT called
    expect(bip39.mnemonicToSeedSync).not.toHaveBeenCalled();
  });

  // --- Key Derivation Tests ---

  it('deriveSolanaKeypair: should derive a keypair from a seed using the default path', () => {
    const seed = CryptoUtils.mnemonicToSeed(validMnemonic12);
    const keypair = CryptoUtils.deriveSolanaKeypair(seed);
    expect(keypair.publicKey).toBeDefined();
    expect(CryptoUtils.isValidPublicKey(keypair.publicKey.toBase58())).toBe(true);
    expect(keypair.secretKey).toBeDefined();
    expect(keypair.secretKey.length).toBe(64);
  });

  it('deriveSolanaKeypair: should derive different keypairs for different paths', () => {
    const seed = CryptoUtils.mnemonicToSeed(validMnemonic12);
    const customPath = "m/44'/501'/1'/0'";
    const keypairDefault = CryptoUtils.deriveSolanaKeypair(seed);
    const keypairCustom = CryptoUtils.deriveSolanaKeypair(seed, customPath);
    expect(keypairCustom.publicKey.toBase58()).not.toBe(keypairDefault.publicKey.toBase58());
    expect(CryptoUtils.isValidPublicKey(keypairCustom.publicKey.toBase58())).toBe(true);
  });

  it('deriveSolanaKeypair: should throw CryptoError for an invalid derivation path format', () => {
    const seed = CryptoUtils.mnemonicToSeed(validMnemonic12);
    const invalidPath = "m/invalid/path";
    expect(() => CryptoUtils.deriveSolanaKeypair(seed, invalidPath)).toThrow(CryptoError);
    expect(() => CryptoUtils.deriveSolanaKeypair(seed, invalidPath)).toThrow(/Keypair derivation failed/);
  });

  // --- Wallet Generation Tests ---

  it('generateWalletFromMnemonic: should return correct public key, private key (base58), and keypair', () => {
    const seed = CryptoUtils.mnemonicToSeed(validMnemonic12);
    const derivedSeed = derivePath(DEFAULT_DERIVATION_PATH, seed.toString('hex')).key;
    const expectedFullSecretKey = nacl.sign.keyPair.fromSeed(derivedSeed).secretKey;
    const wallet = CryptoUtils.generateWalletFromMnemonic(validMnemonic12);
    expect(wallet.publicKey).toBeDefined();
    expect(CryptoUtils.isValidPublicKey(wallet.publicKey)).toBe(true);
    expect(wallet.privateKey).toBeDefined();
    expect(wallet.keypair).toBeDefined();
    expect(wallet.keypair.publicKey.toBase58()).toBe(wallet.publicKey);
    expect(wallet.keypair.secretKey).toEqual(expectedFullSecretKey);
    expect(Buffer.from(bs58.decode(wallet.privateKey))).toEqual(Buffer.from(expectedFullSecretKey));
  });

  // --- Validation Tests ---

  it('isValidPublicKey: should validate correct Solana public keys', () => {
    const validPk = 'Vote111111111111111111111111111111111111111';
    const derivedPk = CryptoUtils.generateWalletFromMnemonic(validMnemonic12).publicKey;
    expect(CryptoUtils.isValidPublicKey(validPk)).toBe(true);
    expect(CryptoUtils.isValidPublicKey(derivedPk)).toBe(true);
  });

  it('isValidPublicKey: should invalidate incorrect public keys', () => {
    expect(CryptoUtils.isValidPublicKey('invalid-base58-string')).toBe(false);
    expect(CryptoUtils.isValidPublicKey('TooShort')).toBe(false);
    expect(CryptoUtils.isValidPublicKey('11111111111111111111111111111111')).toBe(true);
    expect(CryptoUtils.isValidPublicKey('')).toBe(false);
  });

  it('validatePublicKeyString: should return PublicKey object for valid string', () => {
    const validPkString = 'Vote111111111111111111111111111111111111111';
    const publicKeyObj = CryptoUtils.validatePublicKeyString(validPkString);
    expect(publicKeyObj).toBeDefined();
    expect(publicKeyObj.toBase58()).toBe(validPkString);
  });

  it('validatePublicKeyString: should throw CryptoError for invalid string', () => {
    const invalidPkString = 'invalid-key';
    expect(() => CryptoUtils.validatePublicKeyString(invalidPkString))
        .toThrow(new CryptoError('Invalid public key format (Base58).'));
  });

  // --- Private Key Decoding/Validation Tests ---

  it('generateWalletFromPrivateKey: should handle valid Base58 private key input', () => {
      const originalWallet = CryptoUtils.generateWalletFromMnemonic(validMnemonic12);
      const base58PrivateKey = originalWallet.privateKey;
      const walletFromPk = CryptoUtils.generateWalletFromPrivateKey(base58PrivateKey);
      expect(walletFromPk.publicKey).toBe(originalWallet.publicKey);
      expect(walletFromPk.privateKey).toBe(base58PrivateKey);
      expect(walletFromPk.keypair.secretKey).toEqual(originalWallet.keypair.secretKey);
  });

   it('validatePrivateKeyString: should return true for valid Base58 private key', () => {
       const originalWallet = CryptoUtils.generateWalletFromMnemonic(validMnemonic12);
       const base58PrivateKey = originalWallet.privateKey;
       expect(CryptoUtils.validatePrivateKeyString(base58PrivateKey)).toBe(true);
   });

   it('validatePrivateKeyString: should throw CryptoError for invalid private key format', () => {
       const invalidPk = 'this-is-not-a-valid-private-key-format-and-is-way-too-long-to-be-base58';
       expect(() => CryptoUtils.validatePrivateKeyString(invalidPk)).toThrow(CryptoError);
       expect(() => CryptoUtils.validatePrivateKeyString(invalidPk)).toThrow(/Invalid private key format or length/);
   });

});