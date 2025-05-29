// src/injectedScript/index.ts
import {
    PublicKey,
    Transaction,
    VersionedTransaction,
} from '@solana/web3.js';
import type { Wallet, WalletIcon } from '@wallet-standard/base';
import {
    StandardConnect,
    type StandardConnectFeature,
    type StandardConnectMethod,
    type StandardConnectInput,
    type StandardConnectOutput,
    StandardDisconnect,
    type StandardDisconnectFeature,
    type StandardDisconnectMethod,
    StandardEvents,
    type StandardEventsFeature,
    type StandardEventsOnMethod,
    type StandardEventsListeners,
    type StandardEventsNames,
} from '@wallet-standard/features';
import {
    SolanaSignAndSendTransaction,
    type SolanaSignAndSendTransactionFeature,
    type SolanaSignAndSendTransactionMethod,
    type SolanaSignAndSendTransactionOutput,
    SolanaSignMessage,
    type SolanaSignMessageFeature,
    type SolanaSignMessageMethod,
    type SolanaSignMessageOutput,
    SolanaSignTransaction,
    type SolanaSignTransactionFeature,
    type SolanaSignTransactionMethod,
    type SolanaSignTransactionOutput,
} from '@solana/wallet-standard-features';
import bs58 from 'bs58';

import { KyokuWalletAccount } from './KyokuWalletAccount';
import { SOLANA_CHAINS, isSolanaChain } from './solanaChains';
import { registerKyokuWallet } from './register';

// --- Helper for Deserializing Specific Solana Types from Background Script ---
const deserializeSolanaTypes = (data: any): any => {
    if (!data) return data;

    if (typeof data === 'object' && data !== null) {
        // Check for specific types to deserialize
        if (data.__publicKeyB58__) {
            try { return new PublicKey(data.__publicKeyB58__); }
            catch (e) { /* Failed to deserialize PublicKey */ return null; }
        }
        if (data.__transaction__ && Array.isArray(data.__transaction__)) {
            try { return Transaction.from(Uint8Array.from(data.__transaction__)); }
            catch (e) { /* Failed to deserialize legacy Transaction */ return null; }
        }
        if (data.__versionedTransaction__ && Array.isArray(data.__versionedTransaction__)) {
            try { return VersionedTransaction.deserialize(Uint8Array.from(data.__versionedTransaction__)); }
            catch (e) { /* Failed to deserialize VersionedTransaction */ return null; }
        }
        if (data.__uint8Array__ && Array.isArray(data.__uint8Array__)) {
            return Uint8Array.from(data.__uint8Array__);
        }

        // Recursively deserialize for arrays and objects
        if (Array.isArray(data)) {
            return data.map(deserializeSolanaTypes);
        }
        const deserializedObject: { [key: string]: any } = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                deserializedObject[key] = deserializeSolanaTypes(data[key]);
            }
        }
        return deserializedObject;
    }
    return data; // Return primitive types as is
};

interface KyokuWalletDetails {
    name: string;
    version: string;
    iconURL: WalletIcon;
}

export class KyokuWalletProvider implements Wallet {
    readonly #listeners: { [E in StandardEventsNames]?: StandardEventsListeners[E][] } = {};
    readonly #walletStandardVersion = '1.0.0' as const; // Wallet Standard API version
    readonly #name: string; // Name of this wallet provider
    readonly #icon: WalletIcon; // Icon for this wallet provider
    #account: KyokuWalletAccount | null = null; // Current connected account
    #requestPromises: Map<string, { resolve: Function; reject: Function; }> = new Map(); // For tracking requests to content script
    public readyState: 'Installed' | 'NotDetected' = 'Installed'; // Assumed installed as this script runs
    #connecting: boolean = false; // Prevents concurrent connection attempts

    constructor(details: KyokuWalletDetails) {
        this.#name = details.name;
        this.#icon = details.iconURL;
        this.#setupMessageListener(); // Set up listener for messages from content script

        // Initial check for connection status with background script
        this.#sendRequestToContentScript('KYOKU_CHECK_CONNECTION_STATUS', {})
            .then((statusResponse: any) => {
                if (statusResponse && statusResponse.isConnected && statusResponse.publicKey instanceof PublicKey) {
                    this.#setAccount(statusResponse.publicKey);
                }
            })
            .catch(() => {
                // Error checking initial connection status, remain disconnected
            });
    }

