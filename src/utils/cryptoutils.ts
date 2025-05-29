// src/utils/cryptoutils.ts (or corresponding path)

import { derivePath } from 'ed25519-hd-key';
import * as bip39 from 'bip39';
import { Keypair, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58'; // Use default import

// --- Constants ---
const SOLANA_COIN_TYPE = 501;
export const DEFAULT_DERIVATION_PATH = `m/44'/${SOLANA_COIN_TYPE}'/0'/0'`;
const SEED_KEY_LENGTH = 32;
const SECRET_KEY_LENGTH = 64; // Full 64-byte secret key

// --- Error Class ---
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

// --- CryptoUtils Class ---
export class CryptoUtils {

  // --- BIP39 Helpers ---
  static generateMnemonicPhrase(): string { return bip39.generateMnemonic(); }
  static isValidMnemonic(mnemonic: string): boolean { return bip39.validateMnemonic(mnemonic); }

  // --- Core Solana Key Logic ---
  static mnemonicToSeed(mnemonic: string): Buffer {
    if (!this.isValidMnemonic(mnemonic)) { throw new CryptoError('Invalid mnemonic phrase provided.'); }
    return bip39.mnemonicToSeedSync(mnemonic);
  }

  static deriveSolanaKeypair(seed: Buffer, path: string = DEFAULT_DERIVATION_PATH): Keypair {
    // Note: Add support for deprecated Sollet path `501'/...` if needed, like Backpack example
    try {
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        if (derivedSeed.length !== SEED_KEY_LENGTH) throw new CryptoError(`Derived seed length incorrect: ${derivedSeed.length}.`);
        return Keypair.fromSecretKey(nacl.sign.keyPair.fromSeed(derivedSeed).secretKey); // Use full 64 byte key directly
    } catch (error: any) { throw new CryptoError(`Keypair derivation failed for path "${path}": ${error.message}`); }
  }

  static generateWalletFromMnemonic(mnemonic: string, derivationPath: string = DEFAULT_DERIVATION_PATH): { publicKey: string; privateKey: string; keypair: Keypair; } {
    try {
        const seed = this.mnemonicToSeed(mnemonic);
        const keypair = this.deriveSolanaKeypair(seed, derivationPath);
        // Return private key as hex of the 64-byte secret for consistency if needed elsewhere,
        // although base58 is more common for user-facing private keys.
        // Let's return base58 for user export compatibility, but use buffer internally.
        return {
            publicKey: keypair.publicKey.toBase58(),
            // privateKey: Buffer.from(keypair.secretKey).toString('hex'), // Hex representation if needed
            privateKey: bs58.encode(keypair.secretKey), // Base58 representation for export
            keypair
        };
    } catch (error: any) { if (error instanceof CryptoError) throw error; throw new CryptoError(`Mnemonic wallet gen failed: ${error.message}`); }
  }

  // --- Private Key Handling ---

  /**
   * Tries to decode a private key input string from JSON byte array, Base58, or Hex.
   * Returns the 64-byte secret key Buffer if valid.
   * Throws CryptoError if input is invalid or format is unsupported.
   */
  private static _decodePrivateKeyInput(inputString: string): Buffer {
    const trimmedInput = inputString.trim();

    // 1. Try JSON Byte Array Format: e.g., "[10, 20, ..., 30]"
    if (trimmedInput.startsWith('[') && trimmedInput.endsWith(']')) {
      try {
        const parsedArray = JSON.parse(trimmedInput);
        if (Array.isArray(parsedArray) &&
            parsedArray.length === SECRET_KEY_LENGTH &&
            parsedArray.every(n => typeof n === 'number' && n >= 0 && n <= 255 && Number.isInteger(n)))
        {
         // console.log("Decoding private key as Byte Array.");
          return Buffer.from(parsedArray);
        } else {
          throw new Error(`Invalid byte array format (length must be ${SECRET_KEY_LENGTH}, all elements numbers 0-255).`);
        }
      } catch (e: any) {
        throw new CryptoError(`Failed to parse as Byte Array: ${e.message}`);
      }
    }

    // 2. Try Base58 Format
    try {
      const decodedBytes = bs58.decode(trimmedInput);
      if (decodedBytes.length === SECRET_KEY_LENGTH) {
     //   console.log("Decoding private key as Base58.");
        return Buffer.from(decodedBytes); // Return Buffer explicitly
      }
    
    } catch (e) {
      // Ignore base58 decode error, try next format
    }

    // 3. Try Hex Format
    try {
      const hexInput = trimmedInput.startsWith('0x') ? trimmedInput.substring(2) : trimmedInput;
      if (/^[0-9a-fA-F]+$/.test(hexInput)) { // Check if valid hex characters
          const decodedBytes = Buffer.from(hexInput, 'hex');
          if (decodedBytes.length === SECRET_KEY_LENGTH) {
          //  console.log("Decoding private key as Hex.");
            return decodedBytes;
          }
      
      }
    } catch(e) {
       // Ignore hex decode error
    }

    // 4. If all failed
    throw new CryptoError(`Invalid private key format or length. Expected Base58, Hex, or Byte Array representing ${SECRET_KEY_LENGTH} bytes.`);
  }

  /** Generates wallet details from a private key string (detects format). */
  static generateWalletFromPrivateKey(privateKeyString: string): { publicKey: string; privateKey: string; keypair: Keypair; } {
    try {
      // Use the helper to decode and validate
      const decodedKey: Buffer = this._decodePrivateKeyInput(privateKeyString);

      // decodedKey is guaranteed to be 64 bytes here if no error was thrown
      const keypair = Keypair.fromSecretKey(decodedKey);

      return {
        publicKey: keypair.publicKey.toBase58(),
        // Return the key in a consistent format, e.g., Base58 representation of the 64-byte secret
        privateKey: bs58.encode(keypair.secretKey),
        keypair
      };
    } catch (error: any) {
      // Re-throw CryptoErrors, wrap others
      if (error instanceof CryptoError) throw error;
    //  console.error("Unexpected error generating wallet from private key:", error);
      throw new CryptoError(`Wallet generation from private key failed: ${error.message}`);
    }
  }

  // --- Validation Methods ---

  /** Validates a private key string by attempting to decode it. Throws CryptoError if invalid. */
  static validatePrivateKeyString(privateKeyString: string): boolean {
      try {
          // Use the decode helper for validation. It throws if invalid.
          this._decodePrivateKeyInput(privateKeyString);
          return true;
      } catch (error: any) {
          // Re-throw the specific CryptoError for detailed feedback
          if (error instanceof CryptoError) throw error;
          // Wrap unexpected errors
          throw new CryptoError(`Private key validation failed: ${error.message}`);
      }
  }

  static isValidPublicKey(publicKeyString: string): boolean { /* ... same as before ... */
       try { const decoded = bs58.decode(publicKeyString); return decoded.length === 32; } catch (e) { return false; }
   }
  static validatePublicKeyString(publicKeyString: string): PublicKey { /* ... same as before ... */
       try { const publicKey = new PublicKey(publicKeyString); return publicKey; } catch (error: any) { throw new CryptoError('Invalid public key format (Base58).'); }
   }

} // End CryptoUtils Class