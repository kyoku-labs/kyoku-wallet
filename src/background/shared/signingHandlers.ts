// src/background/shared/signingHandlers.ts
import {
    Keypair,
    Transaction,
    VersionedTransaction,
    SendOptions,
    type TransactionInstruction,
    MessageV0, // For direct compilation
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import { CryptoUtils, DEFAULT_DERIVATION_PATH } from '../../utils/cryptoutils';
import {
    keyringManager,
    getConnection,
    getCurrentNetworkConfig,
    getUserPriorityFeeLevelSetting,
    PriorityFeeLevel,
} from './state';
import { KeyringError, AccountNotFoundError } from '../../background/core/keyring/KeyringManager';
import type { AccountMetadata } from '../core/keyring/types';
import { simulateAndParseTransaction } from './simulationParser';
import { addPriorityFeeInstructions } from './priorityFeeHandlers';
import { getLoadedAddressLookupTableAccounts } from './simulationParser';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

/**
 * Clears sensitive key material from memory.
 * @param secretValue - The secret string to clear.
 * @param keypair - The Keypair object whose secret key to clear.
 */
function clearKeyMaterial(secretValue: string | null, keypair: Keypair | null): void {
    if (secretValue) {
        // Overwrite string content (best effort)
        // @ts-ignore
        secretValue = secretValue.split('').map(() => Math.random().toString(36).charAt(2)).join('');
    }
    if (keypair && keypair.secretKey) {
        try { keypair.secretKey.fill(0); } catch(e) { /* ignore error during fill */ }
    }
}

/**
 * Retrieves the signing keypair for the active account.
 * @param activeAccount - Metadata of the active account.
 * @returns A promise resolving to an object with the Keypair and the original secret string for clearing.
 * @throws {AccountNotFoundError} If no active account is provided.
 * @throws {KeyringError} If the account is view-only, secret retrieval fails, or key derivation fails.
 */
async function getSigningKeypair(activeAccount: AccountMetadata): Promise<{keypair: Keypair, secretToClear: string}> {
    if (!activeAccount) throw new AccountNotFoundError("No active account provided for signing.");
    if (activeAccount.isViewOnly) throw new KeyringError("Cannot sign: Active account is view-only.");

    const decryptedSecretInfo = await keyringManager.getDecryptedSecret(activeAccount.uuid);
    if (!decryptedSecretInfo || !decryptedSecretInfo.secret) {
        throw new KeyringError("Failed to retrieve secret for signing.");
    }
    const { secret: secretValue, type: secretType } = decryptedSecretInfo;
    let signingKeypair: Keypair;
    try {
        if (secretType === 'mnemonic') {
            signingKeypair = CryptoUtils.deriveSolanaKeypair(CryptoUtils.mnemonicToSeed(secretValue), activeAccount.derivationPath || DEFAULT_DERIVATION_PATH);
        } else if (secretType === 'privateKey') {
            signingKeypair = CryptoUtils.generateWalletFromPrivateKey(secretValue).keypair;
        } else {
            clearKeyMaterial(secretValue, null); // Clear secret before throwing
            throw new KeyringError(`Unsupported secret type "${secretType}" for signing.`);
        }
    } catch (error: any) {
        clearKeyMaterial(secretValue, null); // Clear secret on error
        throw new KeyringError(`Failed to derive signing key: ${error.message}`);
    }
    return {keypair: signingKeypair, secretToClear: secretValue};
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Signs an array of transactions.
 * @param activeAccount - The account to sign with.
 * @param transactionsToSignDetails - Array of transaction details (type and data as number[]).
 * @param sendOptions - Optional send options for blockhash commitment.
 * @returns A promise resolving to an object containing an array of signed transaction bytes (as number[][]).
 */
export async function processSignAllTransactions(
    activeAccount: AccountMetadata,
    transactionsToSignDetails: Array<{ type: string, data: number[] }>,
    sendOptions?: SendOptions
): Promise<{ signedTransactions: number[][] }> {
    let signerInfo: {keypair: Keypair, secretToClear: string} | null = null;
    try {
        signerInfo = await getSigningKeypair(activeAccount);
        const signingKeypair = signerInfo.keypair;
        const signedTransactionsBytesArray: number[][] = [];
        const connection = await getConnection();
        if (!connection) throw new Error("Failed to get Solana connection for signing all transactions.");
        const networkConfig = getCurrentNetworkConfig();
        const userFeeLevelSetting: PriorityFeeLevel = await getUserPriorityFeeLevelSetting();
        const blockhashCommitment = sendOptions?.preflightCommitment || 'confirmed';

        for (let i = 0; i < transactionsToSignDetails.length; i++) {
            const txDetail = transactionsToSignDetails[i];
            const originalTxBytesUint8 = Uint8Array.from(txDetail.data);
            const { blockhash: freshBlockhashForThisTx } = await connection.getLatestBlockhash(blockhashCommitment);

            let transactionToSign: Transaction | VersionedTransaction;
            let isVersioned = false;

            try { // Attempt to deserialize as VersionedTransaction first
                const versionedTx = VersionedTransaction.deserialize(originalTxBytesUint8);
                const originalMessage = versionedTx.message;
                const loadedLuts = await getLoadedAddressLookupTableAccounts(connection, originalMessage.addressTableLookups);

                const accountKeys = originalMessage.getAccountKeys({addressLookupTableAccounts: loadedLuts});
                const decompiledInstructions: TransactionInstruction[] = originalMessage.compiledInstructions.map(ix => ({
                    programId: accountKeys.get(ix.programIdIndex)!,
                    keys: ix.accountKeyIndexes.map(keyIndex => ({
                        pubkey: accountKeys.get(keyIndex)!,
                        isSigner: originalMessage.isAccountSigner(keyIndex),
                        isWritable: originalMessage.isAccountWritable(keyIndex)
                    })),
                    data: Buffer.from(ix.data)
                }));

                const payer = originalMessage.staticAccountKeys[0];
                if (!payer) throw new Error("Payer key not found in versioned message staticAccountKeys.");

                // Recompile with fresh blockhash using MessageV0.compile
                const newCompiledMessage = MessageV0.compile({
                    payerKey: payer,
                    instructions: decompiledInstructions,
                    recentBlockhash: freshBlockhashForThisTx,
                    addressLookupTableAccounts: loadedLuts.length > 0 ? loadedLuts : undefined,
                });
                transactionToSign = new VersionedTransaction(newCompiledMessage);
                isVersioned = true;
            } catch (e) { // Fallback to legacy Transaction
                transactionToSign = Transaction.from(originalTxBytesUint8);
                transactionToSign.recentBlockhash = freshBlockhashForThisTx;
                if(!transactionToSign.feePayer) transactionToSign.feePayer = signingKeypair.publicKey;
                isVersioned = false;
            }

            // Simulate and add priority fees
            const simulationPreview = await simulateAndParseTransaction(
                isVersioned ? (transactionToSign as VersionedTransaction).serialize() : (transactionToSign as Transaction).serialize(),
                signingKeypair.publicKey.toBase58(), networkConfig.network
            );
            let cuLimitForThisTx = 200000, cuPriceForThisTx = 0; // Defaults
            if (simulationPreview.simulationSuccess && simulationPreview.priorityFeeTiers) {
                let resolvedTierName: 'low' | 'medium' | 'high' = 'medium'; // Default tier
                if (userFeeLevelSetting === 'low' || userFeeLevelSetting === 'medium' || userFeeLevelSetting === 'high') {
                    resolvedTierName = userFeeLevelSetting;
                } else if (userFeeLevelSetting === 'auto') { // Auto logic
                     if (simulationPreview.priorityFeeTiers.medium?.computeUnitPrice && simulationPreview.priorityFeeTiers.medium.computeUnitPrice > 0) resolvedTierName = 'medium';
                     else if (simulationPreview.priorityFeeTiers.low?.computeUnitPrice && simulationPreview.priorityFeeTiers.low.computeUnitPrice > 0) resolvedTierName = 'low';
                     else resolvedTierName = 'low'; // Fallback for auto if medium/low are 0
                 }
                cuLimitForThisTx = simulationPreview.priorityFeeTiers.estimatedComputeUnitsForTiers;
                cuPriceForThisTx = simulationPreview.priorityFeeTiers[resolvedTierName]?.computeUnitPrice ?? 0;
            }
            transactionToSign = await addPriorityFeeInstructions(connection, transactionToSign, cuLimitForThisTx, cuPriceForThisTx);

            if (isVersioned) (transactionToSign as VersionedTransaction).sign([signingKeypair]);
            else (transactionToSign as Transaction).sign(signingKeypair);
            signedTransactionsBytesArray.push(Array.from(transactionToSign.serialize()));
        }
        return { signedTransactions: signedTransactionsBytesArray };
    } finally {
        if (signerInfo) clearKeyMaterial(signerInfo.secretToClear, signerInfo.keypair);
    }
}

/**
 * Signs a message with the active account's keypair.
 * @param activeAccount - Metadata of the account to sign with.
 * @param messageBytesArray - The message to sign, as an array of numbers (bytes).
 * @returns A promise resolving to an object containing the signature as an array of numbers.
 */
export async function processSignMessage(
    activeAccount: AccountMetadata,
    messageBytesArray: number[]
): Promise<{ signature: number[] }> {
    let signerInfo: {keypair: Keypair, secretToClear: string} | null = null;
    try {
        signerInfo = await getSigningKeypair(activeAccount);
        const messageBytes = Uint8Array.from(messageBytesArray);
        const signature = nacl.sign.detached(messageBytes, signerInfo.keypair.secretKey);
        return { signature: Array.from(signature) };
    } finally {
        if (signerInfo) {
            clearKeyMaterial(signerInfo.secretToClear, signerInfo.keypair);
        }
    }
}

/**
 * Signs and sends a transaction, handling retries and fee optimization.
 * @param activeAccount - The account to sign and send with.
 * @param transactionBytesArray - The transaction bytes as an array of numbers.
 * @param sendOptions - Options for sending the transaction.
 * @param isPreFeeOptimized - Flag indicating if the transaction already has priority fees included.
 * @returns A promise resolving to an object containing the transaction signature string.
 */
export async function processSignAndSendTransaction(
    activeAccount: AccountMetadata,
    transactionBytesArray: number[],
    sendOptions?: SendOptions,
    isPreFeeOptimized: boolean = false // True if Jupiter or other service already added fees
): Promise<{ signature: string }> {
    let signerInfo: {keypair: Keypair, secretToClear: string} | null = null;
    let lastError: any = null;
    const commitmentForBHandConfirm = sendOptions?.preflightCommitment || 'confirmed';

    try {
        signerInfo = await getSigningKeypair(activeAccount);
        const signingKeypair = signerInfo.keypair;
        const originalTxBytesUint8 = Uint8Array.from(transactionBytesArray);

        const connection = await getConnection();
        if (!connection) throw new Error("Failed to get Solana connection.");

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff for retries
            }

            try {
                let txToSend: Transaction | VersionedTransaction;
                let isVersioned = false;
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitmentForBHandConfirm);

                // Deserialize and update blockhash
                try { // Attempt VersionedTransaction
                    const versionedTx = VersionedTransaction.deserialize(originalTxBytesUint8);
                    const originalMessage = versionedTx.message;
                    const loadedLuts = await getLoadedAddressLookupTableAccounts(connection, originalMessage.addressTableLookups);
                    const accountKeys = originalMessage.getAccountKeys({addressLookupTableAccounts: loadedLuts});
                    const decompiledInstructions: TransactionInstruction[] = originalMessage.compiledInstructions.map(ix => ({
                        programId: accountKeys.get(ix.programIdIndex)!,
                        keys: ix.accountKeyIndexes.map(keyIndex => ({
                            pubkey: accountKeys.get(keyIndex)!,
                            isSigner: originalMessage.isAccountSigner(keyIndex),
                            isWritable: originalMessage.isAccountWritable(keyIndex)
                        })),
                        data: Buffer.from(ix.data)
                    }));
                    const payer = originalMessage.staticAccountKeys[0];
                    if (!payer) throw new Error("Payer key not found for versioned message recompilation.");

                    const newCompiledMessage = MessageV0.compile({
                        payerKey: payer, instructions: decompiledInstructions, recentBlockhash: blockhash,
                        addressLookupTableAccounts: loadedLuts.length > 0 ? loadedLuts : undefined,
                    });
                    txToSend = new VersionedTransaction(newCompiledMessage);
                    isVersioned = true;
                } catch (e) { // Fallback to legacy Transaction
                    txToSend = Transaction.from(originalTxBytesUint8);
                    txToSend.recentBlockhash = blockhash;
                    if (!txToSend.feePayer) txToSend.feePayer = signingKeypair.publicKey;
                    isVersioned = false;
                }

                // Add priority fees if not already optimized (e.g., by Jupiter)
                if (!isPreFeeOptimized) {
                    const networkConfig = getCurrentNetworkConfig();
                    const userFeeLevelSetting: PriorityFeeLevel = await getUserPriorityFeeLevelSetting();
                    const simulationPreview = await simulateAndParseTransaction(
                        txToSend.serialize(), signingKeypair.publicKey.toBase58(), networkConfig.network
                    );
                    let cuLimitForFee = 200000, cuPriceForFee = 0; // Defaults
                    if (simulationPreview.simulationSuccess && simulationPreview.priorityFeeTiers) {
                        let resolvedTierName: 'low' | 'medium' | 'high' = 'medium';
                        if (userFeeLevelSetting === 'low' || userFeeLevelSetting === 'medium' || userFeeLevelSetting === 'high') {
                            resolvedTierName = userFeeLevelSetting;
                        } else if (userFeeLevelSetting === 'auto') {
                             if (simulationPreview.priorityFeeTiers.medium?.computeUnitPrice && simulationPreview.priorityFeeTiers.medium.computeUnitPrice > 0) resolvedTierName = 'medium';
                             else if (simulationPreview.priorityFeeTiers.low?.computeUnitPrice && simulationPreview.priorityFeeTiers.low.computeUnitPrice > 0) resolvedTierName = 'low';
                             else resolvedTierName = 'low';
                         }
                        cuLimitForFee = simulationPreview.priorityFeeTiers.estimatedComputeUnitsForTiers;
                        cuPriceForFee = simulationPreview.priorityFeeTiers[resolvedTierName]?.computeUnitPrice ?? 0;
                    }
                    txToSend = await addPriorityFeeInstructions(connection, txToSend, cuLimitForFee, cuPriceForFee);
                }

                // Sign the transaction
                if (isVersioned) (txToSend as VersionedTransaction).sign([signingKeypair]);
                else (txToSend as Transaction).sign(signingKeypair);
                const serializedTx = txToSend.serialize();

                // Optional final simulation for non-pre-optimized transactions
                if (!isPreFeeOptimized) {
                    try {
                        let txToSimulateFinal: VersionedTransaction;
                        if (isVersioned) txToSimulateFinal = txToSend as VersionedTransaction;
                        else { // Convert legacy to versioned for final simulation
                            const legacyForSim = txToSend as Transaction;
                            if (!legacyForSim.feePayer) legacyForSim.feePayer = signingKeypair.publicKey;
                            if (!legacyForSim.recentBlockhash) legacyForSim.recentBlockhash = blockhash; // Should be set
                            txToSimulateFinal = new VersionedTransaction(legacyForSim.compileMessage());
                        }
                        const simResult = await connection.simulateTransaction(txToSimulateFinal, { sigVerify: false, replaceRecentBlockhash: false, commitment: sendOptions?.preflightCommitment || 'confirmed' });
                        if (simResult.value.err) {
                            lastError = new Error(`Tx simulation failed before send: ${JSON.stringify(simResult.value.err)}`);
                            if (attempt === MAX_RETRIES) throw lastError;
                            continue; // Retry
                        }
                     } catch (simError: any) {
                        lastError = simError;
                        if (attempt === MAX_RETRIES) throw simError;
                        continue; // Retry
                     }
                }

                // Send and confirm the transaction
                const signatureString = await connection.sendRawTransaction(serializedTx, {
                    ...sendOptions, skipPreflight: sendOptions?.skipPreflight ?? true,
                    maxRetries: 0, // Retries handled by this loop
                });

                const confirmationResult = await connection.confirmTransaction({
                    signature: signatureString, blockhash, lastValidBlockHeight
                }, commitmentForBHandConfirm);

                if (confirmationResult.value.err) {
                    lastError = new Error(`Tx confirmation failed: ${JSON.stringify(confirmationResult.value.err)}`);
                    if (attempt === MAX_RETRIES) throw lastError;
                    continue; // Retry
                 }
                return { signature: signatureString }; // Success
            } catch (error: any) {
                lastError = error;
                let refinedErrorMessage = `Transaction failed on attempt ${attempt + 1}.`;
                if (error instanceof Error) { // Refine common error messages
                    if (error.message.includes("blockhash not found")) refinedErrorMessage = "Transaction failed: Blockhash not found or expired. Please try again.";
                    else if (error.message.toLowerCase().includes("simulation failed")) refinedErrorMessage = `Transaction simulation failed: ${error.message.substring(0,150)}. Check details and network.`;
                    else if (error.message.toLowerCase().includes("timed out")) refinedErrorMessage = "Transaction timed out. It might still go through. Check explorer.";
                    else refinedErrorMessage = `Transaction error: ${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}`;
                 } else refinedErrorMessage = "An unknown error occurred during the transaction process.";
                lastError = new Error(refinedErrorMessage); 
                if (attempt === MAX_RETRIES) throw lastError; // Throw if max retries reached
            }
        }
        // Should not be reached if loop throws on max retries
        throw lastError || new Error("Failed to sign and send transaction after all retries.");
    } finally {
        if (signerInfo) {
            clearKeyMaterial(signerInfo.secretToClear, signerInfo.keypair);
        }
    }
}