// src/background/index.ts

// --- State, Config, Helpers ---
import {
    keyringManager,
    getStagedSecretData,
    setStagedSecretData,
    getCurrentNetworkConfig,
    getUserPriorityFeeLevelSetting,
    getConnection,
    config,
    ConnectedDappInfo,
} from './shared/state';
import {
    clearLockAlarm,
    resetLockAlarm,
    lockWalletState,
    notifyPopupToLock,
    safeSendResponse,
    ensureKeyringLoaded
} from './shared/helpers';
import type { BackgroundHandler } from './shared/types';
import { getFromStorage, saveToStorage } from '../utils/storage';

// --- Import Specific Application Logic Handlers ---
import {
    handleUnlockWallet,
    handleResetWallet,
    handleGetAccountsMetadata,
    handleSetActiveAccount,
    handleCheckKeyringStatus,
    handleAddAccount,
    handleRenameAccount,
    handleDeleteAccount,
    handleSaveAccountOrder,
    handleAddRootMnemonic,
    handleChangePassword,
    handleRequestPrivateKey,
    handleRequestSeedPhrase
} from './handlers/keyringHandlers';
import {
    handleInitializeWallet,
    handleImportFromStagedMnemonic
} from './handlers/onboardingHandlers';
import {
    handleGetInitialState,
    handleStartMnemonicScan,
    handleCreateNewDerivedAccount
} from './handlers/dataHandlers';
import {
    handleSetNetworkConfiguration,
    handleGetNetworkConfiguration
} from './handlers/networkHandlers';
import {
    handleBurnTokenRequest,
    handleBurnNftRequest,
} from './handlers/burnHandlers';

// --- Swap Service Imports ---
import {
    getSwapQuote,
    getSwapTransaction,
    getJupiterTokenList,
} from './services/swapService';

// --- NFT Service Imports ---
import { fetchNFTsByOwner } from './services/nftService';
import { fetchNFTAssetDetails as fetchNFTAssetDetailsService } from './services/nftService';
import { CollectibleInfo } from './services/nftTypes';

// --- Portfolio Service Imports ---
import { fetchPortfolio } from './services/portfolioService';
import { TokenInfo } from './core/keyring/types';

// --- Import dApp Interaction Logic ---
import {
    DAPP_ACTION_TYPES,
    pendingPopupRequests,
    closePopupWindow,
    handleDAppConnectRequest,
    handleDAppSignMessageRequest,
    handleDAppSignAllTransactionsRequest,
    handleDAppSignAndSendTransactionRequest
} from './handlers/dappHandlers';

// --- Error Handling Wrapper ---
import { withErrorHandling } from './shared/errorHandlers';
import { KeyringError, AccountNotFoundError } from './core/keyring/KeyringManager';

// --- Import to Setup Event Listeners ---
import './eventListeners'; // This sets up chrome.alarms, chrome.runtime.onInstalled, etc.

// --- Transaction Building & Sending Logic ---
import { buildTransaction, buildNftBatchTransferTransaction } from './shared/transactionBuilder';
import { simulateAndParseTransaction, type DetailedTransactionPreview } from './shared/simulationParser';
import { processSignAndSendTransaction } from './shared/signingHandlers';

// --- Solana specific imports needed for handlers directly in this file ---
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

