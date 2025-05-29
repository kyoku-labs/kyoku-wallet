// src/lib/keyring/types.ts

export type SecretType = 'mnemonic' | 'privateKey' | 'publicKey'; // publicKey is for view-only

/**
 * Data structure for a single account stored within the keyring.
 * The secret itself is encrypted OR stored directly if view-only.
 * Uses TweetNaCl secretbox (XSalsa20-Poly1305) for encryption.
 */
export interface EncryptedAccountData {
  // **CHANGED:** Now stores Base58 encoded ciphertext
  encryptedSecret: string;
  // **ADDED:** Base58 encoded nonce for secretbox decryption
  nonce: string | null; // Null only for type 'publicKey'
  type: SecretType;
}

/**
 * Unencrypted metadata associated with an account.
 * Used for display and identification without needing the password.
 */
export interface AccountMetadata {
  publicKey: string;      // Derived/validated public key (Base58)
  name: string;           // User-defined account name
  uuid: string;           // Unique identifier for this account entry
  derivationPath?: string; // BIP44 path used (if derived from mnemonic)
  createdAt: number;      // Timestamp of creation/import
  isViewOnly: boolean;    // Flag to easily identify view-only accounts
  pfpMint?: string | null; // <-- NEW: Mint address of the NFT used as PFP
}

/**
 * The main structure stored in chrome.storage.local.
 * Contains global encryption parameters and all account data.
 */
export interface KeyringStructure {
  salt: string;
  iterations: number;
  kdf: 'pbkdf2';
  digest: 'sha256';
  cipher: 'xsalsa20-poly1305';
  accounts: {
    [uuid: string]: {
      data: EncryptedAccountData;
      metadata: AccountMetadata; // AccountMetadata now includes pfpMint
    }
  };
  activeAccountUUID: string | null;
  version: number;
  primaryMnemonicUUID?: string | null; 
}

/**
 * Options for adding a new account.
 */
export interface AddAccountOptions {
  name?: string;           // Optional initial name
  derivationPath?: string; // Optional derivation path (for mnemonic)
  makeActive?: boolean;    // Set this account as active upon adding
  // pfpMint is not typically set on add, but rather updated later
}

// --- This remains useful for derivation scanning ---
export interface DerivedAccountInfo {
  publicKey: string;
  derivationPath: string;
  balance: number; // Balance in Lamports
}


export interface TokenInfo {
  address: string;
  balance: number;
  balanceLamports: bigint; // Stored as string if it comes from/goes to JSON
  decimals: number;
  symbol?: string;
  name?: string;
  logo?: string;
  isNative: boolean;
  usdPrice?: number | null;
  usdValue?: number | null;
  price24hAgo?: number | null; // ADDED: Price 24 hours ago
  priceChange24hPercentage?: number | null; // ADDED: 24h price change
}