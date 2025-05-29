// src/background/handlers/dappHandlers.ts

// --- State, Config, and Helpers ---
import {
    keyringManager,
    getCurrentNetworkConfig,
    config,
} from '../shared/state';
import { KeyringManager, AccountNotFoundError, KeyringError } from '../../background/core/keyring/KeyringManager'; // Assuming KeyringManager path
import { SendResponse } from '../shared/helpers';
import { getFromStorage, saveToStorage } from '../../utils/storage';
import type { ConnectedDappInfo } from '../shared/state';

// --- Signing, Simulation, and Building Logic ---
import {
    processSignAllTransactions,
    processSignMessage,
    processSignAndSendTransaction
} from '../shared/signingHandlers';
import { simulateAndParseTransaction, DetailedTransactionPreview,  SimulatedAssetChange, SimulationAlert } from '../shared/simulationParser';

// --- Solana specific imports ---
import {  LAMPORTS_PER_SOL } from '@solana/web3.js';



// --- DApp Interaction Constants & Types ---
export const DAPP_ACTION_TYPES = {
  CHECK_CONNECTION_STATUS: 'KYOKU_CHECK_CONNECTION_STATUS',
  CONNECT_REQUEST: 'KYOKU_CONNECT_REQUEST',
  DISCONNECT_REQUEST: 'KYOKU_DISCONNECT_REQUEST',
  SIGN_ALL_TRANSACTIONS_REQUEST: 'KYOKU_SIGN_ALL_TRANSACTIONS_REQUEST',
  SIGN_MESSAGE_REQUEST: 'KYOKU_SIGN_MESSAGE_REQUEST',
  SIGN_AND_SEND_TRANSACTION_REQUEST: 'KYOKU_SIGN_AND_SEND_TRANSACTION_REQUEST',
  POPUP_RESPONSE: 'KYOKU_POPUP_RESPONSE',
};

type PopupPromiseResolvers = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

export const pendingPopupRequests = new Map<string, PopupPromiseResolvers>();
export const openPopupWindows = new Map<string, number>();

export interface ConfirmationPopupDetails {
  interactionType: 'connect' | 'signTransaction' | 'signAllTransactions' | 'signMessage';
  dappOrigin: string;
  dappTitle?: string | null;
  dappIcon?: string | null;
  isWalletLocked: boolean;
  sessionDataKey?: string;
}

