// src/injectedScript/register.ts
import type {
    Wallet,
    WalletEventsWindow,
    WindowRegisterWalletEventCallback, // Callback type for dApp to provide its registration API
    WindowAppReadyEvent,               // Event type dispatched by dApp when it's ready
    WindowRegisterWalletEvent          // Interface for the 'register-wallet' event
} from '@wallet-standard/base';

/**
 * Custom Event class for 'wallet-standard:register-wallet'.
 * This event is dispatched by the wallet to announce its presence to dApps.
 * It implements the WindowRegisterWalletEvent interface from '@wallet-standard/base'.
 */
class KyokuRegisterWalletEvent extends Event implements WindowRegisterWalletEvent {
    // The detail property holds the callback that dApps use to register the wallet.
    readonly #detail: WindowRegisterWalletEventCallback;

    /**
     * Returns the detail of the event, which is the API for the dApp to register the wallet.
     */
    get detail() {
        return this.#detail;
    }

    /**
     * Returns the type of the event, always 'wallet-standard:register-wallet'.
     */
    get type() {
        return 'wallet-standard:register-wallet' as const;
    }

    /**
     * Constructs a new KyokuRegisterWalletEvent.
     * @param callback - The function dApps call to register the wallet.
     * This callback expects an API object with a `register` method.
     */
    constructor(callback: WindowRegisterWalletEventCallback) {
        super('wallet-standard:register-wallet', {
            bubbles: false,    // Event does not bubble up through the DOM.
            cancelable: false, // Event cannot be canceled.
            composed: false,   // Event does not propagate across shadow DOM boundaries.
        });
        this.#detail = callback;
    }

    /** @deprecated */
    preventDefault(): never {
        throw new Error('preventDefault cannot be called on RegisterWalletEvent');
    }

    /** @deprecated */
    stopImmediatePropagation(): never {
        throw new Error('stopImmediatePropagation cannot be called on RegisterWalletEvent');
    }

    /** @deprecated */
    stopPropagation(): never {
        throw new Error('stopPropagation cannot be called on RegisterWalletEvent');
    }
}

/**
 * Registers the provided wallet instance with dApps according to the Wallet Standard.
 * It dispatches a 'wallet-standard:register-wallet' event for immediate registration
 * and listens for 'wallet-standard:app-ready' for dApps that initialize later.
 *
 * @param wallet - The instance of the wallet provider (e.g., KyokuWalletProvider) to be registered.
 */
export function registerKyokuWallet(wallet: Wallet): void {
    // 1. Define the callback exposed to dApps via the 'wallet-standard:register-wallet' event.
    //    When a dApp receives this event, it calls `event.detail({ register: dAppRegisterFn })`.
    //    Our `callbackForRegisterWalletEvent` becomes `event.detail`.
    const callbackForRegisterWalletEvent: WindowRegisterWalletEventCallback = (dAppProvidedApi) => {
        // The dApp provides its own `register` function; we call it with our wallet instance.
        if (dAppProvidedApi && typeof dAppProvidedApi.register === 'function') {
            dAppProvidedApi.register(wallet);
        } else {
            // DApp API in 'register-wallet' event detail was invalid or missing 'register' function.
        }
    };

    // 2. Dispatch the 'wallet-standard:register-wallet' event to announce the wallet.
    //    DApps already listening for this event will pick it up.
    try {
        (window as WalletEventsWindow).dispatchEvent(new KyokuRegisterWalletEvent(callbackForRegisterWalletEvent));
    } catch (error) {
        // Error occurred during 'wallet-standard:register-wallet' event dispatch.
    }

    // 3. Listen for the 'wallet-standard:app-ready' event from dApps.
    //    This handles cases where the dApp initializes *after* the wallet has already dispatched its event.
    try {
        const appReadyListener = (event: WindowAppReadyEvent): void => {
            // The event.detail from 'app-ready' should contain a `register` function from the dApp.
            // This function expects the wallet instance and typically returns an unregister function.
            const dAppApiFromAppReady = event.detail;
            if (dAppApiFromAppReady && typeof dAppApiFromAppReady.register === 'function') {
                const unregisterWallet = dAppApiFromAppReady.register(wallet);
                // The `unregisterWallet` function can be stored if the wallet needs to unregister itself later,
                // though this is less common for the wallet to initiate.
                if (typeof unregisterWallet === 'function') {
                    // Successfully registered with dApp via 'app-ready'.
                }
            } else {
                // 'app-ready' event heard, but event.detail.register was not a function or event.detail was missing.
            }
        };
        (window as WalletEventsWindow).addEventListener('wallet-standard:app-ready', appReadyListener as EventListener);
    } catch (error) {
        // 'wallet-standard:app-ready' event listener could not be added.
    }
}