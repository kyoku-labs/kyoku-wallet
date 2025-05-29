// src/injectedScript/KyokuWalletAccount.ts
import type { WalletAccount, WalletIcon } from '@wallet-standard/base';
import {
    SolanaSignAndSendTransaction,
    SolanaSignMessage,
    SolanaSignTransaction,
} from '@solana/wallet-standard-features';
import type { SolanaChain } from './solanaChains';


const KYOKU_CHAINS: readonly SolanaChain[] = ['solana:mainnet', 'solana:devnet', 'solana:testnet']; 
const KYOKU_FEATURES/*: ReadonlyArray<WalletAccount['features'][number]>*/ = [ // Type assertion if strict
    SolanaSignAndSendTransaction, 
    SolanaSignTransaction,
    SolanaSignMessage,
] as const;


export class KyokuWalletAccount implements WalletAccount {
    readonly #address: WalletAccount['address'];
    readonly #publicKey: WalletAccount['publicKey'];
    readonly #chains: WalletAccount['chains'];
    readonly #features: WalletAccount['features'];
    readonly #label: WalletAccount['label'] | undefined;
    readonly #icon: WalletIcon | undefined;

    get address() {
        return this.#address;
    }

    get publicKey() {
        // Return a new Uint8Array to prevent external modification
        return this.#publicKey.slice();
    }

    get chains() {
        return this.#chains.slice();
    }

    get features() {
        return this.#features.slice();
    }

    get label() {
        return this.#label;
    }

    get icon() {
        return this.#icon;
    }

    constructor({
        address,
        publicKey,
        label,
        icon,
    }: {
        address: WalletAccount['address'];
        publicKey: WalletAccount['publicKey'];
        label?: WalletAccount['label'];
        icon?: WalletIcon;
    }) {
        if (new.target === KyokuWalletAccount) {
            Object.freeze(this);
        }

        this.#address = address;
        this.#publicKey = publicKey;
        this.#chains = KYOKU_CHAINS;
        this.#features = KYOKU_FEATURES;
        this.#label = label;
        this.#icon = icon;
    }
}