// src/background/shared/transactionBuilder.ts
import {
    PublicKey,
    SystemProgram,
    VersionedTransaction,
    TransactionMessage,
    TransactionInstruction,
    AccountInfo,
} from '@solana/web3.js';
import {
    createTransferInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { getConnection } from './state';

interface BuildTransactionPayload {
    senderPublicKey: string;
    recipientAddress: string;
    amountLamports: string; // Raw amount in smallest units (lamports or token's smallest unit)
    tokenMintAddress: string | null; // Null for SOL transfers
    tokenDecimals: number; // Relevant for SPL tokens
}

/**
 * Builds a VersionedTransaction for sending SOL or SPL tokens.
 * Handles creation of recipient's Associated Token Account (ATA) if it doesn't exist for SPL transfers.
 * @param payload - Details of the transfer.
 * @returns A promise that resolves to a VersionedTransaction.
 */
export async function buildTransaction(payload: BuildTransactionPayload): Promise<VersionedTransaction> {
    const connection = await getConnection();
    if (!connection) {
        throw new Error("Failed to get connection for building transaction.");
    }

    const sender = new PublicKey(payload.senderPublicKey);
    const recipient = new PublicKey(payload.recipientAddress);
    const numericLamports = BigInt(payload.amountLamports); // Raw amount

    const instructions: TransactionInstruction[] = [];

    if (payload.tokenMintAddress) { // SPL Token Transfer
        const mint = new PublicKey(payload.tokenMintAddress);
        const senderTokenAccount = getAssociatedTokenAddressSync(mint, sender);
        const recipientTokenAccount = getAssociatedTokenAddressSync(mint, recipient);

        // Check if recipient's ATA exists, create if not.
        const recipientAtaInfo: AccountInfo<Buffer> | null = await connection.getAccountInfo(recipientTokenAccount);

        if (recipientAtaInfo === null) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    sender, // Payer for ATA creation
                    recipientTokenAccount, // ATA address to be created
                    recipient, // Owner of the new ATA
                    mint // Mint of the token
                )
            );
        } else {
            // Verify existing ATA is a valid token account.
            if (!recipientAtaInfo.owner.equals(TOKEN_PROGRAM_ID)) {
                const errorMsg = `Recipient's target account ${recipientTokenAccount.toBase58()} for token ${mint.toBase58()} is not a valid SPL token account.`;
                throw new Error(errorMsg);
            }
        }

        instructions.push(
            createTransferInstruction(
                senderTokenAccount,
                recipientTokenAccount,
                sender,
                numericLamports, // Raw amount; for NFTs (decimals=0), this is 1.
                [],
                TOKEN_PROGRAM_ID
            )
        );
    } else { // SOL Transfer
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: sender,
                toPubkey: recipient,
                lamports: Number(numericLamports), // SystemProgram.transfer uses number for lamports
            })
        );
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash,
        instructions: instructions,
    }).compileToV0Message(); // Potentially add LUTs here if needed for complex transactions

    const transaction = new VersionedTransaction(messageV0);
    return transaction;
}

// --- Function for Batch NFT Transfers ---
interface BuildNftBatchTransferPayload {
    senderPublicKey: string;
    recipientAddress: string;
    nftMintAddresses: string[]; // Array of mint addresses for the NFTs
}

/**
 * Builds a VersionedTransaction for transferring multiple NFTs in a single transaction.
 * Handles creation of recipient's Associated Token Accounts (ATAs) if they don't exist.
 * @param payload - Details of the batch NFT transfer.
 * @returns A promise that resolves to a VersionedTransaction.
 */
export async function buildNftBatchTransferTransaction(payload: BuildNftBatchTransferPayload): Promise<VersionedTransaction> {
    const connection = await getConnection();
    if (!connection) {
        throw new Error("Failed to get connection for building NFT batch transaction.");
    }

    const sender = new PublicKey(payload.senderPublicKey);
    const recipient = new PublicKey(payload.recipientAddress);
    const instructions: TransactionInstruction[] = [];

    for (const mintAddress of payload.nftMintAddresses) {
        const mint = new PublicKey(mintAddress);
        // Sender's ATA must exist as they own the NFT.
        const senderTokenAccount = getAssociatedTokenAddressSync(mint, sender);
        // Allow off-curve for recipient's ATA to handle potential new accounts.
        const recipientTokenAccount = getAssociatedTokenAddressSync(mint, recipient, true);

        // Check if recipient's ATA exists, create if not.
        const recipientAtaInfo = await connection.getAccountInfo(recipientTokenAccount);
        if (recipientAtaInfo === null) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    sender,                 // Payer for ATA creation
                    recipientTokenAccount,  // ATA address to be created
                    recipient,              // Owner of the new ATA
                    mint                    // Mint of the NFT
                )
            );
        } else if (!recipientAtaInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            // If account exists but is not a token account, this is an error.
            throw new Error(`Recipient's target account ${recipientTokenAccount.toBase58()} for NFT ${mint.toBase58()} is not a valid token account.`);
        }

        // Add the transfer instruction for the NFT.
        instructions.push(
            createTransferInstruction(
                senderTokenAccount,    // Source ATA
                recipientTokenAccount, // Destination ATA
                sender,                
                1,                     
                [],                    
                TOKEN_PROGRAM_ID       
            )
        );
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash,
        instructions: instructions,
    }).compileToV0Message(); // Consider LUTs if many unique accounts are involved

    const transaction = new VersionedTransaction(messageV0);
    return transaction;
}