// Polyfill window for Service Worker environment if it's not already defined
if (typeof window === 'undefined' && typeof self !== 'undefined') {
  // @ts-ignore
  globalThis.window = self;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message.type || message.action;
    const dAppMessagePayload = message.data;
    const internalMessagePayload = message.payload;

    let isAsync = false;

    // --- DApp Messages ---
    if (action === DAPP_ACTION_TYPES.CHECK_CONNECTION_STATUS) {
        isAsync = true;
        (async () => {
            try {
                const storageLockValue = await getFromStorage<boolean>(config.STORAGE_LOCK_KEY);
                const isPersistedAsUnlocked = storageLockValue === false;

                if (isPersistedAsUnlocked) {
                    await ensureKeyringLoaded();
                    const activeAccountMeta = await keyringManager.getActiveAccountMetadata(); // AWAITED

                    if (activeAccountMeta && activeAccountMeta.publicKey) {
                        sendResponse({ data: { isConnected: true, publicKey: { __publicKeyB58__: activeAccountMeta.publicKey } } });
                    } else {
                        sendResponse({ data: { isConnected: false, publicKey: null } });
                    }
                } else {
                    sendResponse({ data: { isConnected: false, publicKey: null } });
                }
            } catch (e: any) {
              //  console.error("Error in KYOKU_CHECK_CONNECTION_STATUS handler (modified):", e);
                sendResponse({ data: { isConnected: false, publicKey: null, error: e.message } });
            }
        })();
    }
    else if (action === DAPP_ACTION_TYPES.CONNECT_REQUEST) {
        isAsync = true;
        const handler: BackgroundHandler<any, void> = async (payload, respond) => handleDAppConnectRequest(payload, respond, sender);
        withErrorHandling(handler, DAPP_ACTION_TYPES.CONNECT_REQUEST)(dAppMessagePayload, sendResponse);
    }
    else if (action === DAPP_ACTION_TYPES.SIGN_MESSAGE_REQUEST) {
        isAsync = true;
        const handler: BackgroundHandler<any, void> = async (payload, respond) => handleDAppSignMessageRequest(payload, respond, sender);
        withErrorHandling(handler, DAPP_ACTION_TYPES.SIGN_MESSAGE_REQUEST)(dAppMessagePayload, sendResponse);
    }
    else if (action === DAPP_ACTION_TYPES.SIGN_ALL_TRANSACTIONS_REQUEST) {
        isAsync = true;
        const handler: BackgroundHandler<any, void> = async (payload, respond) => handleDAppSignAllTransactionsRequest(payload, respond, sender);
        withErrorHandling(handler, DAPP_ACTION_TYPES.SIGN_ALL_TRANSACTIONS_REQUEST)(dAppMessagePayload, sendResponse);
    }
    else if (action === DAPP_ACTION_TYPES.SIGN_AND_SEND_TRANSACTION_REQUEST) {
        isAsync = true;
        const handler: BackgroundHandler<any, void> = async (payload, respond) => handleDAppSignAndSendTransactionRequest(payload, respond, sender);
        withErrorHandling(handler, DAPP_ACTION_TYPES.SIGN_AND_SEND_TRANSACTION_REQUEST)(dAppMessagePayload, sendResponse);
    }
    else if (action === DAPP_ACTION_TYPES.DISCONNECT_REQUEST) {
        isAsync = true;
        (async () => {
            if (sender.tab?.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    target: 'KYOKU_CONTENT_SCRIPT_BROADCAST',
                    eventName: 'disconnect',
                    eventData: { message: "User initiated disconnect from wallet." }
                }).catch(() => {/* ignore errors sending to tabs that might not have content script */});
            }
            sendResponse({ data: { success: true } });
        })();
    }
    // --- Popup Response Handler (from confirmation window) ---
    else if (action === DAPP_ACTION_TYPES.POPUP_RESPONSE) {
        const popupData = message.data;
        const { requestId, approved, ...responseData } = popupData || {};

        if (requestId) {
            const promiseCallbacks = pendingPopupRequests.get(requestId);
            if (promiseCallbacks) {
                if (approved) {
                    promiseCallbacks.resolve({ approved: true, ...responseData });
                } else {
                    const errorReason = responseData.error || "User rejected the request in popup.";
                    promiseCallbacks.reject(new Error(typeof errorReason === 'string' ? errorReason : JSON.stringify(errorReason)));
                }
                pendingPopupRequests.delete(requestId);
            }
            closePopupWindow(requestId);
            safeSendResponse(sendResponse, { success: true, message: "Popup action processed." }, 'POPUP_RESPONSE');
        } else {
            safeSendResponse(sendResponse, { success: false, error: "Malformed popup response." }, 'POPUP_RESPONSE_ERROR');
        }
    }

    // --- Internal Extension Message Handlers ---
    else if (action === 'resetAutoLockTimer') { if (keyringManager.isUnlocked()) { resetLockAlarm(); } sendResponse({ success: true }); }
    else if (action === 'clearAutoLockTimer') { clearLockAlarm(); sendResponse({ success: true }); }
    else if (action === 'forceLockWallet') { isAsync = true; lockWalletState().then(() => notifyPopupToLock()).then(() => sendResponse({ success: true })); }

    // Keyring Handlers
    else if (action === 'unlockWallet') { isAsync = true; withErrorHandling(handleUnlockWallet, 'unlockWallet')(internalMessagePayload, sendResponse); }
    else if (action === 'resetWallet') { isAsync = true; withErrorHandling(handleResetWallet, 'resetWallet')(internalMessagePayload || {}, sendResponse); }
    else if (action === 'getAccountsMetadata') { isAsync = true; withErrorHandling(handleGetAccountsMetadata, 'getAccountsMetadata')(internalMessagePayload || {}, sendResponse); }
    else if (action === 'setActiveAccount') { isAsync = true; withErrorHandling(handleSetActiveAccount, 'setActiveAccount')(internalMessagePayload, sendResponse); }
    else if (action === 'checkKeyringStatus') { isAsync = true; withErrorHandling(handleCheckKeyringStatus, 'checkKeyringStatus')(internalMessagePayload || {}, sendResponse); }
    else if (action === 'addAccount') { isAsync = true; withErrorHandling(handleAddAccount, 'addAccount')(internalMessagePayload, sendResponse); }
    else if (action === 'renameAccount') { isAsync = true; withErrorHandling(handleRenameAccount, 'renameAccount')(internalMessagePayload, sendResponse); }
    else if (action === 'deleteAccount') { isAsync = true; withErrorHandling(handleDeleteAccount, 'deleteAccount')(internalMessagePayload, sendResponse); }
    else if (action === 'saveAccountOrder') { isAsync = true; withErrorHandling(handleSaveAccountOrder, 'saveAccountOrder')(internalMessagePayload, sendResponse); }
    else if (action === 'addRootMnemonic') { isAsync = true; withErrorHandling(handleAddRootMnemonic, 'addRootMnemonic')(internalMessagePayload, sendResponse); }
    else if (action === 'changePassword') { isAsync = true; withErrorHandling(handleChangePassword, 'changePassword')(internalMessagePayload, sendResponse); }
    else if (action === 'requestPrivateKey') { isAsync = true; withErrorHandling(handleRequestPrivateKey, 'requestPrivateKey')(internalMessagePayload, sendResponse); }
    else if (action === 'requestSeedPhrase') { isAsync = true; withErrorHandling(handleRequestSeedPhrase, 'requestSeedPhrase')(internalMessagePayload, sendResponse); }
    // PFP Preference Handler
    else if (action === 'setAccountPfpPreference') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const { accountUuid, pfpMintAddress } = payload;
            if (!accountUuid || (pfpMintAddress !== null && typeof pfpMintAddress !== 'string')) {
                throw new KeyringError("Invalid payload for setting PFP preference. Requires accountUuid and valid pfpMintAddress (string or null).");
            }
            const accountMeta = await keyringManager.getAccountMetadata(accountUuid); // AWAITED
            if (!accountMeta) {
                 throw new AccountNotFoundError(accountUuid);
            }
            if (!keyringManager.isUnlocked() && !accountMeta.isViewOnly) {
                throw new KeyringError("Wallet must be unlocked to set PFP for this account type.");
            }
            await keyringManager.updateAccountPfp(accountUuid, pfpMintAddress);
            respond({ success: true });
        }, 'setAccountPfpPreference')(internalMessagePayload, sendResponse);
    }

    // Onboarding Handlers
    else if (action === 'stageSecretForSetup') {
        isAsync = true;
        if (internalMessagePayload && typeof internalMessagePayload.secret === 'string' && typeof internalMessagePayload.type === 'string') {
            setStagedSecretData({ secret: internalMessagePayload.secret, type: internalMessagePayload.type as any, selectedPaths: internalMessagePayload.selectedPaths })
                .then(() => sendResponse({ success: true }))
                .catch(e => { sendResponse({ success: false, error: e.message || "Failed to stage secret" }); });
        } else { sendResponse({ success: false, error: "Invalid payload for stageSecretForSetup" }); isAsync = false; }
    }
    else if (action === 'initializeWallet') { isAsync = true; withErrorHandling(handleInitializeWallet, 'initializeWallet')(internalMessagePayload, sendResponse); }
    else if (action === 'importFromStagedMnemonic') { isAsync = true; withErrorHandling(handleImportFromStagedMnemonic, 'importFromStagedMnemonic')(internalMessagePayload, sendResponse); }
    else if (action === 'isSecretStaged') {
        isAsync = true;
        (async () => {
            try {
                const secretInfo = await getStagedSecretData();
                sendResponse({ success: true, isStaged: secretInfo !== null });
            } catch (e: any) {
                sendResponse({ success: false, error: e.message || "Failed to check staged secret", isStaged: false });
            }
        })();
    }

    // Data Handlers
    else if (action === 'getInitialState') { isAsync = true; withErrorHandling(handleGetInitialState, 'getInitialState')(internalMessagePayload || {}, sendResponse); }
    else if (action === 'startMnemonicScan') { isAsync = true; withErrorHandling(handleStartMnemonicScan, 'startMnemonicScan')(internalMessagePayload, sendResponse); }
    else if (action === 'createNewDerivedAccount') { isAsync = true; withErrorHandling(handleCreateNewDerivedAccount, 'createNewDerivedAccount')(internalMessagePayload || {}, sendResponse); }

    // Network Handlers
    else if (action === 'setNetworkConfiguration') { isAsync = true; withErrorHandling(handleSetNetworkConfiguration, 'setNetworkConfiguration')(internalMessagePayload, sendResponse); }
    else if (action === 'getNetworkConfiguration') { isAsync = true; withErrorHandling(handleGetNetworkConfiguration, 'getNetworkConfiguration')(internalMessagePayload || {}, sendResponse); }

    // --- SWAP SERVICE HANDLERS ---
    else if (action === 'getJupiterTokenListRequest') {
        isAsync = true;
        withErrorHandling(async (_payload, respond) => {
            const tokenList = await getJupiterTokenList();
            respond({ success: true, data: tokenList });
        }, 'getJupiterTokenListRequest')(internalMessagePayload, sendResponse);
    }
    else if (action === 'getSwapQuoteRequest') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            if (!payload || typeof payload.inputMint !== 'string' || typeof payload.outputMint !== 'string' || typeof payload.amount !== 'string' || typeof payload.slippageBps !== 'number') {
                throw new KeyringError("Invalid parameters for getSwapQuoteRequest.");
            }
            const quoteDetails = await getSwapQuote(payload);
            respond({ success: true, data: quoteDetails });
        }, 'getSwapQuoteRequest')(internalMessagePayload, sendResponse);
    }
    else if (action === 'executeSwapRequest') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const activeAccount = await keyringManager.getActiveAccountMetadata(); // AWAITED
            if (!activeAccount) {
                throw new KeyringError("User not authenticated or no active account for swap.");
            }
            if (!payload || !payload.originalQuoteResponse ) {
                throw new KeyringError("Invalid parameters for executeSwapRequest: missing originalQuoteResponse.");
            }
            const swapTxDetails = await getSwapTransaction({
                userPublicKey: payload.userPublicKey || activeAccount.publicKey,
                originalQuoteResponse: payload.originalQuoteResponse,
                priorityFeeLevelOverride: payload.priorityFeeLevel,
                maxLamportsForPriorityFee: payload.maxFee
            });
            respond({ success: true, data: swapTxDetails });
        }, 'executeSwapRequest')(internalMessagePayload, sendResponse);
    }
    else if (action === 'simulateTransactionForConfirmation') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            if (!payload || !Array.isArray(payload.transactionBytes) || typeof payload.feePayerPublicKeyString !== 'string') {
                throw new KeyringError("Invalid payload for simulating transaction.");
            }
            const networkConfig = getCurrentNetworkConfig();
            try {
                const simulationPreview = await simulateAndParseTransaction(
                    Uint8Array.from(payload.transactionBytes),
                    payload.feePayerPublicKeyString,
                    networkConfig.network
                );
                respond({ success: true, simulationPreview });
            } catch (simError: any) {
                const errorResponse: Partial<DetailedTransactionPreview> = {
                    simulationSuccess: false,
                    simulationError: simError.message || "Unknown simulation error",
                    feePayerAddress: payload.feePayerPublicKeyString,
                    alerts: [{ severity: 'critical', message: simError.message || "Simulation panic" }]
                };
                respond({ success: false, simulationPreview: errorResponse, error: simError.message });
            }
        }, 'simulateTransactionForConfirmation')(internalMessagePayload, sendResponse);
    }
    else if (action === 'signAndSendSwapTransaction') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const { base64EncodedTransaction } = payload;
            if (!base64EncodedTransaction || typeof base64EncodedTransaction !== 'string') {
                throw new KeyringError("Missing base64EncodedTransaction for signing and sending swap.");
            }
            const activeAccountMeta = await keyringManager.getActiveAccountMetadata(); // AWAITED
            if (!activeAccountMeta || activeAccountMeta.isViewOnly) {
                throw new AccountNotFoundError("Active signing account not found or is view-only.");
            }

            const transactionBytes = Array.from(atob(base64EncodedTransaction), c => c.charCodeAt(0));
            const result = await processSignAndSendTransaction(
                activeAccountMeta,
                transactionBytes,
                {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                },
                true // isPreFeeOptimized
            );
            respond({ success: true, signature: result.signature });
        }, 'signAndSendSwapTransaction')(internalMessagePayload, sendResponse);
    }
    // --- END SWAP SERVICE HANDLERS ---

    // Portfolio Data Handler
    else if (action === 'fetchPortfolioData') {
        isAsync = true;
        if (!internalMessagePayload?.publicKeyString) {
            safeSendResponse(sendResponse, { success: false, error: "Missing publicKeyString for fetchPortfolioData." }, 'fetchPortfolioData');
        } else {
            (async () => {
                try {
                    const connection = await getConnection();
                    const networkConfig = getCurrentNetworkConfig();
                    if (!connection) throw new Error("Background: Solana connection not available.");
                    let clusterForService: string = networkConfig.network;
                    if (networkConfig.network === 'custom' && networkConfig.customRpcUrl) {
                        if (networkConfig.customRpcUrl.includes('devnet')) clusterForService = 'devnet';
                        else if (networkConfig.customRpcUrl.includes('testnet')) clusterForService = 'testnet';
                        else clusterForService = 'mainnet-beta';
                    } else if (networkConfig.network === 'custom' && !networkConfig.customRpcUrl) {
                         clusterForService = 'mainnet-beta';
                    }
                    const portfolioResult: TokenInfo[] = await fetchPortfolio(connection, internalMessagePayload.publicKeyString, clusterForService);
                    const serializablePortfolio = portfolioResult.map(token => ({ ...token, balanceLamports: token.balanceLamports.toString() }));
                    safeSendResponse(sendResponse, { success: true, portfolio: serializablePortfolio }, 'fetchPortfolioData');
                } catch (error: any) {
                    safeSendResponse(sendResponse, { success: false, error: error.message || "Failed to fetch portfolio data." }, 'fetchPortfolioData');
                }
            })();
        }
    }
    // NFT Service Handlers
    else if (action === 'fetchNFTs') {
        isAsync = true;
        if (!internalMessagePayload?.ownerPublicKey) {
            safeSendResponse(sendResponse, { success: false, error: "Missing ownerPublicKey for fetchNFTs." }, 'fetchNFTs');
        } else {
            (async () => {
                try {
                    const nfts = await fetchNFTsByOwner(internalMessagePayload.ownerPublicKey);
                    safeSendResponse(sendResponse, { success: true, nfts: nfts }, 'fetchNFTs');
                } catch (error: any) {
                    safeSendResponse(sendResponse, { success: false, error: error.message || "Failed to fetch NFTs." }, 'fetchNFTs');
                }
            })();
        }
    }
    else if (action === 'fetchNFTAssetDetailsByMint') {
        isAsync = true;
        if (!internalMessagePayload?.mintAddress) {
            safeSendResponse(sendResponse, { success: false, error: "Missing mintAddress for fetchNFTAssetDetailsByMint." }, 'fetchNFTAssetDetailsByMint');
        } else {
            (async () => {
                try {
                    const collectibleInfo: CollectibleInfo | null = await fetchNFTAssetDetailsService(internalMessagePayload.mintAddress);
                    safeSendResponse(sendResponse, { success: true, collectibleInfo: collectibleInfo }, 'fetchNFTAssetDetailsByMint');
                } catch (error: any) {
                    safeSendResponse(sendResponse, { success: false, error: error.message || "Failed to fetch NFT asset details." }, 'fetchNFTAssetDetailsByMint');
                }
            })();
        }
    }
    // Settings Handlers
    else if (action === 'updateAutoLockSettings') {
        isAsync = true;
        (async () => {
            if (internalMessagePayload && typeof internalMessagePayload.isEnabled === 'boolean' && typeof internalMessagePayload.minutes === 'number') {
                await resetLockAlarm();
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Invalid payload for auto-lock settings.' });
            }
        })();
    }
    else if (action === 'getUserPriorityFeeSetting') {
        isAsync = true;
        (async () => {
            try {
                const level = await getUserPriorityFeeLevelSetting();
                sendResponse({ success: true, level: level });
            } catch (error: any) {
                sendResponse({ success: false, error: error.message || "Failed to get priority fee setting" });
            }
        })();
    }
    // Transaction Building & Sending Handlers
    else if (action === 'getEstimatedTransactionFee') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const { recipientAddress, amountLamports, tokenMintAddress, tokenDecimals, senderAddress } = payload;
            if (!senderAddress || !recipientAddress || !amountLamports || tokenDecimals === undefined) {
                throw new Error("Missing parameters for fee estimation.");
            }
            const transaction = await buildTransaction({
                senderPublicKey: senderAddress, recipientAddress, amountLamports, tokenMintAddress, tokenDecimals,
            });
            const networkConfig = getCurrentNetworkConfig();
            const simulationPreview = await simulateAndParseTransaction(
                transaction.serialize(), senderAddress, networkConfig.network
            );

            if (simulationPreview.simulationSuccess && simulationPreview.totalEstimatedFeeLamports !== undefined) {
                respond({ success: true, feeLamports: parseInt(simulationPreview.totalEstimatedFeeLamports, 10) });
            } else {
                throw new Error(simulationPreview.simulationError || "Fee estimation failed during simulation.");
            }
        }, 'getEstimatedTransactionFee')(internalMessagePayload, sendResponse);
    }
    else if (action === 'prepareAndSendTransaction') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const { recipientAddress, amountLamports, tokenMintAddress, tokenDecimals } = payload;
            const activeAccountMeta = await keyringManager.getActiveAccountMetadata(); // AWAITED
            if (!activeAccountMeta || !activeAccountMeta.publicKey) {
                throw new Error("No active signing account found for sending.");
            }
            if (activeAccountMeta.isViewOnly) {
                throw new Error("Cannot send from a view-only account.");
            }
            if (!recipientAddress || !amountLamports || tokenDecimals === undefined) {
                throw new Error("Recipient address, amount, and token decimals are required for sending.");
            }
            const transaction = await buildTransaction({
                senderPublicKey: activeAccountMeta.publicKey, recipientAddress, amountLamports, tokenMintAddress, tokenDecimals,
            });
            const serializedTransaction = Array.from(transaction.serialize());
            const result = await processSignAndSendTransaction(
                activeAccountMeta, serializedTransaction, { skipPreflight: false, preflightCommitment: 'confirmed' }
            );
            respond({ success: true, signature: result.signature });
        }, 'prepareAndSendTransaction')(internalMessagePayload, sendResponse);
    }
    else if (action === 'prepareAndSendNftBatchTransaction') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const { recipientAddress, nftMintAddresses } = payload;
            const activeAccountMeta = await keyringManager.getActiveAccountMetadata(); // AWAITED
            if (!activeAccountMeta || !activeAccountMeta.publicKey) {
                throw new Error("No active signing account found for sending.");
            }
            if (activeAccountMeta.isViewOnly) {
                throw new Error("Cannot send NFTs from a view-only account.");
            }
            if (!recipientAddress || !Array.isArray(nftMintAddresses) || nftMintAddresses.length === 0) {
                throw new Error("Recipient address and a list of NFT mint addresses are required.");
            }

            const transaction = await buildNftBatchTransferTransaction({
                senderPublicKey: activeAccountMeta.publicKey,
                recipientAddress,
                nftMintAddresses,
            });

            const serializedTransaction = Array.from(transaction.serialize());
            const result = await processSignAndSendTransaction(
                activeAccountMeta,
                serializedTransaction,
                { skipPreflight: false, preflightCommitment: 'confirmed' }
            );
            respond({ success: true, signature: result.signature });
        }, 'prepareAndSendNftBatchTransaction')(internalMessagePayload, sendResponse);
    }
    else if (action === 'checkRecipientAddressStatus') {
        isAsync = true;
        withErrorHandling(async (payload, respond) => {
            const { recipientAddress, tokenMintAddress } = payload;

            if (!recipientAddress) {
                throw new Error("Recipient address is required for status check.");
            }
            let recipientPK: PublicKey;
            try {
                recipientPK = new PublicKey(recipientAddress);
            } catch (e) {
                throw new Error("Invalid recipient address format.");
            }

            const connection = await getConnection();
            if (!connection) {
                throw new Error("Failed to establish Solana connection.");
            }

            let isLikelyNew = false;
            let primaryStatusMessage = "";
            let secondaryStatusMessage = "";

            const solBalance = await connection.getBalance(recipientPK);
            const hasZeroSOL = (solBalance === 0);

            const allTokenAccounts = await connection.getTokenAccountsByOwner(recipientPK, { programId: TOKEN_PROGRAM_ID });
            const hasNoSPLAccountsAtAll = (allTokenAccounts.value.length === 0);

            if (hasZeroSOL && hasNoSPLAccountsAtAll) {
                isLikelyNew = true;
                primaryStatusMessage = "Address has no SOL and no token accounts (likely new/unused).";
            } else if (hasZeroSOL) {
                isLikelyNew = true;
                primaryStatusMessage = "Address has no SOL balance.";
            } else if (hasNoSPLAccountsAtAll && tokenMintAddress) {
                isLikelyNew = true;
                primaryStatusMessage = "Address has other assets but no token accounts yet.";
            }

            if (tokenMintAddress) {
                const mint = new PublicKey(tokenMintAddress);
                const ataAddress = await getAssociatedTokenAddress(mint, recipientPK, true);
                const ataInfo = await connection.getAccountInfo(ataAddress);

                if (ataInfo === null) {
                    const ataMissingMsg = "Token account for this asset will be created.";
                    if (!primaryStatusMessage) primaryStatusMessage = ataMissingMsg;
                    else secondaryStatusMessage = ataMissingMsg;
                    isLikelyNew = true;
                } else if (!ataInfo.owner.equals(TOKEN_PROGRAM_ID)) {
                    const invalidAtaMsg = "Warning: Expected token account address is invalid (owned by wrong program).";
                    if (!primaryStatusMessage) primaryStatusMessage = invalidAtaMsg;
                    else secondaryStatusMessage = invalidAtaMsg;
                    isLikelyNew = true;
                }
            }

            let finalStatusMessage = primaryStatusMessage;
            if (primaryStatusMessage && secondaryStatusMessage && !primaryStatusMessage.includes(secondaryStatusMessage.substring(0,10))) {
                finalStatusMessage = `${primaryStatusMessage} ${secondaryStatusMessage}`;
            } else if (!primaryStatusMessage && secondaryStatusMessage) {
                finalStatusMessage = secondaryStatusMessage;
            }
            respond({ success: true, isLikelyNew, statusMessage: finalStatusMessage || null });
        }, 'checkRecipientAddressStatus')(internalMessagePayload, sendResponse);
    }
    else if (action === 'getConnectedDapps') {
        isAsync = true;
        (async () => {
            try {
                const dapps = await getFromStorage<ConnectedDappInfo[]>(config.CONNECTED_DAPPS_KEY) || [];
                safeSendResponse(sendResponse, { success: true, dapps: dapps.sort((a,b) => b.connectedAt - a.connectedAt) }, 'getConnectedDapps');
            } catch (e: any) {
                safeSendResponse(sendResponse, { success: false, error: e.message || "Failed to fetch connected dapps" }, 'getConnectedDapps');
            }
        })();
    }
    else if (action === 'disconnectDapp') {
        isAsync = true;
        const { originToDisconnect } = internalMessagePayload || {};
        if (!originToDisconnect) {
            safeSendResponse(sendResponse, { success: false, error: "Origin to disconnect not provided." }, 'disconnectDapp');
            isAsync = false;
        } else {
            (async () => {
                try {
                    let dapps = await getFromStorage<ConnectedDappInfo[]>(config.CONNECTED_DAPPS_KEY) || [];
                    const initialLength = dapps.length;
                    dapps = dapps.filter(d => d.origin !== originToDisconnect);
                    if (dapps.length < initialLength) {
                        await saveToStorage(config.CONNECTED_DAPPS_KEY, dapps);
                    }

                    const allTabs = await chrome.tabs.query({});
                    for (const tab of allTabs) {
                        if (tab.id && tab.url) {
                            try {
                                const tabOrigin = new URL(tab.url).origin;
                                if (tabOrigin === originToDisconnect) {
                                    chrome.tabs.sendMessage(tab.id, {
                                        target: 'KYOKU_CONTENT_SCRIPT_BROADCAST',
                                        eventName: 'disconnect',
                                        eventData: { message: "Wallet disconnected by user from settings." }
                                    }).catch(() => {/* ignore error if tab cannot receive message */});
                                }
                            } catch (urlParseError) { /* ignore tabs with invalid URLs */ }
                        }
                    }
                    safeSendResponse(sendResponse, { success: true }, 'disconnectDapp');
                } catch (e: any) {
                    safeSendResponse(sendResponse, { success: false, error: e.message || "Failed to disconnect dapp" }, 'disconnectDapp');
                }
            })();
        }
    }
    else if (action === 'burnTokenRequest') {
        isAsync = true;
        withErrorHandling(handleBurnTokenRequest, 'burnTokenRequest')(internalMessagePayload, sendResponse);
    }
    else if (action === 'burnNftRequest') {
        isAsync = true;
        withErrorHandling(handleBurnNftRequest, 'burnNftRequest')(internalMessagePayload, sendResponse);
    }

    // --- Default for Unhandled Actions ---
    else {
        if (isAsync) {
            try {
                sendResponse({ success: false, error: `Unhandled action: ${action}` });
            } catch (e) { /* Port might have closed if it was a one-time sendResponse */ }
        }
    }

    return isAsync;
});