// --- Popup Management Functions ---
export async function openConfirmationPopup(details: ConfirmationPopupDetails): Promise<any> {
  const popupInternalRequestId = `kyoku-popup-interaction-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    pendingPopupRequests.set(popupInternalRequestId, { resolve, reject });

    let popupUrl = chrome.runtime.getURL('confirmation.html');
    const params = new URLSearchParams();
    params.append('requestId', popupInternalRequestId);
    params.append('interactionType', details.interactionType);
    params.append('dappOrigin', details.dappOrigin);
    if (details.dappTitle) params.append('dappTitle', details.dappTitle);
    if (details.dappIcon) params.append('dappIcon', details.dappIcon);
    params.append('isWalletLocked', String(details.isWalletLocked));
    if (details.sessionDataKey) params.append('sessionDataKey', details.sessionDataKey);
    popupUrl += `?${params.toString()}`;

    const width = 375; const height = 600;
    chrome.windows.getLastFocused({ populate: false }, (lastFocusedWindow) => {
      const top = (lastFocusedWindow && lastFocusedWindow.top !== undefined) ? Math.max(0, lastFocusedWindow.top) : 0;
      const left = (lastFocusedWindow && lastFocusedWindow.left !== undefined && lastFocusedWindow.width !== undefined)
                   ? Math.max(0, lastFocusedWindow.left + lastFocusedWindow.width - width - 20) : 0;
      chrome.windows.create({ url: popupUrl, type: 'popup', width, height, top, left, focused: true },
        (newWindow) => {
          if (chrome.runtime.lastError || !newWindow?.id) {
            const errorMsg = chrome.runtime.lastError?.message || "Unknown error creating popup.";
            pendingPopupRequests.delete(popupInternalRequestId);
            reject(new Error("Failed to create confirmation window. " + errorMsg));
          } else {
            openPopupWindows.set(popupInternalRequestId, newWindow.id);
          }
        }
      );
    });
  });
}


export function closePopupWindow(popupRequestId: string): void {
    const windowId = openPopupWindows.get(popupRequestId);
    if (windowId) {
        chrome.windows.remove(windowId, () => {
            if (chrome.runtime.lastError) {
                // console.warn(`[closePopupWindow] Failed to close popup window ${windowId}:`, chrome.runtime.lastError.message);
            }
        });
        openPopupWindows.delete(popupRequestId);
    }

    if (pendingPopupRequests.has(popupRequestId)) {
        pendingPopupRequests.get(popupRequestId)?.reject(new Error("Popup closed prematurely or by an external event."));
        pendingPopupRequests.delete(popupRequestId);
    }
}


// --- DApp Handler Implementations ---

export const handleDAppConnectRequest = async (
    dAppMessagePayload: any,
    respond: SendResponse,
    sender: chrome.runtime.MessageSender
) => {
    const { metadata } = dAppMessagePayload || {};
    const { origin, pageTitle, pageIcon } = metadata || {};

    if (!await KeyringManager.isInitialized()) {
        throw new Error("Kyoku Wallet not initialized. Please set up.");
    }
    const initiallyLocked = !keyringManager.isUnlocked();
    let approvalResponse;
    try {
        approvalResponse = await openConfirmationPopup({
            interactionType: 'connect',
            dappOrigin: origin || sender.origin || "Unknown dApp",
            dappTitle: pageTitle,
            dappIcon: pageIcon,
            isWalletLocked: initiallyLocked,
        });
    } catch (popupOpenError: any) {
        throw new Error(`Failed to open confirmation window: ${popupOpenError.message}`);
    }

    if (approvalResponse.approved) {
        if (!keyringManager.isUnlocked() || !approvalResponse.activeAccountPublicKey) {
            throw new Error("Unlock process failed or wallet re-locked unexpectedly.");
        }

        respond({ data: { publicKey: { __publicKeyB58__: approvalResponse.activeAccountPublicKey } } });

        chrome.tabs.query({}).then(tabs => {
            tabs.forEach(tab => {
                if (tab.id && tab.url && !tab.url.startsWith('chrome-extension://')) {
                    chrome.tabs.sendMessage(tab.id, {
                        target: 'KYOKU_CONTENT_SCRIPT_BROADCAST',
                        eventName: 'connect',
                        eventData: { publicKey: { __publicKeyB58__: approvalResponse.activeAccountPublicKey } }
                    }).catch(() => {/* ignore errors sending to non-listening tabs */});
                }
            });
        });

        const dAppOriginToRecord = origin || sender.origin;
        if (dAppOriginToRecord && dAppOriginToRecord !== "Unknown dApp") {
            try {
                const existingDapps = await getFromStorage<ConnectedDappInfo[]>(config.CONNECTED_DAPPS_KEY) || [];
                const existingEntryIndex = existingDapps.findIndex(d => d.origin === dAppOriginToRecord);
                const newEntry: ConnectedDappInfo = {
                    origin: dAppOriginToRecord,
                    name: pageTitle || dAppOriginToRecord,
                    iconUrl: pageIcon || undefined,
                    connectedAt: Date.now(),
                };
                if (existingEntryIndex > -1) {
                    existingDapps[existingEntryIndex] = {
                        ...existingDapps[existingEntryIndex],
                        name: newEntry.name,
                        iconUrl: newEntry.iconUrl,
                        connectedAt: newEntry.connectedAt, // Update timestamp on re-connect approval
                    };
                } else {
                    existingDapps.push(newEntry);
                }
                await saveToStorage(config.CONNECTED_DAPPS_KEY, existingDapps);
            } catch (storageError) {
                // console.warn("[handleDAppConnectRequest] Failed to save connected dApp info:", storageError);
            }
        }

    } else {
        respond({ error: approvalResponse.error || "Connection declined by user." });
    }
};

export const handleDAppSignMessageRequest = async (
    dAppMessagePayload: any,
    respond: SendResponse,
    sender: chrome.runtime.MessageSender
) => {
    const { metadata, message: messageBytesFromDapp, display: displayHint } = dAppMessagePayload || {};
    const { origin: reqOrigin, pageTitle: reqPageTitle, pageIcon: reqPageIcon } = metadata || {};

    const operationSpecificId = `signMsgOp-${Date.now()}`;
    const sessionDataKey = `sign_message_data_${operationSpecificId}`;

    if (!await KeyringManager.isInitialized()) { throw new Error("Kyoku Wallet not initialized."); }
    if (!Array.isArray(messageBytesFromDapp)) { throw new Error("Invalid message payload."); }

    const initiallyLocked = !keyringManager.isUnlocked();

    try {
        await chrome.storage.session.set({
            [sessionDataKey]: {
                messageBytes: messageBytesFromDapp,
                displayFormat: displayHint || 'utf8',
                reqOrigin, reqPageTitle, reqPageIcon
            }
        });

        const approvalResponse = await openConfirmationPopup({
            interactionType: 'signMessage',
            dappOrigin: reqOrigin || sender.origin || "Unknown",
            dappTitle: reqPageTitle,
            dappIcon: reqPageIcon,
            isWalletLocked: initiallyLocked,
            sessionDataKey,
        });

        if (approvalResponse.approved) {
            const accountToSignWith = await keyringManager.findAccountByPublicKey(approvalResponse.activeAccountPublicKey); // AWAITED
            if (!accountToSignWith) throw new AccountNotFoundError("Approved account not found for signing message.");

            const storedData = await chrome.storage.session.get(sessionDataKey);
            const messageToSign = storedData[sessionDataKey]?.messageBytes;
            if (!Array.isArray(messageToSign)) throw new Error("Message data not retrieved from session for signing.");

            const result = await processSignMessage(accountToSignWith, messageToSign);
            respond({ data: { signature: { __uint8Array__: result.signature } } });
        } else {
            respond({ error: approvalResponse.error || "Signing declined." });
        }
    } finally {
        await chrome.storage.session.remove(sessionDataKey).catch(_e=> { /* Non-critical cleanup error */ });
    }
};

export const handleDAppSignAllTransactionsRequest = async (
    dAppMessagePayload: any,
    respond: SendResponse,
    sender: chrome.runtime.MessageSender
) => {
    const { metadata, transactionsToSign: transactionsFromDapp } = dAppMessagePayload || {};
    const { origin: reqOrigin, pageTitle: reqPageTitle, pageIcon: reqPageIcon } = metadata || {};

    const operationSpecificId = `signAllTxOp-${Date.now()}`;
    const sessionDataKey = `detailed_tx_preview_data_${operationSpecificId}`;

    if (!await KeyringManager.isInitialized()) { throw new Error("Kyoku Wallet not initialized."); }
    if (!Array.isArray(transactionsFromDapp) || transactionsFromDapp.length === 0) {
        throw new Error("Invalid transaction payload for signAllTransactions.");
    }

    const activeAccountForSimulation = await keyringManager.getActiveAccountMetadata(); // AWAITED
    if (!activeAccountForSimulation || !activeAccountForSimulation.publicKey) {
        throw new AccountNotFoundError("No active account available for dApp simulation context or publicKey missing.");
    }

    const initiallyLocked = !keyringManager.isUnlocked();
    const networkConfig = getCurrentNetworkConfig();

    // <--- START DEBUG LOGGING FOR BATCH TX (Commented out for production) --->
    /*
    if (Array.isArray(transactionsFromDapp)) {
        // console.log(`[DebugSignAll] Received ${transactionsFromDapp.length} transactions to sign/simulate from ${reqOrigin}.`);
        const connectionForLog = await getConnection();

        for (let i = 0; i < transactionsFromDapp.length; i++) {
            const txDetail = transactionsFromDapp[i];
            const transactionBytes = Uint8Array.from(txDetail.data);
            // console.log(`[DebugSignAll] ---- Details for Transaction ${i + 1} of ${transactionsFromDapp.length} ----`);
            let tempTransactionToLog: VersionedTransaction | Transaction | null = null;
            let tempMessageType = "Unknown";
            let messageToLog: Message | MessageV0 | null = null;

            try {
                tempTransactionToLog = VersionedTransaction.deserialize(transactionBytes);
                messageToLog = tempTransactionToLog.message;
                tempMessageType = "Versioned";
            } catch (e) {
                try {
                    tempTransactionToLog = Transaction.from(transactionBytes);
                    if (!tempTransactionToLog.recentBlockhash && connectionForLog) {
                        const { blockhash } = await connectionForLog.getLatestBlockhash();
                        tempTransactionToLog.recentBlockhash = blockhash;
                    }
                    if (!tempTransactionToLog.feePayer && activeAccountForSimulation) {
                        tempTransactionToLog.feePayer = new PublicKey(activeAccountForSimulation.publicKey);
                    }
                    if (tempTransactionToLog.recentBlockhash && tempTransactionToLog.feePayer) {
                        messageToLog = tempTransactionToLog.compileMessage();
                    }
                    tempMessageType = "Legacy";
                } catch (deserializeError) {
                    // console.error(`[DebugSignAll] Tx ${i + 1}: Failed to deserialize for logging:`, deserializeError);
                    tempTransactionToLog = null;
                    messageToLog = null;
                }
            }

            if (tempTransactionToLog && messageToLog && connectionForLog) {
                const loadedLutsForLog = messageToLog.addressTableLookups ? await getLoadedAddressLookupTableAccounts(connectionForLog, messageToLog.addressTableLookups as MessageAddressTableLookup[]) : [];
                const accountKeysForLog = messageToLog.getAccountKeys({ addressLookupTableAccounts: loadedLutsForLog });

                // console.log(`[DebugSignAll] Tx ${i + 1} (${tempMessageType}) Instructions:`);
                (messageToLog.compiledInstructions as MessageCompiledInstruction[]).forEach((ix: MessageCompiledInstruction, ixIndex: number) => {
                    const programIdAccount = accountKeysForLog.get(ix.programIdIndex);
                    // console.log(`  Ix ${ixIndex}:`);
                    // console.log(`    Program ID: ${programIdAccount ? programIdAccount.toBase58() : 'Unknown Program ID Index: ' + ix.programIdIndex}`);
                    // console.log(`    Account Keys (by index in message): ${ix.accountKeyIndexes.join(', ')}`);
                    // console.log(`    Resolved Account Pubkeys: ${ix.accountKeyIndexes.map((keyIndex: number) => {
                    //     const key = accountKeysForLog.get(keyIndex);
                    //     return key ? key.toBase58() : `Unknown Key Index: ${keyIndex}`;
                    // }).join(', ')}`);
                    // console.log(`    Data (bs58): ${bs58.encode(ix.data)}`);
                });
                 // console.log(`[DebugSignAll] Tx ${i + 1} Static Account Keys:`, messageToLog.staticAccountKeys.map(k => k.toBase58()));
                 if (loadedLutsForLog.length > 0 && messageToLog.addressTableLookups) {
                    // console.log(`[DebugSignAll] Tx ${i + 1} LUTs involved:`, (messageToLog.addressTableLookups as MessageAddressTableLookup[]).map(l => l.accountKey.toBase58()));
                 }
                 // console.log(`[DebugSignAll] Tx ${i + 1} Header (numRequiredSignatures):`, messageToLog.header.numRequiredSignatures);
                 // console.log(`[DebugSignAll] Tx ${i + 1} Payer Key (from static keys[0]): ${messageToLog.staticAccountKeys[0]?.toBase58()}`);
            } else if (!connectionForLog) {
                 // console.warn(`[DebugSignAll] Tx ${i + 1}: No connection for detailed logging.`);
            }
             // console.log(`[DebugSignAll] ---- End of Transaction ${i + 1} ----`);
        }
    }
    */
    // <--- END DEBUG LOGGING FOR BATCH TX --->

    try {
        const individualPreviews: DetailedTransactionPreview[] = [];
        let overallSimulationSuccess = true;
        let firstIndividualSimulationError: string | undefined = undefined;

        for (let i = 0; i < transactionsFromDapp.length; i++) {
            const txDetail = transactionsFromDapp[i];
            const transactionBytes = Uint8Array.from(txDetail.data);
            const preview = await simulateAndParseTransaction(
                transactionBytes,
                activeAccountForSimulation.publicKey,
                networkConfig.network
            );
            // console.log(`[DebugSignAll] Tx ${i + 1} FINAL INDIVIDUAL SIM PREVIEW for UI (SOL Change):`, JSON.stringify(preview.feePayerAssetChanges.find(ch => ch.mintAddress === 'SOL')));
            individualPreviews.push(preview);
            if (!preview.simulationSuccess) {
                overallSimulationSuccess = false;
                if (!firstIndividualSimulationError) firstIndividualSimulationError = preview.simulationError || `Transaction #${i + 1} simulation failed.`;
            }
        }

        // --- START: Aggregation Logic ---
        let aggregatedFeePayerSOLChangeLamports = 0n;
        const aggregatedFeePayerTokenChanges = new Map<string, SimulatedAssetChange>();
        let aggregatedTotalEstimatedFeeLamports = 0n;
        const aggregatedAlerts: SimulationAlert[] = [];
        let aggregatedSummaryMessage = "";

        individualPreviews.forEach((preview, index) => {
            if (preview.simulationSuccess) {
                const solChange = preview.feePayerAssetChanges.find(c => c.mintAddress === 'SOL');
                if (solChange) {
                    aggregatedFeePayerSOLChangeLamports += BigInt(solChange.rawAmountChange);
                }
                preview.feePayerAssetChanges.forEach(change => {
                    if (change.mintAddress !== 'SOL') {
                        const existing = aggregatedFeePayerTokenChanges.get(change.mintAddress);
                        if (existing) {
                            existing.rawAmountChange = (BigInt(existing.rawAmountChange) + BigInt(change.rawAmountChange)).toString();
                            existing.uiAmountChange = (parseFloat(existing.uiAmountChange) + parseFloat(change.uiAmountChange)).toFixed(change.decimals);
                        } else {
                            aggregatedFeePayerTokenChanges.set(change.mintAddress, { ...change });
                        }
                    }
                });
                aggregatedTotalEstimatedFeeLamports += BigInt(preview.totalEstimatedFeeLamports || "0");
            } else {
                 overallSimulationSuccess = false;
                 if (!firstIndividualSimulationError) {
                    firstIndividualSimulationError = preview.simulationError || `Transaction #${index + 1} in batch failed simulation.`;
                }
            }
            preview.alerts.forEach(alert => {
                if (!aggregatedAlerts.some(a => a.message === alert.message && a.severity === alert.severity)) {
                    aggregatedAlerts.push(alert);
                }
            });
            if (preview.summaryMessage) {
                aggregatedSummaryMessage += `Tx ${index + 1}: ${preview.summaryMessage}\n`;
            }
        });

        const finalAggregatedFeePayerAssetChanges: SimulatedAssetChange[] = [];
        if (aggregatedFeePayerSOLChangeLamports !== 0n) {
            finalAggregatedFeePayerAssetChanges.push({
                mintAddress: 'SOL',
                ownerAddress: activeAccountForSimulation.publicKey,
                rawAmountChange: aggregatedFeePayerSOLChangeLamports.toString(),
                uiAmountChange: (Number(aggregatedFeePayerSOLChangeLamports) / LAMPORTS_PER_SOL).toFixed(9),
                symbol: 'SOL', name: 'Solana', decimals: 9, isNFT: false,
            });
        }
        finalAggregatedFeePayerAssetChanges.push(...Array.from(aggregatedFeePayerTokenChanges.values()));

        const aggregatedPreview: DetailedTransactionPreview = {
            simulationSuccess: overallSimulationSuccess,
            simulationError: firstIndividualSimulationError,
            feePayerAddress: activeAccountForSimulation.publicKey,
            feePayerAssetChanges: finalAggregatedFeePayerAssetChanges,
            otherAccountAssetChanges: [],
            totalEstimatedFeeLamports: aggregatedTotalEstimatedFeeLamports.toString(),
            alerts: aggregatedAlerts,
            summaryMessage: aggregatedSummaryMessage.trim() || (overallSimulationSuccess ? "Batch transaction simulated." : "One or more transactions in batch failed simulation."),
        };
        // console.log(`[DebugSignAll] AGGREGATED SIM PREVIEW for UI (SOL Change):`, JSON.stringify(aggregatedPreview.feePayerAssetChanges.find(ch => ch.mintAddress === 'SOL')));
        // --- END: Aggregation Logic ---

        await chrome.storage.session.set({
            [sessionDataKey]: {
                transactionsToSign: transactionsFromDapp,
                individualPreviews: individualPreviews,
                aggregatedPreview: aggregatedPreview,
                overallSimulationSuccess: overallSimulationSuccess,
                firstIndividualSimulationError: firstIndividualSimulationError,
                reqOrigin, reqPageTitle, reqPageIcon
            }
        });

        const approvalResponse = await openConfirmationPopup({
            interactionType: 'signAllTransactions',
            dappOrigin: reqOrigin || sender.origin || "Unknown",
            dappTitle: reqPageTitle,
            dappIcon: reqPageIcon,
            isWalletLocked: initiallyLocked,
            sessionDataKey,
        });

        if (approvalResponse.approved) {
            const accountToSignWith = await keyringManager.findAccountByPublicKey(approvalResponse.activeAccountPublicKey); // AWAITED
            if (!accountToSignWith) throw new AccountNotFoundError("Approved account not found for signing batch.");
            if (accountToSignWith.isViewOnly) throw new KeyringError("Cannot sign with a view-only account.");

            const storedData = await chrome.storage.session.get(sessionDataKey);
            const originalTxsForSigning = storedData[sessionDataKey]?.transactionsToSign;
            if (!Array.isArray(originalTxsForSigning)) throw new Error("Transaction data not retrieved from session for signing batch.");

            const result = await processSignAllTransactions(accountToSignWith, originalTxsForSigning);
            const serializedSignedTxs = result.signedTransactions.map(txBytes => ({ __uint8Array__: Array.from(txBytes) }));
            respond({ data: { signedTransactions: serializedSignedTxs } });
        } else {
            respond({ error: approvalResponse.error || "Signing declined." });
        }
    } finally {
        await chrome.storage.session.remove(sessionDataKey).catch(_e=>{ /* Non-critical cleanup error */ });
    }
};