    // --- Wallet Standard Properties ---
    get version() { return this.#walletStandardVersion; }
    get name() { return this.#name; }
    get icon() { return this.#icon; }
    get chains() { return SOLANA_CHAINS.slice(); } // Supported Solana chains
    get accounts() { return this.#account ? [this.#account] : []; } // Current accounts

    // --- Wallet Standard Features ---
    get features(): StandardConnectFeature &
        StandardDisconnectFeature &
        StandardEventsFeature &
        SolanaSignAndSendTransactionFeature &
        SolanaSignTransactionFeature &
        SolanaSignMessageFeature {
        return {
            [StandardConnect]: { version: '1.0.0', connect: this.#connect },
            [StandardDisconnect]: { version: '1.0.0', disconnect: this.#disconnect },
            [StandardEvents]: { version: '1.0.0', on: this.#on },
            [SolanaSignAndSendTransaction]: {
                version: '1.0.0',
                supportedTransactionVersions: ['legacy', 0],
                signAndSendTransaction: this.#signAndSendTransaction,
            },
            [SolanaSignTransaction]: {
                version: '1.0.0',
                supportedTransactionVersions: ['legacy', 0],
                signTransaction: this.#signTransaction,
            },
            [SolanaSignMessage]: {
                version: '1.0.0',
                signMessage: this.#signMessage,
            },
        };
    }

    // --- Internal State ---
    get connecting() { return this.#connecting; }
    get connected() { return !!this.#account; }
    public readonly isKyokuWallet = true; // Custom flag to identify this wallet provider

    // --- Private Helper Methods ---
    #setAccount = (publicKey: PublicKey | null) => {
        const oldAccount = this.#account;
        if (publicKey) {
            const address = publicKey.toBase58();
            if (this.#account?.address !== address) { // Create new account object if different
                this.#account = new KyokuWalletAccount({
                    address,
                    publicKey: publicKey.toBytes(),
                    label: this.name, // Or a more specific account label if available
                    icon: this.icon,
                });
            }
        } else {
            this.#account = null; // Clear account
        }

        // Emit 'change' event if account status changed
        if (oldAccount?.address !== this.#account?.address || (!oldAccount && this.#account) || (oldAccount && !this.#account)) {
             this.#emit('change', { accounts: this.accounts });
        }
    }

    #on: StandardEventsOnMethod = (event, listener) => {
        (this.#listeners[event]?.push(listener)) || (this.#listeners[event] = [listener]);
        return (): void => this.#off(event, listener); // Return a function to unregister the listener
    };

    #emit = <E extends StandardEventsNames>(event: E, ...args: Parameters<StandardEventsListeners[E]>): void => {
        (this.#listeners[event] || []).forEach((listener) => listener.apply(null, args));
    }

    #off = <E extends StandardEventsNames>(event: E, listener: StandardEventsListeners[E]): void => {
        this.#listeners[event] = (this.#listeners[event] || []).filter((existingListener) => listener !== existingListener);
    };

    #generateRequestId = (): string => {
        return `kyoku-request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }

    // Sends a request to the content script, which relays to the background script
    #sendRequestToContentScript = (type: string, data: any): Promise<any> => {
        return new Promise((resolve, reject) => {
            const id = this.#generateRequestId();
            this.#requestPromises.set(id, { resolve, reject }); // Store promise resolvers
            window.postMessage({
                target: 'KYOKU_CONTENT_SCRIPT', // Target content script
                payload: { id, type, data }
            }, window.location.origin); // Post to current page's origin
        });
    }

    // Sets up the listener for messages from the content script
    #setupMessageListener = (): void => {
        window.addEventListener('message', (event: MessageEvent) => {
            // Filter messages: must come from window and target this injected script
            if (event.source !== window || !event.data || event.data.target !== 'KYOKU_INJECTED_SCRIPT') {
                return;
            }
            const { id, data, error, eventName, eventData } = event.data.payload;
            const deserializedResponseData = deserializeSolanaTypes(data);
            const deserializedEventPayload = deserializeSolanaTypes(eventData);

            if (eventName) { // Handle broadcasted events (like connect/disconnect from background)
                if (eventName === 'accountChanged' || eventName === 'connect') {
                    const newPublicKey = deserializedEventPayload?.publicKey instanceof PublicKey ? deserializedEventPayload.publicKey : null;
                    this.#setAccount(newPublicKey);
                } else if (eventName === 'disconnect') {
                    this.#setAccount(null); // Disconnected, clear account
                }
                return;
            }

            // Handle responses to specific requests
            const promiseCallbacks = this.#requestPromises.get(id);
            if (promiseCallbacks) {
                if (error) {
                    promiseCallbacks.reject(new Error(typeof error === 'string' ? error : (error.message || 'Unknown error from background')));
                } else {
                    promiseCallbacks.resolve(deserializedResponseData);
                }
                this.#requestPromises.delete(id); // Clean up promise
            }
        });
    }

    // --- Standard Wallet Methods Implementation ---
    #connect: StandardConnectMethod = async (input?: StandardConnectInput): Promise<StandardConnectOutput> => {
        if (this.#account && !input?.silent) { // Already connected and not a silent request
            return { accounts: this.accounts };
        }
        if (this.#connecting) {
            throw new Error("Connection request already in progress.");
        }

        this.#connecting = true;
        try {
            const response = await this.#sendRequestToContentScript('KYOKU_CONNECT_REQUEST', {
                onlyIfTrusted: !!input?.silent, // For silent connections, only succeed if already trusted
                metadata: { // dApp metadata
                    origin: window.location.origin,
                    pageTitle: document.title,
                    pageIcon: (document.querySelector("link[rel*='icon']") as HTMLLinkElement)?.href ||
                              (document.querySelector("link[rel*='shortcut icon']") as HTMLLinkElement)?.href ||
                               null,
                }
            });

            if (response && response.publicKey instanceof PublicKey) {
                this.#setAccount(response.publicKey);
                return { accounts: this.accounts };
            }
            if (input?.silent && !response?.publicKey) { // Silent connect failed to auto-connect
                return { accounts: [] };
            }
            throw new Error('Connection failed: Invalid response or no public key from wallet.');
        } catch (error) {
            this.#setAccount(null); // Ensure account is cleared on error
            throw error;
        } finally {
            this.#connecting = false;
        }
    };

    #disconnect: StandardDisconnectMethod = async (): Promise<void> => {
        if (!this.#account) { // Not connected, nothing to do
            return;
        }
        try {
            await this.#sendRequestToContentScript('KYOKU_DISCONNECT_REQUEST', { origin: window.location.origin });
            // Account will be set to null via the 'disconnect' event from background if successful.
        } catch (error) {
            // Error during disconnect request, forcefully clear local state
            this.#setAccount(null);
            throw error;
        }
    };

    #serializeTransactionForBG = (transaction: Transaction | VersionedTransaction): { type: string, data: number[] } => {
        if (transaction instanceof VersionedTransaction) {
            return { type: 'versioned', data: Array.from(transaction.serialize()) };
        } else if (transaction instanceof Transaction) {
            // Serialize legacy without requiring all signatures, as background will handle signing
            return { type: 'legacy', data: Array.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })) };
        }
        throw new Error("Unsupported transaction type for serialization to background.");
    }

    #signAndSendTransaction: SolanaSignAndSendTransactionMethod = async (...inputs) => {
        if (!this.#account) throw new Error('Not connected: Wallet account is not available.');
        const outputs: SolanaSignAndSendTransactionOutput[] = [];

        for (const input of inputs) {
            if (input.account !== this.#account) throw new Error('Invalid account for signing: Input account does not match connected wallet account.');
            if (!isSolanaChain(input.chain)) throw new Error(`Unsupported chain: ${input.chain}. Wallet only supports Solana chains.`);

            const response = await this.#sendRequestToContentScript('KYOKU_SIGN_AND_SEND_TRANSACTION_REQUEST', {
                transactionBytes: Array.from(input.transaction), // Send raw transaction bytes
                options: input.options, // SendOptions
                metadata: { origin: window.location.origin, pageTitle: document.title } // dApp context
            });

            if (response && typeof response.signature === 'string') {
                outputs.push({ signature: bs58.decode(response.signature) }); // Signature from background is base58 string
            } else {
                throw new Error('Failed to sign and send transaction: Invalid or missing signature in response from wallet.');
            }
        }
        return outputs;
    };

    #signTransaction: SolanaSignTransactionMethod = async (...inputs) => {
        if (!this.#account) throw new Error('Not connected: Wallet account is not available.');
        const outputs: SolanaSignTransactionOutput[] = [];

        const transactionsToProcess = inputs.map(input => {
            if (input.account !== this.#account) throw new Error('Invalid account for signing.');
            if (input.chain && !isSolanaChain(input.chain)) throw new Error(`Unsupported chain: ${input.chain}.`);

            let deserializedTx: Transaction | VersionedTransaction;
            try { // Attempt to deserialize as VersionedTransaction first
                deserializedTx = VersionedTransaction.deserialize(input.transaction);
            } catch (e) { // Fallback to legacy Transaction
                try {
                    deserializedTx = Transaction.from(input.transaction);
                } catch (deserializeError) {
                    throw new Error("Invalid transaction bytes provided for signing.");
                }
            }
            return this.#serializeTransactionForBG(deserializedTx); // Serialize for background
        });

        const response = await this.#sendRequestToContentScript('KYOKU_SIGN_ALL_TRANSACTIONS_REQUEST', {
            transactionsToSign: transactionsToProcess,
            metadata: { origin: window.location.origin, pageTitle: document.title }
        });

        if (response && Array.isArray(response.signedTransactions)) {
            if (response.signedTransactions.length !== inputs.length) {
                throw new Error('Mismatch in signed transaction count returned from wallet.');
            }
            response.signedTransactions.forEach((signedTxBytes: Uint8Array) => { // Expecting Uint8Array from deserializer
                outputs.push({ signedTransaction: signedTxBytes });
            });
        } else {
            throw new Error('Failed to sign transaction(s): Invalid or missing signed transactions in response from wallet.');
        }
        return outputs;
    };

    #signMessage: SolanaSignMessageMethod = async (...inputs) => {
        if (!this.#account) throw new Error('Not connected: Wallet account is not available.');
        const outputs: SolanaSignMessageOutput[] = [];

        for (const input of inputs) {
            if (input.account !== this.#account) throw new Error('Invalid account for signing message.');

            const response = await this.#sendRequestToContentScript('KYOKU_SIGN_MESSAGE_REQUEST', {
                message: Array.from(input.message), // Convert Uint8Array to number[] for postMessage
                publicKeyB58: this.#account.address, // Pass current account's public key for context
                metadata: { origin: window.location.origin, pageTitle: document.title }
            });

            if (response && response.signature instanceof Uint8Array) {
                outputs.push({
                    signedMessage: input.message, // Original message bytes
                    signature: response.signature,  // Signature bytes
                });
            } else {
                throw new Error('Failed to sign message: Invalid or missing signature in response from wallet.');
            }
        }
        return outputs;
    };
}

// --- Initialize and Register the Wallet on the Page ---
function initializeProvider() {
    // Request wallet details from content script (which gets from manifest)
    window.postMessage({ type: 'KYOKU_REQUEST_WALLET_DETAILS', target: 'KYOKU_CONTENT_SCRIPT_INIT' }, window.location.origin);

    const handleWalletDetails = (event: MessageEvent) => {
        if (event.source === window && event.data && event.data.type === 'KYOKU_WALLET_DETAILS' && event.data.target === 'KYOKU_INJECTED_SCRIPT') {
            window.removeEventListener('message', handleWalletDetails); // Clean up listener

            const { name, version: appVersion, iconURL, error } = event.data.payload;
            if (error) {
                return; // Failed to get details, cannot initialize provider
            }

            const kyokuWalletInstance = new KyokuWalletProvider({ name, version: appVersion, iconURL });

            registerKyokuWallet(kyokuWalletInstance); // Register with Wallet Standard

            // Expose on window.kyokuwallet for direct access
            Object.defineProperty(window, 'kyokuwallet', {
                value: kyokuWalletInstance,
                writable: false,
                configurable: true,
            });

            // Attempt to set window.solana if not present or configurable
            const existingSolanaDescriptor = Object.getOwnPropertyDescriptor(window, 'solana');
            if (existingSolanaDescriptor) {
                const existingSolana = (window as any).solana;
                if (existingSolana?.isKyokuWallet) {
                    // Kyoku already set as window.solana
                } else if (!existingSolanaDescriptor.configurable) {
                    // window.solana exists and is not configurable
                } else {
                    // window.solana exists, is configurable, attempt to overwrite
                    const backupName = `solana_previous_wallet_${(existingSolana?.name || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_')}`;
                    try {
                        if (!(window as any)[backupName]) {
                            Object.defineProperty(window, backupName, { value: existingSolana, writable: false, configurable: true });
                        }
                    } catch (e) { /* Could not back up existing provider */ }

                    try {
                        Object.defineProperty(window, 'solana', { value: kyokuWalletInstance, writable: false, configurable: true });
                    } catch (defineError: any) { /* Failed to set window.solana even if configurable */ }
                }
            } else { // window.solana does not exist, define it
                try {
                    Object.defineProperty(window, 'solana', { value: kyokuWalletInstance, writable: false, configurable: true });
                } catch (defineError: any) { /* CRITICAL: Failed to set window.solana */ }
            }
        }
    };
    window.addEventListener('message', handleWalletDetails);
}

// --- Script Execution Start ---
// Ensure DOM is ready before initializing the provider
if (document.readyState === 'complete' || document.readyState === 'interactive' || document.readyState === "loading") {
    initializeProvider();
} else {
    document.addEventListener('DOMContentLoaded', initializeProvider, { once: true });
}