// src/lib/keyring/KeyringManager.ts

// Node Crypto for PBKDF2 (requires polyfills)
import crypto from 'crypto'; // Use Node's crypto via polyfill

// TweetNaCl for Encryption
import { secretbox, randomBytes } from 'tweetnacl';

// Base58 for encoding
import bs58 from 'bs58';

// UUID
import { v4 as uuidv4 } from 'uuid';

// Internal Utils and Types
import { CryptoUtils, DEFAULT_DERIVATION_PATH, CryptoError} from '../../../utils/cryptoutils';
import { saveToStorage, getFromStorage, removeFromStorage } from '../../../utils/storage';
import {
  KeyringStructure,
  EncryptedAccountData,
  AccountMetadata,
  SecretType,
  AddAccountOptions
} from './types'; // Uses updated types

// --- Constants ---
const KEYRING_STORAGE_KEY = 'vaultData';
const SALT_SIZE_BYTES = 16; // For PBKDF2 salt
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_DIGEST = 'sha256';
const DERIVED_KEY_LENGTH_BYTES = secretbox.keyLength; // 32 bytes for secretbox key
const NONCE_LENGTH_BYTES = secretbox.nonceLength; // 24 bytes for secretbox nonce
const KEYRING_CURRENT_VERSION = 2;

// --- Custom Keyring Errors ---
export class KeyringError extends Error { constructor(message: string) { super(message); this.name = 'KeyringError'; } }
export class IncorrectPasswordError extends KeyringError { constructor() { super('Incorrect password provided.'); this.name = 'IncorrectPasswordError'; } }
export class KeyringNotInitializedError extends KeyringError { constructor() { super('Keyring has not been initialized.'); this.name = 'KeyringNotInitializedError'; } }
export class AccountNotFoundError extends KeyringError { constructor(uuid: string) { super(`Account UUID ${uuid} not found.`); this.name = 'AccountNotFoundError'; } }
export class AccountExistsError extends KeyringError { constructor(publicKey: string) { super(`Account with public key ${publicKey} already exists.`); this.name = 'AccountExistsError'; } }
export class NoMnemonicSeedError extends KeyringError { constructor() { super('No mnemonic seed available in this keyring to derive accounts from.'); this.name = 'NoMnemonicSeedError'; } }

// --- Interface for getDecryptedSecret return type ---
export interface DecryptedSecretResult {
  secret: string;
  type: SecretType;
}

// --- KeyringManager Class ---
export class KeyringManager {

  private _keyringData: KeyringStructure | null = null;
  private _derivedKeyCache: Buffer | null = null;

  // --- Static Helper ---
  /**
   * Checks if the keyring has been initialized in storage with the correct version.
   * @returns {Promise<boolean>} True if initialized, false otherwise.
   */
  static async isInitialized(): Promise<boolean> {
    try {
        const data = await getFromStorage<KeyringStructure>(KEYRING_STORAGE_KEY);
        return data !== null && data.version === KEYRING_CURRENT_VERSION;
    } catch (error) {
        return false;
    }
  }

  /** Helper to check if _keyringData is loaded in the instance. */
  public isKeyringDataLoaded(): boolean {
    return this._keyringData !== null;
  }

  // --- Initialization and Loading ---
  /**
   * Loads keyring data from storage.
   * Validates data structure and version. Locks the keyring after loading.
   * @returns {Promise<boolean>} True if data was loaded and is valid, false otherwise.
   */
  async load(): Promise<boolean> {
    try {
      this._keyringData = await getFromStorage<KeyringStructure>(KEYRING_STORAGE_KEY);

      if (this._keyringData) {
        if (
          this._keyringData.version !== KEYRING_CURRENT_VERSION ||
          !this._keyringData.salt ||
          !this._keyringData.iterations ||
          !this._keyringData.accounts ||
          typeof this._keyringData.accounts !== 'object' ||
          this._keyringData.kdf !== 'pbkdf2' ||
          this._keyringData.digest !== 'sha256' ||
          this._keyringData.cipher !== 'xsalsa20-poly1305'
        ) {
          // Corrupted or incompatible keyring data found.
          this._keyringData = null;
        } else {
          // Ensure pfpMint exists on loaded accounts, defaulting to null if missing.
          Object.values(this._keyringData.accounts).forEach(accountContainer => {
            if (accountContainer.metadata.pfpMint === undefined) {
              accountContainer.metadata.pfpMint = null;
            }
          });
        }
      }

      const loaded = this._keyringData !== null;
      return loaded;

    } catch (error) {
        // Error during storage load.
        this._keyringData = null;
        return false;
    } finally {
        this.lock();
    }
  }