export const handleDAppSignAndSendTransactionRequest = async (
    dAppMessagePayload: any,
    respond: SendResponse,
    sender: chrome.runtime.MessageSender
) => {
    const { metadata, transactionBytes: transactionBytesFromDapp, options: sendOptions } = dAppMessagePayload || {};
    const { origin: reqOrigin, pageTitle: reqPageTitle, pageIcon: reqPageIcon } = metadata || {};

    const operationSpecificId = `signSendTxOp-${Date.now()}`;
    const sessionDataKey = `detailed_tx_preview_data_${operationSpecificId}`;

    if (!await KeyringManager.isInitialized()) { throw new Error("Kyoku Wallet not initialized."); }
    if (!Array.isArray(transactionBytesFromDapp)) { throw new Error("Invalid transaction payload for signAndSendTransaction."); }

    const activeAccountForSimulation = await keyringManager.getActiveAccountMetadata(); // AWAITED
    if (!activeAccountForSimulation || !activeAccountForSimulation.publicKey) {
        throw new AccountNotFoundError("No active account available for dApp simulation context or publicKey missing.");
    }

    const initiallyLocked = !keyringManager.isUnlocked();
    const networkConfig = getCurrentNetworkConfig();

    try {
        const transactionBytesUint8 = Uint8Array.from(transactionBytesFromDapp);

        const simulationPreview: DetailedTransactionPreview = await simulateAndParseTransaction(
            transactionBytesUint8,
            activeAccountForSimulation.publicKey,
            networkConfig.network
        );
        // console.log(`[DebugSignSend] FINAL SIM PREVIEW for UI (SOL Change):`, JSON.stringify(simulationPreview.feePayerAssetChanges.find(ch => ch.mintAddress === 'SOL')));


        await chrome.storage.session.set({
            [sessionDataKey]: {
                transactionBytes: transactionBytesFromDapp,
                simulationPreview,
                sendOptions,
                reqOrigin, reqPageTitle, reqPageIcon
            }
        });

        const approvalResponse = await openConfirmationPopup({
            interactionType: 'signTransaction',
            dappOrigin: reqOrigin || sender.origin || "Unknown",
            dappTitle: reqPageTitle,
            dappIcon: reqPageIcon,
            isWalletLocked: initiallyLocked,
            sessionDataKey,
        });

        if (approvalResponse.approved) {
            const accountToSignWith = await keyringManager.findAccountByPublicKey(approvalResponse.activeAccountPublicKey); // AWAITED
            if (!accountToSignWith) throw new AccountNotFoundError("Approved account not found for signing and sending.");
            if (accountToSignWith.isViewOnly) throw new KeyringError("Cannot sign with a view-only account.");

            const storedData = await chrome.storage.session.get(sessionDataKey);
            const originalTxBytesFromSession = storedData[sessionDataKey]?.transactionBytes;
            const optionsFromSession = storedData[sessionDataKey]?.sendOptions;
            if (!Array.isArray(originalTxBytesFromSession)) throw new Error("Transaction data not retrieved from session for signAndSend.");

            const result = await processSignAndSendTransaction(
                accountToSignWith,
                originalTxBytesFromSession,
                optionsFromSession
            );
            respond({ data: { signature: result.signature } });
        } else {
            respond({ error: approvalResponse.error || "Signing and sending declined." });
        }
    } finally {
        await chrome.storage.session.remove(sessionDataKey).catch(_e=>{ /* Non-critical cleanup error */ });
    }
};