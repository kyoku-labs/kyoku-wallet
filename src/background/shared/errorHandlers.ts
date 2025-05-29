// src/background/shared/errorHandlers.ts
import { SendResponse, safeSendResponse, lockWalletState, notifyPopupToLock } from './helpers';
import { BackgroundHandler } from './types';
import { 
    IncorrectPasswordError, 
    KeyringNotInitializedError, 
    KeyringError,
    NoMnemonicSeedError 
} from '../../background/core/keyring/KeyringManager'; 

// CommonUserFacingError class definition (if not already in this file)
export class CommonUserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommonUserFacingError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CommonUserFacingError);
    }
  }
}

function extractErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred.';
}

export function withErrorHandling<P = any, R = any>(
  handler: BackgroundHandler<P, R>,
  actionName: string
): BackgroundHandler<P, void> {
  return async (payload: P, respond: SendResponse): Promise<void> => {
    try {
      await handler(payload, respond);
    } catch (error: any) {
      // Specific check for NoMnemonicSeedError first
      if (error instanceof NoMnemonicSeedError) {
      //  console.warn(`[${actionName}] Handling NoMnemonicSeedError. Sending specific error "NO_MNEMONIC_FOUND" to UI.`);
        safeSendResponse(respond, { success: false, error: "NO_MNEMONIC_FOUND" }, actionName);
        // Note: We might not need to lock the wallet for this specific error,
        // as it's a missing feature rather than a security/state inconsistency.
        // So, we return early to avoid the generic error handling that might lock.
        return; 
      }

      const errorMessageForUI = extractErrorMessage(error);

      if (error instanceof CommonUserFacingError) {
       // console.warn(`[${actionName}] Common user-facing error: "${errorMessageForUI}"`);
      } else if (error instanceof KeyringError) { 
      //  console.warn(`[${actionName}] Keyring operation error: ${error.message}`, error);
      } else {
      //  console.error(`[${actionName}] An unexpected error occurred:`, error);
      }

      if (error instanceof IncorrectPasswordError || 
          error instanceof KeyringNotInitializedError || 
          (error instanceof Error && error.message?.toLowerCase().includes('locked'))) {
        try {
        //  console.log(`[${actionName}] Locking wallet due to error: ${error.name || 'Error'}`);
          await lockWalletState();
          await notifyPopupToLock();
        } catch (lockError) {
      //    console.error(`[${actionName}] Failed to lock wallet during error handling:`, lockError);
        }
      }
      
      safeSendResponse(respond, { success: false, error: errorMessageForUI }, actionName);
    }
  };
}