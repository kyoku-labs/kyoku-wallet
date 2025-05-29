// src/background/handlers/burnHandlers.ts
import {
    PublicKey,
    VersionedTransaction,
    TransactionMessage,
    TransactionInstruction,
} from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    createBurnInstruction,
    createCloseAccountInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { keyringManager, getConnection } from '../shared/state';
import { KeyringError, AccountNotFoundError } from '../../background/core/keyring/KeyringManager';
import { SendResponse, safeSendResponse } from '../shared/helpers';
import { processSignAndSendTransaction } from '../shared/signingHandlers';
import { fetchNFTAssetDetails as fetchNFTAssetDetailsService } from '../services/nftService';
import type { CollectibleInfo } from '../services/nftTypes';

interface BurnTokenPayload {
  mintAddress: string;
  ownerAddress: string;
  amountLamports: string;
  tokenDecimals: number;
}

/**
 * Handles requests to burn a specified amount of a fungible token and close its associated token account.
 * @param payload - Details of the token to burn (mint, owner, amount, decimals).
 * @param respond - Callback function to send the response.
 * @throws {KeyringError} If parameters are missing, account is view-only, wallet is locked, or other issues occur.
 * @throws {AccountNotFoundError} If the owner account is not found.
 * @throws {Error} If Solana connection fails.
 */
