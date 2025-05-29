// src/background/handlers/keyringHandlers.ts
import { keyringManager, config } from '../shared/state';
import { KeyringManager, KeyringError, KeyringNotInitializedError, AccountExistsError, AccountNotFoundError } from '../../background/core/keyring/KeyringManager';
import { SecretType, AddAccountOptions } from '../core/keyring/types';
import { CryptoUtils, DEFAULT_DERIVATION_PATH } from '../../utils/cryptoutils';
import {
    resetLockAlarm,
    ensureKeyringLoaded,
    getOrderedAccounts,
    SendResponse,
    safeSendResponse
} from '../shared/helpers';
import bs58 from 'bs58';

/** Unlocks the wallet with the provided password. */
export async function handleUnlockWallet(
    payload: { password?: string },
    respond: SendResponse
): Promise<void> {
    const { password } = payload;
    if (!password) {
        throw new KeyringError('Password not provided.');
    }

    const unlocked = await keyringManager.unlock(password);

    if (unlocked) {
        try {
            await chrome.storage.local.set({ [config.STORAGE_LOCK_KEY]: false });
        } catch (storageError: any) {
           // console.warn('[handleUnlockWallet] Storage Error: Failed to set lock state.', storageError.message || storageError);
        }
        await resetLockAlarm();
        await ensureKeyringLoaded(); // ensureKeyringLoaded is async and might load data if needed
        const activeAccount = await keyringManager.getActiveAccountMetadata(); // Await the async getter
        safeSendResponse(respond, { success: true, activeAccount: activeAccount }, 'unlockWallet');
    } else {
        // This case should ideally be handled by keyringManager.unlock() throwing an error.
        // If it resolves false without an error, it's an unexpected state.
        throw new KeyringError('Unlock failed internally. Keyring did not unlock.');
    }
}

/** Resets the wallet, clearing all stored data. */
export async function handleResetWallet(
    _payload: unknown,
    respond: SendResponse
): Promise<void> {
    await keyringManager.reset(); // reset is async
    await chrome.storage.local.remove([
        config.ACCOUNT_ORDER_KEY,
        config.STORAGE_LOCK_KEY
    ]);
    await chrome.storage.session.clear(); // This is also async
    safeSendResponse(respond, { success: true }, 'resetWallet');
}

/** Retrieves metadata for all accounts if the wallet is unlocked. */
export async function handleGetAccountsMetadata(
    _payload: unknown,
    respond: SendResponse
): Promise<void> {
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Cannot get accounts metadata.");
    }
    await ensureKeyringLoaded();
    const orderedAccounts = await getOrderedAccounts(); // getOrderedAccounts is async
    const activeAccount = await keyringManager.getActiveAccountMetadata(); // Await the async getter
    safeSendResponse(respond, { success: true, accounts: orderedAccounts, activeAccount: activeAccount }, 'getAccountsMetadata');
}

/** Sets the active account. Requires wallet to be unlocked. */
export async function handleSetActiveAccount(
    payload: { uuid?: string },
    respond: SendResponse
): Promise<void> {
    const { uuid } = payload;
    if (!uuid) {
        throw new KeyringError("No account UUID provided.");
    }
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Cannot set active account.");
    }

    await keyringManager.setActiveAccount(uuid); // setActiveAccount is async
    const newActiveAccount = await keyringManager.getAccountMetadata(uuid); // Await the async getter
    if (!newActiveAccount) {
        // This implies setActiveAccount succeeded but then we couldn't retrieve the metadata,
        // which would be an inconsistent state.
        throw new KeyringError("Failed to retrieve metadata for the newly active account.");
    }
    safeSendResponse(respond, { success: true, activeAccount: newActiveAccount }, 'setActiveAccount');
}

/** Checks if the keyring has been initialized. */
export async function handleCheckKeyringStatus(
    _payload: unknown,
    respond: SendResponse
): Promise<void> {
    const isInitialized = await KeyringManager.isInitialized(); // isInitialized is static and async
    safeSendResponse(respond, { success: true, isInitialized: isInitialized }, 'checkKeyringStatus');
}

