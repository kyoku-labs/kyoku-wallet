// src/background/handlers/dataHandlers.ts
import { getFromStorage } from '../../utils/storage';
import { config, getConnection, keyringManager, setStagedSecretData } from '../shared/state';
import { KeyringManager, KeyringError, NoMnemonicSeedError } from '../../background/core/keyring/KeyringManager'; // Added NoMnemonicSeedError
import { DerivedAccountInfo, SecretType, AccountMetadata } from '../core/keyring/types';
import { CryptoUtils } from '../../utils/cryptoutils';
import { SendResponse, getOrderedAccounts, ensureKeyringLoaded, safeSendResponse } from '../shared/helpers';
import { Cluster, PublicKey } from '@solana/web3.js';
import { DEFAULT_EXPLORER_ID, SUPPORTED_EXPLORERS } from '../../utils/explorerUtils';

// Type for stored network config
interface NetworkConfig {
    network: Cluster | 'custom';
    customRpcUrl: string | null;
}

export async function handleGetInitialState(
    _payload: unknown,
    respond: SendResponse
): Promise<void> {
    let storageResult, storedNetworkConfig, storedExplorerPreferenceId,
        storedCurrency, storedLanguage;

    try {
        [
            storageResult,
            storedNetworkConfig,
            storedExplorerPreferenceId,
            storedCurrency,
            storedLanguage
        ] = await Promise.all([
            chrome.storage.local.get(config.STORAGE_LOCK_KEY),
            getFromStorage<NetworkConfig>(config.NETWORK_CONFIG_KEY),
            getFromStorage<string>(config.EXPLORER_PREFERENCE_KEY),
            getFromStorage<string>(config.CURRENCY_SETTING_KEY),
            getFromStorage<string>(config.LANGUAGE_SETTING_KEY)
        ]);
    } catch (error: any) {
       // console.error("[handleGetInitialState] Critical error loading from storage:", error);
        // Respond with a default "locked" state to allow UI to initialize minimally
        safeSendResponse(respond, {
            success: false, // Indicate that initial state loading failed
            isLocked: true,
            activeAccount: null,
            allAccounts: [],
            network: 'mainnet-beta',
            customRpcUrl: null,
            preferredExplorerId: DEFAULT_EXPLORER_ID,
            selectedCurrency: 'USD', // Default currency
            selectedLanguage: 'en',  // Default language
            error: "Failed to load critical settings from storage. Wallet is locked."
        }, 'handleGetInitialState_criticalError');
        return;
    }

    const isInitialized = await KeyringManager.isInitialized();
    const lockedFromStorage = storageResult?.[config.STORAGE_LOCK_KEY];
    let isEffectivelyLocked = !isInitialized || lockedFromStorage !== false;

    const networkConfig: NetworkConfig = storedNetworkConfig || {
        network: 'mainnet-beta',
        customRpcUrl: null
    };

    let preferredExplorerId = DEFAULT_EXPLORER_ID;
    if (storedExplorerPreferenceId && SUPPORTED_EXPLORERS.some(e => e.id === storedExplorerPreferenceId)) {
        preferredExplorerId = storedExplorerPreferenceId;
    }

    const finalSelectedCurrency = storedCurrency || 'USD';
    const finalSelectedLanguage = storedLanguage || 'en';

    if (isEffectivelyLocked) {
        if (keyringManager.isUnlocked()) {
            keyringManager.lock();
        }
        if (lockedFromStorage !== true) {
            try {
                await chrome.storage.local.set({ [config.STORAGE_LOCK_KEY]: true });
            } catch (e) {
              //  console.warn('[handleGetInitialState] Failed to set lock state in storage (non-critical):', e);
            }
        }
        safeSendResponse(respond, {
            success: true,
            isLocked: true,
            activeAccount: null,
            allAccounts: [],
            network: networkConfig.network,
            customRpcUrl: networkConfig.customRpcUrl,
            preferredExplorerId: preferredExplorerId,
            selectedCurrency: finalSelectedCurrency,
            selectedLanguage: finalSelectedLanguage,
        }, 'handleGetInitialState_locked');
        return;
    }

    if (!keyringManager.isUnlocked()) {
        try {
            await chrome.storage.local.set({ [config.STORAGE_LOCK_KEY]: true });
        } catch(e) {
        //    console.warn('[handleGetInitialState] Failed to set lock state for instanceLocked case (non-critical):', e);
        }
        safeSendResponse(respond, {
            success: true,
            isLocked: true,
            activeAccount: null,
            allAccounts: [],
            network: networkConfig.network,
            customRpcUrl: networkConfig.customRpcUrl,
            preferredExplorerId: preferredExplorerId,
            selectedCurrency: finalSelectedCurrency,
            selectedLanguage: finalSelectedLanguage,
        }, 'handleGetInitialState_instanceLocked');
        return;
    }

    await ensureKeyringLoaded();
    const orderedAccounts = await getOrderedAccounts(); // AWAITED (already async)
    let currentActiveAccountMeta = await keyringManager.getActiveAccountMetadata(); // AWAITED

    if ((!currentActiveAccountMeta && orderedAccounts.length > 0) ||
        (currentActiveAccountMeta && !orderedAccounts.some(a => a.uuid === currentActiveAccountMeta?.uuid))) {
        currentActiveAccountMeta = orderedAccounts.length > 0 ? orderedAccounts[0] : null;
        if (currentActiveAccountMeta?.uuid) {
            try {
                await keyringManager.setActiveAccount(currentActiveAccountMeta.uuid); // AWAITED
            } catch (setActiveErr) {
              //  console.warn("[handleGetInitialState] Failed to set default active account:", setActiveErr);
                currentActiveAccountMeta = null;
            }
        }
    }

    safeSendResponse(respond, {
        success: true,
        isLocked: false,
        activeAccount: currentActiveAccountMeta,
        allAccounts: orderedAccounts,
        network: networkConfig.network,
        customRpcUrl: networkConfig.customRpcUrl,
        preferredExplorerId: preferredExplorerId,
        selectedCurrency: finalSelectedCurrency,
        selectedLanguage: finalSelectedLanguage,
    }, 'handleGetInitialState_unlocked');
}