export async function handleBurnTokenRequest(
    payload: BurnTokenPayload,
    respond: SendResponse
): Promise<void> {
    const { mintAddress, ownerAddress, amountLamports, tokenDecimals } = payload;

    if (!mintAddress || !ownerAddress || amountLamports === undefined || tokenDecimals === undefined) {
        throw new KeyringError("Missing parameters for burning token. All fields are required.");
    }

    const activeAccount = await keyringManager.findAccountByPublicKey(ownerAddress);
    if (!activeAccount) {
        throw new AccountNotFoundError(`Owner account ${ownerAddress} not found. Ensure the correct account is active.`);
    }
    if (activeAccount.isViewOnly) {
        throw new KeyringError("Cannot burn tokens: The active account is view-only.");
    }
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Please unlock to burn tokens.");
    }

    const connection = await getConnection();
    if (!connection) {
        throw new Error("Failed to establish Solana connection. Burning token aborted.");
    }

    const ownerPk = new PublicKey(ownerAddress);
    const mintPk = new PublicKey(mintAddress);
    let tokenAccountAddress: PublicKey;

    try {
        tokenAccountAddress = getAssociatedTokenAddressSync(mintPk, ownerPk);
    } catch (e: any) {
        // Error deriving ATA for burn
        throw new KeyringError(`Failed to derive token account address: ${e.message}`);
    }

    const instructions: TransactionInstruction[] = [];
    const amountToBurn = BigInt(amountLamports);

    if (amountToBurn > 0) {
        instructions.push(
            createBurnInstruction(
                tokenAccountAddress,
                mintPk,
                ownerPk,
                amountToBurn,
                [],
                TOKEN_PROGRAM_ID
            )
        );
        // Added burn instruction
    } else {
        // Amount to burn is 0, skipping burn instruction, will only attempt to close ATA.
    }

    // Always attempt to close the account
    instructions.push(
        createCloseAccountInstruction(
            tokenAccountAddress,
            ownerPk, // Destination for remaining SOL (rent)
            ownerPk, // Authority to close
            [],
            TOKEN_PROGRAM_ID
        )
    );

    if (instructions.length === 0) {
        // This case should ideally not be reached if we always add close instruction.
        throw new KeyringError("No instructions generated for burning token. This should not happen.");
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const messageV0 = new TransactionMessage({
        payerKey: ownerPk,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serializedTransaction = Array.from(transaction.serialize());

    // Transaction for burning token built. Requesting signing and sending...
    const result = await processSignAndSendTransaction(
        activeAccount,
        serializedTransaction,
        { skipPreflight: false, preflightCommitment: 'confirmed' }
    );

    // Token burn and account close transaction successful
    safeSendResponse(respond, { success: true, signature: result.signature }, 'burnTokenRequest');
}


interface BurnNftPayload {
  mintAddress: string;
  ownerAddress: string;
}

/**
 * Handles requests to burn an NFT (standard SPL or checks for compressed type).
 * @param payload - Details of the NFT to burn (mint, owner).
 * @param respond - Callback function to send the response.
 * @throws {KeyringError} If parameters are missing, NFT details cannot be fetched, or other issues.
 * @throws {AccountNotFoundError} If the owner account is not found.
 * @throws {Error} If Solana connection fails or NFT is compressed (not yet supported).
 */
export async function handleBurnNftRequest(
    payload: BurnNftPayload,
    respond: SendResponse
): Promise<void> {
    const { mintAddress, ownerAddress } = payload;

    if (!mintAddress || !ownerAddress) {
        throw new KeyringError("Missing parameters for burning NFT. Mint and owner addresses are required.");
    }

    const activeAccount = await keyringManager.findAccountByPublicKey(ownerAddress);
    if (!activeAccount) {
        throw new AccountNotFoundError(`Owner account ${ownerAddress} not found. Ensure the correct account is active.`);
    }
    if (activeAccount.isViewOnly) {
        throw new KeyringError("Cannot burn NFT: The active account is view-only.");
    }
    if (!keyringManager.isUnlocked()) {
        throw new KeyringError("Wallet is locked. Please unlock to burn NFT.");
    }

    const connection = await getConnection();
    if (!connection) {
        throw new Error("Failed to establish Solana connection. Burning NFT aborted.");
    }

    const ownerPk = new PublicKey(ownerAddress);
    const mintPk = new PublicKey(mintAddress);
    const instructions: TransactionInstruction[] = [];

    // Fetching details for NFT mint to determine type...
    let nftCollectibleInfo: CollectibleInfo | null = null;
    try {
        nftCollectibleInfo = await fetchNFTAssetDetailsService(mintAddress);
    } catch (detailsError: any) {
        // Error fetching NFT details
        throw new KeyringError(`Failed to fetch details for NFT ${mintAddress.substring(0,6)}...: ${detailsError.message}`);
    }

    if (!nftCollectibleInfo) {
        throw new KeyringError(`NFT with mint address ${mintAddress} not found or details could not be retrieved.`);
    }

    // Fetched NFT Info
    if (nftCollectibleInfo.isCompressed) {
        // NFT is identified as COMPRESSED.
        // Placeholder for cNFT burn instruction.
        // cNFT burning requires integration with @metaplex-foundation/mpl-bubblegum. This feature is not yet fully implemented.
        throw new KeyringError(`Burning compressed NFTs (like ${nftCollectibleInfo.name || mintAddress.substring(0,6) + "..."}) is not yet supported. This functionality is planned for a future update.`);

    } else {
        // --- Standard SPL NFT Burning Logic ---
        // NFT identified as a Standard SPL NFT.
        let tokenAccountAddress: PublicKey;
        try {
            tokenAccountAddress = getAssociatedTokenAddressSync(mintPk, ownerPk);
        } catch (e: any) {
            // Error deriving ATA for standard NFT burn
            throw new KeyringError(`Failed to derive token account for NFT: ${e.message}`);
        }

        // Standard NFT Account (ATA) for burning

        // Check if ATA exists and has a balance of 1.
        // Though the burn instruction itself will fail if conditions aren't met,
        // a pre-check can provide a better error.
        const ataInfo = await connection.getAccountInfo(tokenAccountAddress);
        if (!ataInfo) {
            throw new KeyringError(`Token account for NFT ${nftCollectibleInfo.name} does not exist.`);
        }
        // Further checks like balance can be added if `getParsedAccountInfo` is used.

        instructions.push(
            createBurnInstruction(tokenAccountAddress, mintPk, ownerPk, 1, [], TOKEN_PROGRAM_ID),
            createCloseAccountInstruction(tokenAccountAddress, ownerPk, ownerPk, [], TOKEN_PROGRAM_ID)
        );
        // Added burn and close account instructions for standard SPL NFT
    }

    if (instructions.length === 0) {
        throw new KeyringError("No burn instructions could be generated for this NFT. Type might be unsupported or an internal error occurred.");
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const messageV0 = new TransactionMessage({
        payerKey: ownerPk,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serializedTransaction = Array.from(transaction.serialize());

    // Transaction for burning NFT built. Requesting signing and sending...
    const result = await processSignAndSendTransaction(
        activeAccount,
        serializedTransaction,
        { skipPreflight: false, preflightCommitment: 'confirmed' }
    );

    // NFT burn transaction successful
    safeSendResponse(respond, { success: true, signature: result.signature }, 'burnNftRequest');
}