  /**
   * Initializes the first account in the keyring.
   * This should only be called once when setting up a new wallet.
   * @param {string} secret - The mnemonic or private key.
   * @param {SecretType} type - The type of secret ('mnemonic' or 'privateKey').
   * @param {string} password - The user's password for encryption.
   * @param {AddAccountOptions} [options={}] - Optional parameters for the account.
   * @returns {Promise<AccountMetadata>} Metadata of the initialized account.
   * @throws {KeyringError} If already initialized or invalid secret type.
   */
  async initializeFirstAccount(
    secret: string,
    type: SecretType,
    password: string,
    options: AddAccountOptions = {}
  ): Promise<AccountMetadata> {
    if (await KeyringManager.isInitialized()) {
      throw new KeyringError('Keyring already initialized. Use addAccount instead.');
    }
    if (type !== 'mnemonic' && type !== 'privateKey') {
      throw new KeyringError(`Cannot initialize keyring with type: ${type}. Only 'mnemonic' or 'privateKey' allowed for initialization.`);
    }

    const salt = crypto.randomBytes(SALT_SIZE_BYTES);
    const derivedKey = await this._deriveEncryptionKey(password, salt, PBKDF2_ITERATIONS);
    const { publicKey, metadataSpecifics } = this._derivePublicKeyAndMeta(secret, type, options.derivationPath);
    const uuid = uuidv4();
    const name = options.name || `Account 1`;
    const { ciphertext, nonce } = this._encrypt(secret, derivedKey);
    const newAccountData: EncryptedAccountData = { encryptedSecret: ciphertext, nonce: nonce, type };
    const newAccountMetadata: AccountMetadata = {
      publicKey, name, uuid, createdAt: Date.now(), isViewOnly: false, pfpMint: null, ...metadataSpecifics,
    };
    const primaryMnemonicUUID = type === 'mnemonic' ? uuid : null;

    this._keyringData = {
      salt: salt.toString('hex'),
      iterations: PBKDF2_ITERATIONS,
      kdf: 'pbkdf2',
      digest: 'sha256',
      cipher: 'xsalsa20-poly1305',
      accounts: { [uuid]: { data: newAccountData, metadata: newAccountMetadata } },
      activeAccountUUID: uuid,
      version: KEYRING_CURRENT_VERSION,
      primaryMnemonicUUID: primaryMnemonicUUID,
    };

    try {
      await this._saveKeyringData();
      this._derivedKeyCache = derivedKey; // Cache the derived key upon successful initialization
      return newAccountMetadata;
    } catch (saveError) {
        this._keyringData = null; this.lock();
        throw new KeyringError(`Failed to save wallet: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
    }
  }

  // --- Account Management ---
  /**
   * Adds a new account to the keyring.
   * Wallet must be unlocked to add encrypted accounts (mnemonic/private key).
   * View-only accounts (publicKey) can be added if the keyring is initialized, even if locked.
   * @param {string} secret - The secret (mnemonic, private key, or public key).
   * @param {SecretType} type - The type of secret.
   * @param {AddAccountOptions} [options={}] - Optional parameters for the new account.
   * @returns {Promise<AccountMetadata>} Metadata of the added account.
   * @throws {KeyringError} If wallet is locked for encrypted types, or other errors.
   * @throws {KeyringNotInitializedError} If trying to add view-only when not initialized.
   * @throws {AccountExistsError} If an account with the same public key already exists.
   */
  async addAccount(
    secret: string,
    type: SecretType,
    options: AddAccountOptions = {}
  ): Promise<AccountMetadata> {
    if (!this._keyringData && await KeyringManager.isInitialized()) { // Check persisted init
        await this.load(); // Load data if not present
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
        throw new KeyringNotInitializedError();
    }

    let encryptedPayload: { ciphertext: string; nonce: string | null };

    if (type === 'mnemonic' || type === 'privateKey') { // Encrypted types
      if (!this.isUnlocked()) {
        throw new KeyringError("Wallet must be unlocked to import/add an account needing encryption (mnemonic/private key).");
      }
      const derivedKey = this._derivedKeyCache;
      if (!derivedKey) {
          // This state should ideally not be reached if isUnlocked() is true.
          this.lock();
          throw new KeyringError("Internal Error: Wallet unlocked but encryption key cache is empty.");
      }
      const { ciphertext, nonce } = this._encrypt(secret, derivedKey);
      encryptedPayload = { ciphertext, nonce };
    } else { // View-only (publicKey)
      try {
           CryptoUtils.validatePublicKeyString(secret);
           encryptedPayload = { ciphertext: secret, nonce: null }; // Store public key directly
      } catch (validationError: any) {
           throw new KeyringError(`Invalid public key: ${validationError.message}`);
      }
    }

    const { publicKey, metadataSpecifics } = this._derivePublicKeyAndMeta(secret, type, options.derivationPath);
    if (await this.findAccountByPublicKey(publicKey)) { // Changed to await
      throw new AccountExistsError(publicKey);
    }

    const uuid = uuidv4();
    const accountCount = Object.keys(this._keyringData.accounts).length;
    const isViewOnly = type === 'publicKey';
    const defaultName = isViewOnly
        ? `View-Only ${publicKey.substring(0,4)}...${publicKey.substring(publicKey.length - 4)}`
        : `Account ${accountCount + 1}`;
    const name = options.name || defaultName;

    const newAccountData: EncryptedAccountData = {
        encryptedSecret: encryptedPayload.ciphertext,
        nonce: encryptedPayload.nonce,
        type
    };
    const newAccountMetadata: AccountMetadata = {
      publicKey, name, uuid, createdAt: Date.now(), isViewOnly, pfpMint: null, ...metadataSpecifics,
    };

    if (type === 'mnemonic' && !this._keyringData.primaryMnemonicUUID) {
        // Sets the first added mnemonic account as the primary for derivations.
        this._keyringData.primaryMnemonicUUID = uuid;
    }

    this._keyringData.accounts[uuid] = { data: newAccountData, metadata: newAccountMetadata };

    if (options.makeActive === true || !this._keyringData.activeAccountUUID) {
      this._keyringData.activeAccountUUID = uuid;
    }

    await this._saveKeyringData();
    return newAccountMetadata;
  }

  /**
   * Updates the Profile Picture (PFP) mint address for a given account.
   * For non-view-only accounts, the wallet must be unlocked.
   * View-only accounts can have their PFP updated even if the wallet is locked.
   * @param {string} uuid - The UUID of the account to update.
   * @param {string | null} pfpMint - The new PFP mint address, or null to remove.
   * @throws {KeyringNotInitializedError} If the keyring is not initialized.
   * @throws {AccountNotFoundError} If the account UUID is not found.
   * @throws {KeyringError} If trying to update a non-view-only account while locked.
   */
  async updateAccountPfp(uuid: string, pfpMint: string | null): Promise<void> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
      await this.load();
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
      throw new KeyringNotInitializedError();
    }
    const accountContainer = this._keyringData.accounts[uuid];
    if (!accountContainer) {
      throw new AccountNotFoundError(uuid);
    }
    // Allow PFP update for view-only accounts even when locked.
    if (!this.isUnlocked() && !accountContainer.metadata.isViewOnly) {
        throw new KeyringError("Wallet must be unlocked to update PFP for non-view-only accounts.");
    }

    accountContainer.metadata.pfpMint = pfpMint;
    await this._saveKeyringData();
  }

  /**
   * Derives and adds the next account from the primary mnemonic.
   * Wallet must be unlocked.
   * @param {AddAccountOptions} [options={}] - Options for the new derived account.
   * @returns {Promise<AccountMetadata>} Metadata of the newly derived account.
   * @throws {KeyringError} If wallet is locked or other derivation errors.
   * @throws {NoMnemonicSeedError} If no primary mnemonic is set in the keyring.
   */
  async addNextDerivedAccount(options: AddAccountOptions = {}): Promise<AccountMetadata> {
    if (!this.isUnlocked()) {
      throw new KeyringError("Wallet must be unlocked to derive new accounts.");
    }
    if (!this._keyringData && await KeyringManager.isInitialized()) { // Ensure data loaded
      await this.load();
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
      throw new KeyringNotInitializedError();
    }
    if (!this._keyringData.primaryMnemonicUUID) {
      throw new NoMnemonicSeedError();
    }

    const primaryMnemonicContainer = this._keyringData.accounts[this._keyringData.primaryMnemonicUUID];
    if (!primaryMnemonicContainer || primaryMnemonicContainer.data.type !== 'mnemonic') {
      // This indicates an inconsistent state, clear the invalid primary UUID.
      this._keyringData.primaryMnemonicUUID = null;
      await this._saveKeyringData().catch(_e => { /* Log internal save error if needed */ });
      throw new NoMnemonicSeedError();
    }

    const derivedKey = this._derivedKeyCache;
    if (!derivedKey) {
      throw new KeyringError("Internal Error: Wallet unlocked but encryption key cache is empty (for addNextDerivedAccount).");
    }
    let baseMnemonic: string;
    try {
      baseMnemonic = this._decrypt(
        primaryMnemonicContainer.data.encryptedSecret,
        primaryMnemonicContainer.data.nonce!,
        derivedKey
      );
    } catch (decryptError) {
      this.lock();
      throw new KeyringError("Failed to access primary recovery phrase. Wallet has been locked.");
    }

    let highestPathIndex = -1;
    const solCoinType = '501';
    const derivationPathRegex = new RegExp(`^m\\/44'\\/${solCoinType}'\\/(\\d+)'(\\/0')?$`);

    Object.values(this._keyringData.accounts).forEach(accContainer => {
      if (accContainer.data.type === 'mnemonic' && accContainer.metadata.derivationPath) {
        const match = accContainer.metadata.derivationPath.match(derivationPathRegex);
        if (match?.[1]) {
          const indexNum = parseInt(match[1], 10);
          if (!isNaN(indexNum) && indexNum > highestPathIndex) {
            highestPathIndex = indexNum;
          }
        }
      }
    });
    const nextPathIndex = highestPathIndex + 1;
    const nextPath = `m/44'/${solCoinType}'/${nextPathIndex}'/0'`; // Standard path structure

    const nextName = `Account ${Object.keys(this._keyringData.accounts).length + 1}`;

    const finalOptions: AddAccountOptions = {
        derivationPath: nextPath,
        name: options.name || nextName,
        makeActive: options.makeActive === undefined ? true : options.makeActive
    };

    try {
        const newAccountMetadata = await this.addAccount(baseMnemonic, 'mnemonic', finalOptions);
        return newAccountMetadata;
    } catch (addError) {
        // Error during addAccount will be propagated.
        throw addError;
    }
  }

  /**
   * Retrieves the decrypted secret for an account.
   * If the wallet is locked and the account is encrypted, a password must be provided.
   * @param {string} uuid - The UUID of the account.
   * @param {string} [password] - The password, if the wallet is locked.
   * @returns {Promise<DecryptedSecretResult>} The decrypted secret and its type.
   * @throws {KeyringError} If password is required and not provided, or decryption fails.
   * @throws {IncorrectPasswordError} If the provided password is wrong.
   */
  async getDecryptedSecret(uuid: string, password?: string): Promise<DecryptedSecretResult> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
      await this.load();
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
      throw new KeyringNotInitializedError();
    }
    const accountContainer = this._keyringData.accounts[uuid];
    if (!accountContainer) throw new AccountNotFoundError(uuid);
    const { data: accountData } = accountContainer;

    if (accountData.type === 'publicKey') { // View-only account
      return { secret: accountData.encryptedSecret, type: accountData.type };
    }

    let derivedKey = this._derivedKeyCache;

    if (!derivedKey) { // Wallet is locked
      if (!password) {
        throw new KeyringError("Password is required to decrypt this account while wallet is locked.");
      }
      try {
        const saltBuffer = Buffer.from(this._keyringData.salt, 'hex');
        derivedKey = await this._deriveEncryptionKey(password, saltBuffer, this._keyringData.iterations);
      } catch (e: any) {
        this.lock(); // Ensure locked state on derivation failure
        throw new IncorrectPasswordError();
      }
    }
    // Wallet is unlocked or password provided successfully derived the key

    try {
      if (accountData.nonce === null) { // Should not happen for encrypted types
        throw new KeyringError(`Internal Error: Nonce is missing for encrypted account ${uuid} of type ${accountData.type}.`);
      }
      const decryptedSecretString = this._decrypt(
        accountData.encryptedSecret,
        accountData.nonce,
        derivedKey
      );

      if (!this._derivedKeyCache && password) { // If key was derived via password just now, cache it (unlocks instance)
        this._derivedKeyCache = derivedKey;
      }
      return { secret: decryptedSecretString, type: accountData.type };
    } catch (error) {

      if (this._derivedKeyCache && !password) { // If an unlocked instance fails decryption (corrupt data?)
        this.lock();
      }
      // If it was an IncorrectPasswordError from _decrypt, rethrow it.
      if (error instanceof IncorrectPasswordError) throw error;
      // Otherwise, assume it's an incorrect password due to a general decryption failure.
      throw new IncorrectPasswordError();
    }
  }

  // --- Getters ---
  /**
   * Returns metadata for all accounts in the keyring.
   * Will load keyring data from storage if not already loaded.
   * @returns {Promise<AccountMetadata[]>} An array of account metadata.
   */
  async getAllAccountMetadata(): Promise<AccountMetadata[]> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
        await this.load();
    }
    if (!this._keyringData) return [];
    return Object.values(this._keyringData.accounts).map(accContainer => accContainer.metadata);
  }

  /**
   * Returns metadata for a specific account by UUID.
   * Will load keyring data from storage if not already loaded.
   * @param {string} uuid - The UUID of the account.
   * @returns {Promise<AccountMetadata | null>} Account metadata or null if not found.
   */
  async getAccountMetadata(uuid: string): Promise<AccountMetadata | null> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
        await this.load();
    }
    if (!this._keyringData?.accounts?.[uuid]) return null;
    return this._keyringData.accounts[uuid].metadata;
  }

  /**
   * Finds an account by its public key.
   * Will load keyring data from storage if not already loaded.
   * @param {string} publicKey - The public key of the account.
   * @returns {Promise<AccountMetadata | null>} Account metadata or null if not found.
   */
  async findAccountByPublicKey(publicKey: string): Promise<AccountMetadata | null> {
   if (!this._keyringData && await KeyringManager.isInitialized()) {
       await this.load();
   }
   if (!this._keyringData) return null;
   for (const accountContainer of Object.values(this._keyringData.accounts)) {
        if (accountContainer.metadata.publicKey === publicKey) return accountContainer.metadata;
   }
   return null;
  }

  /**
   * Returns metadata for the currently active account.
   * Will load keyring data from storage if not already loaded.
   * @returns {Promise<AccountMetadata | null>} Active account metadata or null if none.
   */
  async getActiveAccountMetadata(): Promise<AccountMetadata | null> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
        await this.load();
    }
    if (!this._keyringData?.activeAccountUUID) return null;
    return this.getAccountMetadata(this._keyringData.activeAccountUUID); // Calls the async version
  }

  // --- Setters ---
  /**
   * Sets the active account by UUID.
   * @param {string} uuid - The UUID of the account to set as active.
   * @throws {KeyringNotInitializedError} If keyring is not initialized.
   * @throws {AccountNotFoundError} If account UUID is not found.
   */
  async setActiveAccount(uuid: string): Promise<void> {
      if (!this._keyringData && await KeyringManager.isInitialized()) {
          await this.load();
      }
      if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) throw new KeyringNotInitializedError();
      if (!this._keyringData.accounts[uuid]) throw new AccountNotFoundError(uuid);
      if (this._keyringData.activeAccountUUID === uuid) return;

      this._keyringData.activeAccountUUID = uuid;
      await this._saveKeyringData();
  }

  /**
   * Updates the name of an account.
   * @param {string} uuid - The UUID of the account.
   * @param {string} newName - The new name for the account.
   * @throws {KeyringError} If new name is empty.
   * @throws {AccountNotFoundError} If account UUID is not found.
   */
  async updateAccountName(uuid: string, newName: string): Promise<void> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
        await this.load();
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) throw new KeyringNotInitializedError();
    const accountContainer = this._keyringData.accounts[uuid];
    if (!accountContainer) throw new AccountNotFoundError(uuid);

    const trimmedName = newName.trim();
    if (!trimmedName) throw new KeyringError("Account name cannot be empty.");
    if (accountContainer.metadata.name === trimmedName) return; // No change needed

    accountContainer.metadata.name = trimmedName;
    await this._saveKeyringData();
  }

  /**
   * Removes an account from the keyring.
   * If the account is encrypted and the wallet is locked, password verification is required.
   * @param {string} uuid - The UUID of the account to remove.
   * @param {string} [password] - Password, if removing an encrypted account while locked.
   * @throws {KeyringError} If password is required and not provided, or other errors.
   * @throws {AccountNotFoundError} If account UUID is not found.
   */
  async removeAccount(uuid: string, password?: string): Promise<void> {
      if (!this._keyringData && await KeyringManager.isInitialized()) {
           await this.load();
      }
      if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
           throw new KeyringNotInitializedError();
      }
      const accountContainer = this._keyringData.accounts[uuid];
      if (!accountContainer) throw new AccountNotFoundError(uuid);

      const { data: accountData, metadata: accountMetadata } = accountContainer;

      // Password check for encrypted accounts if locked
      if (accountData.type !== 'publicKey' && !this.isUnlocked()) {
           if (!password) {
                 throw new KeyringError(`Password required to remove encrypted account "${accountMetadata.name}" while wallet is locked.`);
           }
           await this.getDecryptedSecret(uuid, password); // Verifies password, also unlocks instance if password was good
      }

      delete this._keyringData.accounts[uuid];

      if (this._keyringData.primaryMnemonicUUID === uuid) {
          this._keyringData.primaryMnemonicUUID = null;
      }

      if (this._keyringData.activeAccountUUID === uuid) {
          const remainingUuids = Object.keys(this._keyringData.accounts);
          this._keyringData.activeAccountUUID = remainingUuids.length > 0 ? remainingUuids[0] : null;
      }

      await this._saveKeyringData();
  }

  // --- Locking/Unlocking ---
  /**
   * Unlocks the keyring with the provided password.
   * @param {string} password - The user's password.
   * @returns {Promise<boolean>} True if unlock was successful.
   * @throws {KeyringNotInitializedError} If keyring isn't initialized.
   * @throws {IncorrectPasswordError} If password is wrong or decryption fails.
   */
  async unlock(password: string): Promise<boolean> {
    if (!this._keyringData && await KeyringManager.isInitialized()) { // Check persisted init
        await this.load(); // Load data if not present
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
        throw new KeyringNotInitializedError();
    }

    let derivedKey: Buffer;
    try {
        const saltBuffer = Buffer.from(this._keyringData.salt, 'hex');
        derivedKey = await this._deriveEncryptionKey(password, saltBuffer, this._keyringData.iterations);
    } catch (e: any) {
        this.lock(); // Ensure locked on failure
        throw new IncorrectPasswordError();
    }

    // Verify decryption with the first encrypted account, if one exists.
    const firstRealAccountContainer = Object.values(this._keyringData.accounts)
        .find(accContainer => accContainer.data.type !== 'publicKey');

    try {
        if (firstRealAccountContainer) {
            const { data: accountData, metadata } = firstRealAccountContainer;
            if (accountData.nonce === null) {
                throw new KeyringError(`Internal Error: Nonce is missing for verification account ${metadata.uuid} of type ${accountData.type}.`);
            }
            this._decrypt(accountData.encryptedSecret, accountData.nonce, derivedKey);
        }


        this._derivedKeyCache = derivedKey;
        return true;

    } catch (error) {
        this.lock(); // Ensure locked on failure
        if (error instanceof IncorrectPasswordError) throw error;
        // Other decryption errors usually mean incorrect password.
        throw new IncorrectPasswordError();
    }
  }

  /**
   * Locks the keyring by clearing the derived key cache.
   */
  lock(): void {
    if (this._derivedKeyCache) {
      try {
        this._derivedKeyCache.fill(0); // Securely clear the buffer
      } catch(e) { /* ignore errors during fill, e.g. if already cleared */ }
      this._derivedKeyCache = null;
    }
  }

  /**
   * Checks if the keyring is currently unlocked (i.e., derived key is in memory).
   * @returns {boolean} True if unlocked, false otherwise.
   */
  isUnlocked(): boolean {
    return this._derivedKeyCache !== null;
  }

  /**
   * Resets the keyring by removing all data from storage and locking the instance.
   */
  async reset(): Promise<void> {
    await removeFromStorage(KEYRING_STORAGE_KEY);
    this._keyringData = null;
    this.lock();
  }

  // --- Private Helpers ---
  /**
   * Saves the current state of _keyringData to storage.
   * @private
   */
  private async _saveKeyringData(): Promise<void> {
    if (!this._keyringData) throw new KeyringError("Internal Error: No keyring data to save.");
    if (this._keyringData.version !== KEYRING_CURRENT_VERSION) {
        throw new KeyringError(`Internal Error: Attempting to save data with incorrect version ${this._keyringData.version}. Expected ${KEYRING_CURRENT_VERSION}.`);
    }
    try {
      await saveToStorage(KEYRING_STORAGE_KEY, this._keyringData);
    } catch (error) {
        throw new KeyringError(`Storage save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Derives public key and account-specific metadata based on secret type.
   * @private
   */
  private _derivePublicKeyAndMeta(secret: string, type: SecretType, derivationPath?: string): { publicKey: string, metadataSpecifics: Partial<Pick<AccountMetadata, 'derivationPath'>> } {
      const metadataSpecifics: Partial<Pick<AccountMetadata, 'derivationPath'>> = {};
      let finalPublicKey: string;
      try {
          if (type === 'mnemonic') {
              const path = derivationPath || DEFAULT_DERIVATION_PATH;
              const { keypair } = CryptoUtils.generateWalletFromMnemonic(secret, path);
              metadataSpecifics.derivationPath = path;
              finalPublicKey = keypair.publicKey.toBase58();
          } else if (type === 'privateKey') {
              const { publicKey } = CryptoUtils.generateWalletFromPrivateKey(secret);
              finalPublicKey = publicKey;
          } else if (type === 'publicKey') {
              const pubKeyObj = CryptoUtils.validatePublicKeyString(secret);
              finalPublicKey = pubKeyObj.toBase58();
          } else {
                const exhaustiveCheck: never = type; // Should not happen with SecretType
                throw new Error(`Unsupported secret type encountered: ${exhaustiveCheck}`);
          }
          return { publicKey: finalPublicKey, metadataSpecifics };
      } catch (error: any) {
            if (error instanceof CryptoError) throw error;
            throw new KeyringError(`Failed to process ${type} to derive public key: ${error.message || String(error)}`);
      }
  }

  /**
   * Derives an encryption key from a password and salt using PBKDF2.
   * @private
   */
  private _deriveEncryptionKey(password: string, salt: Buffer, iterations: number): Promise<Buffer> {
      return new Promise((resolve, reject) => {
          if (!password) return reject(new KeyringError("Password cannot be empty for key derivation."));
          if (!salt || salt.length === 0) return reject(new KeyringError("Salt cannot be empty for key derivation."));

          crypto.pbkdf2(
              password,
              salt,
              iterations,
              DERIVED_KEY_LENGTH_BYTES,
              PBKDF2_DIGEST,
              (err, derivedKeyBuffer) => {
                  if (err) {
                      return reject(new KeyringError(`Key derivation failed: ${err.message}`));
                  }
                  if (!derivedKeyBuffer || derivedKeyBuffer.length !== DERIVED_KEY_LENGTH_BYTES) {
                      return reject(new KeyringError("Key derivation produced an invalid key length."));
                  }
                  resolve(derivedKeyBuffer);
              }
          );
      });
  }

  /**
   * Encrypts plaintext using TweetNaCl's secretbox.
   * @private
   */
  private _encrypt(plaintext: string, key: Buffer): { ciphertext: string; nonce: string } {
    try {
        const nonce = randomBytes(NONCE_LENGTH_BYTES);
        const plaintextBuffer = Buffer.from(plaintext, 'utf8');
        const ciphertextBuffer = secretbox(plaintextBuffer, nonce, key);
        if (!ciphertextBuffer) { // Should not happen with valid inputs
            throw new Error("Encryption resulted in null/empty ciphertext (tweetnacl.secretbox).");
        }
        const ciphertext = bs58.encode(ciphertextBuffer);
        const encodedNonce = bs58.encode(nonce);
        return { ciphertext, nonce: encodedNonce };
    } catch (error: any) {
        throw new KeyringError(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts ciphertext using TweetNaCl's secretbox.open.
   * @private
   */
  private _decrypt(ciphertextB58: string, nonceB58: string, key: Buffer): string {
    try {
        if (!ciphertextB58 || !nonceB58) {
            throw new KeyringError("Ciphertext or Nonce is missing for decryption.");
        }
        const ciphertext = bs58.decode(ciphertextB58);
        const nonce = bs58.decode(nonceB58);

        if (nonce.length !== NONCE_LENGTH_BYTES) {
            throw new Error(`Invalid nonce length: ${nonce.length}. Expected ${NONCE_LENGTH_BYTES}.`);
        }
        const plaintextBuffer = secretbox.open(ciphertext, nonce, key);
        if (plaintextBuffer === null) {
            // This typically means incorrect key (password) or corrupted data.
            throw new IncorrectPasswordError();
        }
        return Buffer.from(plaintextBuffer).toString('utf8');
    } catch (error: any) {
        if (error instanceof IncorrectPasswordError) {
             throw error;
        }
        // Handle potential base58 decoding errors or other unexpected issues during decryption.
        if (error.message?.includes("Non-base58 character")) {
             throw new KeyringError(`Decryption failed: Invalid ciphertext or nonce format (Non-base58). Potential data corruption or incorrect key.`);
        }
        throw new IncorrectPasswordError(); // Generalize other decryption failures
    }
  }

  /**
   * Changes the wallet's password. Re-encrypts all account secrets with the new password.
   * @param {string} oldPassword - The current password.
   * @param {string} newPassword - The new password.
   * @throws {KeyringNotInitializedError} If keyring isn't initialized.
   * @throws {IncorrectPasswordError} If the old password is wrong.
   * @throws {KeyringError} For other failures during re-encryption.
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!this._keyringData && await KeyringManager.isInitialized()) {
      await this.load();
    }
    if (!this._keyringData || this._keyringData.version !== KEYRING_CURRENT_VERSION) {
      throw new KeyringNotInitializedError();
    }

    const oldSalt = Buffer.from(this._keyringData.salt, 'hex');
    let oldDerivedKey: Buffer;
    try {
      oldDerivedKey = await this._deriveEncryptionKey(oldPassword, oldSalt, this._keyringData.iterations);
    } catch (e) {
      this.lock();
      throw new IncorrectPasswordError();
    }

    // Verify old password by trying to decrypt the first encrypted account
    const firstEncryptedAccount = Object.values(this._keyringData.accounts)
      .find(accContainer => accContainer.data.type !== 'publicKey');

    if (firstEncryptedAccount) {
      try {
        if (!firstEncryptedAccount.data.nonce) throw new KeyringError("Nonce missing for verification account.");
        this._decrypt(
          firstEncryptedAccount.data.encryptedSecret,
          firstEncryptedAccount.data.nonce,
          oldDerivedKey
        );
      } catch (error) {
        // If decryption fails, it's an incorrect old password
        this.lock();
        throw new IncorrectPasswordError();
      }
    }
    // If no encrypted accounts, key derivation success with old password is the check.

    // Derive new key with new salt and password
    const newSalt = crypto.randomBytes(SALT_SIZE_BYTES);
    const newMasterKey = await this._deriveEncryptionKey(newPassword, newSalt, this._keyringData.iterations);

    // Re-encrypt all encrypted accounts
    const updatedAccounts = { ...this._keyringData.accounts };
    for (const [uuid, accountContainer] of Object.entries(updatedAccounts)) {
      if (accountContainer.data.type !== 'publicKey') { // Only re-encrypt non-view-only accounts
        try {
          const decryptedSecret = this._decrypt(
            accountContainer.data.encryptedSecret,
            accountContainer.data.nonce!, // Nonce must exist for encrypted types
            oldDerivedKey
          );
          const { ciphertext, nonce } = this._encrypt(decryptedSecret, newMasterKey);
          updatedAccounts[uuid] = {
            ...accountContainer,
            data: {
              ...accountContainer.data,
              encryptedSecret: ciphertext,
              nonce: nonce,
            },
          };
        } catch (error) {
          // This is a critical internal error if re-encryption fails.
          this.lock();
          throw new KeyringError(`Failed to re-encrypt account "${accountContainer.metadata.name}". Wallet locked. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Update keyring data with new salt and re-encrypted accounts
    this._keyringData.salt = newSalt.toString('hex');
    this._keyringData.accounts = updatedAccounts;

    await this._saveKeyringData();

    this.lock(); // Lock the wallet after password change for security
  }

} // End KeyringManager Class