export async function handleStartMnemonicScan(
    payload: { mnemonic?: string },
    respond: SendResponse
): Promise<void> {
    const { mnemonic } = payload;

    if (!mnemonic) {
        throw new KeyringError("Mnemonic not provided.");
    }
    if (!CryptoUtils.isValidMnemonic(mnemonic)) {
        throw new KeyringError('Invalid mnemonic phrase provided.');
    }

    const connection = await getConnection();
    if (!connection) {
        throw new Error("Solana connection could not be established for mnemonic scan.");
    }

    await setStagedSecretData({ secret: mnemonic, type: 'mnemonic' as SecretType });

    const seed = CryptoUtils.mnemonicToSeed(mnemonic);
    const ACCOUNTS_TO_CHECK = 10;
    const pathsToCheck = Array.from({ length: ACCOUNTS_TO_CHECK }, (_, i) => `m/44'/501'/${i}'/0'`);
    const derivedItems: { path: string; publicKey: PublicKey }[] = [];

    pathsToCheck.forEach(path => {
        try {
            const kp = CryptoUtils.deriveSolanaKeypair(seed, path);
            derivedItems.push({ path: path, publicKey: kp.publicKey });
        } catch (e) {
            //console.warn(`[handleStartMnemonicScan] Error deriving keypair for path ${path}:`, e);
        }
    });

    if (derivedItems.length === 0) {
        await setStagedSecretData(null);
        throw new Error("Could not derive any valid accounts from the provided mnemonic.");
    }

    const results: DerivedAccountInfo[] = [];
    const publicKeys = derivedItems.map(item => item.publicKey);
    const batchSize = 50;

    for (let i = 0; i < publicKeys.length; i += batchSize) {
        const batchSliceKeys = publicKeys.slice(i, i + batchSize);
        const batchSliceItems = derivedItems.slice(i, i + batchSize);

        try {
            const accountsInfo = await connection.getMultipleAccountsInfo(batchSliceKeys);
            accountsInfo.forEach((accInfo, index) => {
                const item = batchSliceItems[index];
                if (item) {
                    results.push({
                        publicKey: item.publicKey.toBase58(),
                        derivationPath: item.path,
                        balance: accInfo?.lamports || 0
                    });
                }
            });
        } catch (batchError: any) {
            await setStagedSecretData(null);
            if (batchError.message?.includes('403')) {
                throw new Error(`Network request forbidden (403). Check RPC endpoint/key or network connectivity.`);
            }
         //   console.error("[handleStartMnemonicScan] Network error fetching balances:", batchError);
            throw new Error(`Network error fetching balances: ${batchError.message}`);
        }
    }

    let accountsToShow: DerivedAccountInfo[];
    const fundedAccounts = results.filter(acc => acc.balance > 0);

    if (fundedAccounts.length > 0) {
        accountsToShow = fundedAccounts;
    } else if (results.length > 0) {
        accountsToShow = [results[0]];
    } else {
        accountsToShow = [];
    }

    safeSendResponse(respond, { success: true, accountsToShow: accountsToShow }, 'handleStartMnemonicScan');
}

export async function handleCreateNewDerivedAccount(
    _payload: unknown,
    respond: SendResponse
): Promise<void> {
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Cannot create new derived account.");
    }

    await ensureKeyringLoaded();
    // addNextDerivedAccount can throw NoMnemonicSeedError or other KeyringErrors
    let newAccountMetadata: AccountMetadata;
    try {
        newAccountMetadata = await keyringManager.addNextDerivedAccount({ makeActive: true }); // AWAITED
    } catch (error) {
        if (error instanceof NoMnemonicSeedError) {
            // Specific handling for NoMnemonicSeedError to inform UI potentially
           // console.warn("[handleCreateNewDerivedAccount] NoMnemonicSeedError encountered.");
        }
        throw error; // Re-throw to be caught by withErrorHandling
    }


    try {
        const orderedAccounts = await getOrderedAccounts(); // AWAITED (already async)
        const finalOrder = orderedAccounts.map(a => a.uuid);
        await chrome.storage.local.set({ [config.ACCOUNT_ORDER_KEY]: finalOrder });
    } catch(e) {
       // console.warn("[handleCreateNewDerivedAccount] Failed to update account order (non-critical):", e);
    }

    safeSendResponse(respond, { success: true, newAccountMetadata: newAccountMetadata }, 'handleCreateNewDerivedAccount');
}