/** Adds a new account to the keyring. */
export async function handleAddAccount(
    payload: { secret?: string; type?: SecretType; options?: AddAccountOptions },
    respond: SendResponse
): Promise<void> {
    const { secret, type, options } = payload;
    if (!secret || !type) {
        throw new KeyringError("Missing secret or type for adding account.");
    }

    if (type !== 'publicKey') { // Encrypted types require unlock
        if (!keyringManager.isUnlocked()) {
            throw new KeyringError("Wallet locked. Unlock required to add this account type.");
        }
        await ensureKeyringLoaded(); // Ensure data is loaded before adding
    } else { // View-only can be added if keyring is initialized, even if locked
        if (!(await KeyringManager.isInitialized())) {
            throw new KeyringNotInitializedError();
        }
        // For view-only, ensureKeyringLoaded might still be beneficial if _keyringData could be null
        await ensureKeyringLoaded();
    }

    const newAccountMetadata = await keyringManager.addAccount(secret, type, options || {}); // addAccount is async

    try {
        // Update account order
        const orderResult = await chrome.storage.local.get(config.ACCOUNT_ORDER_KEY);
        let currentOrder: string[] = orderResult[config.ACCOUNT_ORDER_KEY] || [];
        if (!currentOrder.includes(newAccountMetadata.uuid)) {
            currentOrder.push(newAccountMetadata.uuid);
            await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: currentOrder });
        }
    } catch (e) {
       // console.warn('[handleAddAccount] Failed to update account order (non-critical):', e);
    }

    safeSendResponse(respond, { success: true, newAccountMetadata: newAccountMetadata }, 'addAccount');
}

/** Renames an account. Requires wallet to be unlocked. */
export async function handleRenameAccount(
    payload: { uuid?: string; newName?: string },
    respond: SendResponse
): Promise<void> {
    const { uuid, newName } = payload;
    const trimmedName = newName?.trim();

    if (!uuid || !trimmedName) {
        throw new KeyringError("Missing UUID or valid new name for renaming account.");
    }
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet locked. Unlock required to rename account.");
    }

    await keyringManager.updateAccountName(uuid, trimmedName); // updateAccountName is async
    safeSendResponse(respond, { success: true }, 'renameAccount');
}

/** Deletes an account. Requires wallet to be unlocked. */
export async function handleDeleteAccount(
    payload: { uuid?: string },
    respond: SendResponse
): Promise<void> {
    const { uuid } = payload;
    if (!uuid) {
        throw new KeyringError("Missing UUID for deleting account.");
    }

    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet locked. Unlock required to delete account.");
    }
    await ensureKeyringLoaded(); // Ensure keyring data is loaded

    const accountToDelete = await keyringManager.getAccountMetadata(uuid); // Await async getter
    if (!accountToDelete) {
        throw new AccountNotFoundError(uuid);
    }

    await keyringManager.removeAccount(uuid); // removeAccount is async

    try {
        const orderResult = await chrome.storage.local.get(config.ACCOUNT_ORDER_KEY);
        const currentOrder: string[] | undefined = orderResult[config.ACCOUNT_ORDER_KEY];
        if (Array.isArray(currentOrder)) {
            const updatedOrder = currentOrder.filter(id => id !== uuid);
            await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: updatedOrder });
        }
    } catch (e) {
      //  console.warn('[handleDeleteAccount] Failed to update account order storage (non-critical):', e);
    }

    const newActiveAccount = await keyringManager.getActiveAccountMetadata(); // Await async getter
    const newOrderedAccounts = await getOrderedAccounts(); // getOrderedAccounts is async
    safeSendResponse(respond, { success: true, activeAccount: newActiveAccount, allAccounts: newOrderedAccounts }, 'deleteAccount');
}

/** Saves the order of accounts. */
export async function handleSaveAccountOrder(
    payload: { orderedUuids?: string[] },
    respond: SendResponse
): Promise<void> {
    const { orderedUuids } = payload;
    if (!Array.isArray(orderedUuids)) {
        throw new KeyringError("Invalid account order provided. Expected an array of UUIDs.");
    }
    await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: orderedUuids });
    safeSendResponse(respond, { success: true }, 'saveAccountOrder');
}

