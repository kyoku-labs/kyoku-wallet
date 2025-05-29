// src/background/handlers/onboardingHandlers.ts
import { keyringManager, config, getStagedSecretData, setStagedSecretData } from '../shared/state';
import { AccountMetadata, AddAccountOptions} from '../core/keyring/types'; // Added SecretType
import { DEFAULT_DERIVATION_PATH } from '../../utils/cryptoutils';
import { SendResponse, resetLockAlarm, getOrderedAccounts, safeSendResponse } from '../shared/helpers';
import { KeyringError } from '../../background/core/keyring/KeyringManager';

/**
 * Initializes the wallet with the staged secret and password.
 * Can create multiple accounts if selectedPaths are provided in stagedData.
 * @param payload - Contains the user's password.
 * @param respond - Callback function to send the response.
 */
export async function handleInitializeWallet(
    payload: { password?: string },
    respond: SendResponse
): Promise<void> {
    const { password } = payload;
    const stagedData = await getStagedSecretData();

    if (!stagedData) {
        // For critical setup errors, clearing staged data and throwing is appropriate.
        await setStagedSecretData(null);
        throw new KeyringError("No secret was staged for initialization.");
    }
    if (!password) {
        await setStagedSecretData(null);
        throw new KeyringError("Password missing for initialization.");
    }
    if (stagedData.type === 'publicKey') {
        await setStagedSecretData(null);
        throw new KeyringError("Cannot initialize wallet with a view-only account.");
    }

    const { secret, type, selectedPaths } = stagedData;
    const addedAccounts: AccountMetadata[] = [];
    let firstAccountResult: AccountMetadata; // Should be non-null if successful

    const firstPath = (type === 'mnemonic' && selectedPaths && selectedPaths.length > 0)
                        ? selectedPaths[0]
                        : (type === 'mnemonic' ? DEFAULT_DERIVATION_PATH : undefined);

    const firstAccountOptions: AddAccountOptions = {
         name: 'Account 1', makeActive: true, derivationPath: firstPath
    };

    // initializeFirstAccount can throw KeyringError, IncorrectPasswordError etc.
    // Ensure keyringManager.initializeFirstAccount is awaited as it's now async
    firstAccountResult = await keyringManager.initializeFirstAccount(
        secret, type, password, firstAccountOptions
    );
    addedAccounts.push(firstAccountResult);

    // If multiple paths were selected (e.g., during mnemonic scan), add them
    if (type === 'mnemonic' && selectedPaths && selectedPaths.length > 1) {
        for (let i = 1; i < selectedPaths.length; i++) {
            const path = selectedPaths[i];
            try { // Attempt to add each additional account
                const accountName = `Account ${i + 1}`;
                const options: AddAccountOptions = { derivationPath: path, name: accountName, makeActive: false };
                // Ensure keyringManager.addAccount is awaited as it's now async
                const newMeta = await keyringManager.addAccount(secret, 'mnemonic', options);
                addedAccounts.push(newMeta);
            } catch (addError: any) {
                // Log and continue if one account fails, don't stop the whole process.
                // Error added to response in handleImportFromStagedMnemonic.
               // console.warn(`[handleInitializeWallet] Error adding account for path ${path}:`, addError.message);
            }
        }
    }

    await setStagedSecretData(null); // Clear staged data after use

    try { // Non-critical: Save initial account order
         const finalOrder = addedAccounts.map(a => a.uuid);
         await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: finalOrder });
    } catch(e) {
        // Failed to save initial account order (non-critical)
       // console.warn('[handleInitializeWallet] Failed to save initial account order (non-critical):', e);
    }

    await chrome.storage.local.set({ [config.STORAGE_LOCK_KEY]: false });
    await resetLockAlarm();

    safeSendResponse(respond, { success: true, firstAccount: firstAccountResult }, 'initializeWallet');
}

/**
 * Imports accounts into an EXISTING wallet using a staged mnemonic and selected derivation paths.
 * @param payload - Contains an array of derivation paths for the accounts to import.
 * @param respond - Callback function to send the response.
 */
export async function handleImportFromStagedMnemonic(
    payload: { paths?: string[] },
    respond: SendResponse
): Promise<void> {
    const { paths } = payload;
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new KeyringError("No derivation paths provided for import.");
    }

    const stagedData = await getStagedSecretData();
    if (!stagedData || stagedData.type !== 'mnemonic') {
        await setStagedSecretData(null); // Clear invalid staged data
        throw new KeyringError("No valid mnemonic phrase was staged for import.");
    }

    const mnemonic = stagedData.secret;
    await setStagedSecretData(null); // Clear staged data immediately after retrieval

    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Cannot import accounts.");
    }

    const addedAccounts: AccountMetadata[] = [];
    let firstErrorMessage: string | null = null;
    let accountsAddedSuccess = 0;

    let highestExistingNumber = 0;
    try { // Determine next account name based on existing "Account X" pattern (non-critical)
        // Ensure keyringManager.getAllAccountMetadata is awaited as it's now async
        const allMeta = await keyringManager.getAllAccountMetadata();
        const accountNameRegex = /^Account (\d+)$/i;
        allMeta.forEach(meta => {
            const match = meta.name.match(accountNameRegex);
            if (match?.[1]) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > highestExistingNumber) highestExistingNumber = num;
            }
        });
    } catch (e) {
        // Error getting existing accounts for naming (non-critical)
       // console.warn('[handleImportFromStagedMnemonic] Error getting existing accounts for naming (non-critical):', e);
    }

    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        try { // Attempt to add each account
            const accountName = `Account ${highestExistingNumber + 1 + accountsAddedSuccess}`; // Name based on success count
            const options: AddAccountOptions = { derivationPath: path, name: accountName, makeActive: i === 0 && addedAccounts.length === 0 };
            // Ensure keyringManager.addAccount is awaited as it's now async
            const newAccountMetadata = await keyringManager.addAccount(mnemonic, 'mnemonic', options);
            addedAccounts.push(newAccountMetadata);
            accountsAddedSuccess++;
        } catch (error: any) {
          //  console.error(`[handleImportFromStagedMnemonic] Error importing path ${path}:`, error);
            if (!firstErrorMessage) { // Store only the first error message
                firstErrorMessage = error.message || "An unknown error occurred while importing an account.";
            }
            // Continue importing other accounts even if one fails
        }
    }

    if (addedAccounts.length > 0) {
        try { // Non-critical: Update account order in storage
            // getOrderedAccounts is already async and handles awaiting keyringManager.getAllAccountMetadata
            const orderedAccounts = await getOrderedAccounts();
            const finalOrder = orderedAccounts.map(a => a.uuid);
            await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: finalOrder });
        } catch(e) {
            // Failed to update account order (non-critical)
          //  console.warn('[handleImportFromStagedMnemonic] Failed to update account order (non-critical):', e);
        }
    }

    if (accountsAddedSuccess > 0) {
        safeSendResponse(respond, {
            success: true, // Overall success if at least one account was added
            addedAccounts: addedAccounts,
            error: firstErrorMessage // Include the first error message if any occurred
        }, 'importFromStagedMnemonic');
    } else {
        // If no accounts were added, it's a failure.
        throw new KeyringError(firstErrorMessage || "Failed to import any accounts.");
    }
}