/** Adds a new root mnemonic and its first derived account. Requires wallet unlock. */
export async function handleAddRootMnemonic(
    payload: { mnemonic?: string },
    respond: SendResponse
): Promise<void> {
    const { mnemonic } = payload;
    if (!mnemonic) {
        throw new KeyringError("Mnemonic phrase not provided.");
    }
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Cannot add recovery phrase.");
    }
    await ensureKeyringLoaded(); // Ensure keyring data is loaded

    if (!CryptoUtils.isValidMnemonic(mnemonic)) {
        throw new KeyringError("Invalid mnemonic phrase provided.");
    }

    const firstAccountPath = DEFAULT_DERIVATION_PATH;
    const { publicKey: firstPublicKey } = CryptoUtils.generateWalletFromMnemonic(mnemonic, firstAccountPath);
    if (await keyringManager.findAccountByPublicKey(firstPublicKey)) { // Await async getter
        throw new AccountExistsError(`Account with public key ${firstPublicKey} derived from this phrase already exists.`);
    }

    const addOptions: AddAccountOptions = {
        derivationPath: firstAccountPath,
        name: "Account 1", // Default name for the first account from this new mnemonic
        makeActive: true
    };
    const newAccountMetadata = await keyringManager.addAccount(mnemonic, 'mnemonic', addOptions); // addAccount is async

    try {
        const orderResult = await chrome.storage.local.get(config.ACCOUNT_ORDER_KEY);
        let currentOrder: string[] = orderResult[config.ACCOUNT_ORDER_KEY] || [];
        if (!currentOrder.includes(newAccountMetadata.uuid)) {
            currentOrder.push(newAccountMetadata.uuid);
            await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: currentOrder });
        }
    } catch (e) {
      //  console.warn('[handleAddRootMnemonic] Failed to update account order (non-critical):', e);
    }
    safeSendResponse(respond, { success: true, newAccountMetadata: newAccountMetadata }, 'addRootMnemonic');
}

/** Changes the wallet password. */
export async function handleChangePassword(
    payload: { currentPassword?: string; newPassword?: string },
    respond: SendResponse
): Promise<void> {
    const { currentPassword, newPassword } = payload;
    if (!currentPassword || !newPassword) {
        throw new KeyringError('Old and new passwords are required.');
    }
    await keyringManager.changePassword(currentPassword, newPassword); // changePassword is async
    safeSendResponse(respond, { success: true }, 'changePassword');
}

/** Reveals the private key for an account. Requires password authorization. */
export async function handleRequestPrivateKey(
    payload: { uuid?: string; password?: string },
    respond: SendResponse
): Promise<void> {
    const { uuid, password } = payload;
    if (!uuid || !password) {
        throw new KeyringError("Account UUID and password are required to show private key.");
    }

    // getDecryptedSecret is already async
    const decrypted = await keyringManager.getDecryptedSecret(uuid, password);
    const accountMetadata = await keyringManager.getAccountMetadata(uuid); // Await async getter

    if (!accountMetadata) {
        throw new AccountNotFoundError(uuid);
    }

    let privateKeyToRespond: string;

    if (decrypted.type === 'privateKey') {
        privateKeyToRespond = decrypted.secret;
    } else if (decrypted.type === 'mnemonic') {
        const mnemonicSecret = decrypted.secret;
        const derivationPath = accountMetadata.derivationPath || DEFAULT_DERIVATION_PATH;
        try {
            const { keypair } = CryptoUtils.generateWalletFromMnemonic(mnemonicSecret, derivationPath);
            privateKeyToRespond = bs58.encode(keypair.secretKey);
        } catch (error: any) {
            throw new KeyringError(`Failed to derive private key from recovery phrase: ${error.message}`);
        }
    } else { // 'publicKey'
        throw new KeyringError("This is a view-only account and does not have a private key that can be revealed.");
    }

    safeSendResponse(respond, { success: true, privateKey: privateKeyToRespond }, 'requestPrivateKey');
}

/** Reveals the seed phrase for an account. Requires password authorization. */
export async function handleRequestSeedPhrase(
    payload: { uuid?: string; password?: string },
    respond: SendResponse
): Promise<void> {
    const { uuid, password } = payload;
    if (!uuid || !password) {
        throw new KeyringError("Account UUID and password are required to show seed phrase.");
    }

    // getDecryptedSecret is already async
    const decrypted = await keyringManager.getDecryptedSecret(uuid, password);

    if (decrypted.type === 'mnemonic') {
        safeSendResponse(respond, { success: true, seedPhrase: decrypted.secret }, 'requestSeedPhrase');
    } else {
        throw new KeyringError("No recovery phrase is associated with this account. It might have been imported via private key or is a view-only account.");
    }
}