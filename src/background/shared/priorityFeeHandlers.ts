// src/background/shared/priorityFeeHandlers.ts
import {
  Connection,
  Transaction,
  VersionedTransaction,
  SimulateTransactionConfig,
  PublicKey,
  ComputeBudgetProgram,
  MessageV0,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  TransactionInstruction,
  TransactionMessage,
  AccountMeta,
  MessageAddressTableLookup,
  AddressLookupTableAccount
} from '@solana/web3.js';

// --- Interfaces ---
export interface PriorityFeeTier {
  computeUnitPrice: number; // in microLamports
  priorityFeeLamports: string;
  finalTotalFeeLamports: string;
}

export interface AllPriorityFeeTiersResult {
  low: PriorityFeeTier;
  medium: PriorityFeeTier;
  high: PriorityFeeTier;
  baseFeeLamports: string;
  estimatedComputeUnits: number;
}

export interface PriorityFeeResult {
  computeUnitLimit: number;
  computeUnitPrice: number; // in microLamports
  priorityFee: string; // in Lamports
  baseFee: string; // in Lamports
}

export interface PriorityFeeOptions {
  priorityLevel?: 'low' | 'medium' | 'high';
  customComputeUnitLimit?: number;
  customComputeUnitPrice?: number; // in microLamports
}

// --- Helper to load Address Lookup Tables (LUTs) ---
async function getLoadedAddressLookupTableAccounts(
  connection: Connection,
  lookups: readonly MessageAddressTableLookup[] | undefined
): Promise<AddressLookupTableAccount[]> {
  if (!lookups || lookups.length === 0) return [];

  const accounts = await Promise.all(
    lookups.map(async lookup => {
      try {
        const acc = await connection.getAddressLookupTable(lookup.accountKey);
        return acc.value;
      } catch (e) {
        // WARN: Failed to load LUT
        return null;
      }
    })
  );
  const loaded = accounts.filter((acc): acc is AddressLookupTableAccount => acc !== null);
  return loaded;
}

// --- Compute Units Estimation Function (Buffer Adjusted) ---
async function estimateComputeUnits(
  connection: Connection,
  transaction: VersionedTransaction | Transaction,
  payerPublicKey: PublicKey
): Promise<number> {
  if (!connection) {
    return 200000; // Default fallback if connection is invalid
  }

  const simulateConfig: SimulateTransactionConfig = {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: 'confirmed',
  };
  let simResult: RpcResponseAndContext<SimulatedTransactionResponse>;

  // Ensure simulation uses the exact structure, converting legacy to VersionedTransaction if needed.
  let txToSimulate: VersionedTransaction;

  if (transaction instanceof VersionedTransaction) {
    txToSimulate = transaction;
  } else {
    const legacyTx = transaction as Transaction;
    if (!legacyTx.feePayer) legacyTx.feePayer = payerPublicKey;
    if (!legacyTx.recentBlockhash) {
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      legacyTx.recentBlockhash = blockhash;
    }
    txToSimulate = new VersionedTransaction(
      MessageV0.compile({
        payerKey: legacyTx.feePayer,
        instructions: legacyTx.instructions,
        recentBlockhash: legacyTx.recentBlockhash,
        addressLookupTableAccounts: [], // Assuming no LUTs for simple legacy Tx conversion
      })
    );
  }

  simResult = await connection.simulateTransaction(txToSimulate, simulateConfig);

  if (simResult.value.err || simResult.value.unitsConsumed == null) {
    // Failed to estimate CUs (error or unitsConsumed undefined)
    return 200000; // Default fallback
  }

  const rawUnitsConsumed = simResult.value.unitsConsumed;
  // Adjusted buffer logic: 20% buffer for main instructions + flat 300 CUs for budget instructions.
  const estimated = Math.ceil(rawUnitsConsumed * 1.20) + 300;

  return estimated;
}

// --- Internal Priority Fee Calculation ---
async function calculatePriorityFeeInternal(
  connection: Connection,
  transaction: VersionedTransaction | Transaction,
  computeUnitLimit: number, // This limit already includes buffer for budget instructions
  priorityLevel: 'low' | 'medium' | 'high'
): Promise<{ computeUnitPrice: number; priorityFeeMicroLamports: bigint }> {
  let computedPrice = 0; // Default to 0 microLamports
  const percentileMap = { low: 25, medium: 50, high: 75 };

  try {
    let accountsToQueryFees: PublicKey[] = [];

    // Get relevant accounts from the transaction message for fee querying
    const message = transaction instanceof VersionedTransaction ? transaction.message : (transaction as Transaction).compileMessage();
    const resolvedLuts = transaction instanceof VersionedTransaction
      ? await getLoadedAddressLookupTableAccounts(connection, transaction.message.addressTableLookups)
      : [];
    const accountKeys = message.getAccountKeys({ addressLookupTableAccounts: resolvedLuts });

    // Prioritize writable accounts that are NOT signers
    accountsToQueryFees = accountKeys.staticAccountKeys.filter((key, _i) => {
        const accountIndexInMessage = accountKeys.staticAccountKeys.findIndex(pk => pk.equals(key));
        return accountIndexInMessage !== -1 && !message.isAccountSigner(accountIndexInMessage) && message.isAccountWritable(accountIndexInMessage);
    });

    if (accountsToQueryFees.length === 0) { // Fallback: use all writable accounts
        accountsToQueryFees = accountKeys.staticAccountKeys.filter((key, _i) => {
            const accountIndexInMessage = accountKeys.staticAccountKeys.findIndex(pk => pk.equals(key));
            return accountIndexInMessage !== -1 && message.isAccountWritable(accountIndexInMessage);
        });
    }
    if (accountsToQueryFees.length === 0 && accountKeys.staticAccountKeys.length > 0) { // Fallback: use payer if no other writables
        accountsToQueryFees = [accountKeys.staticAccountKeys[0]];
    }
    // Include writable keys from LUTs, if any
    resolvedLuts.forEach(lut => {
        lut.state.addresses.forEach((address, lutAddressIndex) => {
            // Check if this LUT address is marked as writable
            const isWritableInLut = (transaction instanceof VersionedTransaction) && transaction.message.addressTableLookups.some(
                atl => atl.accountKey.equals(lut.key) && atl.writableIndexes.includes(lutAddressIndex)
            );
            if (isWritableInLut && !accountsToQueryFees.some(existing => existing.equals(address))) {
                accountsToQueryFees.push(address);
            }
        });
    });


    if (accountsToQueryFees.length > 0) {
      const recentFees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: accountsToQueryFees.slice(0, 128) }); // Max 128 accounts for query
      if (recentFees.length > 0) {
        const sortedFees = recentFees.map(r => r.prioritizationFee).sort((a, b) => a - b);
        const percentileIndex = Math.floor((sortedFees.length - 1) * (percentileMap[priorityLevel] / 100));
        computedPrice = sortedFees[Math.max(0, Math.min(percentileIndex, sortedFees.length - 1))];
      } else {
        // No recent prioritization fees returned, use default 0.
      }
    } else {
      // No relevant accounts found to query fees, use default 0.
    }
  } catch (e: any) {
    // Error getting priority fees, default price to 0.
  }

  // Priority fee is based on the entire compute unit limit for the transaction.
  const totalPriorityFeeMicroLamports = BigInt(computeUnitLimit) * BigInt(computedPrice);
  return { computeUnitPrice: computedPrice, priorityFeeMicroLamports: totalPriorityFeeMicroLamports };
}

// --- Exported: Estimate All Priority Fee Tiers ---
export async function estimateAllPriorityFeeTiers(
  connection: Connection,
  transaction: VersionedTransaction | Transaction,
  payerPublicKey: PublicKey,
  customComputeUnitLimit?: number
): Promise<AllPriorityFeeTiersResult> {
  let numSignatures: number;

  if (transaction instanceof VersionedTransaction) {
    numSignatures = transaction.message.header.numRequiredSignatures;
  } else { // Legacy Transaction
    const legacy = transaction as Transaction;
    if (!legacy.feePayer) legacy.feePayer = payerPublicKey;
    if (!legacy.recentBlockhash) legacy.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    numSignatures = legacy.compileMessage().header.numRequiredSignatures;
  }

  const baseFeeLamportsBigInt = BigInt(numSignatures) * BigInt(5000); // Standard base fee per signature
  // estimateComputeUnits returns a limit that already accounts for budget instructions.
  const cuLimitForTiers = customComputeUnitLimit ?? await estimateComputeUnits(connection, transaction, payerPublicKey);

  const result: Partial<AllPriorityFeeTiersResult> = {
    baseFeeLamports: baseFeeLamportsBigInt.toString(),
    estimatedComputeUnits: cuLimitForTiers,
  };

  for (const level of ['low', 'medium', 'high'] as const) {
    const { computeUnitPrice, priorityFeeMicroLamports } = await calculatePriorityFeeInternal(
      connection, transaction, cuLimitForTiers, level
    );
    const priorityFeeInLamportsBigInt = priorityFeeMicroLamports / BigInt(1_000_000); // Convert microLamports to Lamports
    const totalFeeInLamportsBigInt = baseFeeLamportsBigInt + priorityFeeInLamportsBigInt;

    result[level] = {
      computeUnitPrice,
      priorityFeeLamports: priorityFeeInLamportsBigInt.toString(),
      finalTotalFeeLamports: totalFeeInLamportsBigInt.toString(),
    };
  }
  return result as AllPriorityFeeTiersResult;
}

// --- Exported: Estimate Priority Fee (for a single level) ---
export async function estimatePriorityFee(
  connection: Connection,
  transaction: VersionedTransaction | Transaction,
  payerPublicKey: PublicKey,
  options: PriorityFeeOptions = {}
): Promise<PriorityFeeResult> {
  const { priorityLevel = 'medium', customComputeUnitLimit, customComputeUnitPrice } = options;
  let numSignatures: number;

  if (transaction instanceof VersionedTransaction) {
    numSignatures = transaction.message.header.numRequiredSignatures;
  } else { // Legacy Transaction
    const legacy = transaction as Transaction;
    if (!legacy.feePayer) legacy.feePayer = payerPublicKey;
    if (!legacy.recentBlockhash) legacy.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    numSignatures = legacy.compileMessage().header.numRequiredSignatures;
  }

  const baseFee = BigInt(numSignatures) * BigInt(5000);
  const cuLimitToUse = customComputeUnitLimit ?? await estimateComputeUnits(connection, transaction, payerPublicKey);
  let finalComputeUnitPrice: number; // in microLamports
  let finalPriorityFeeMicroLamports: bigint;

  if (typeof customComputeUnitPrice === 'number' && customComputeUnitPrice >= 0) {
    finalComputeUnitPrice = customComputeUnitPrice;
    finalPriorityFeeMicroLamports = BigInt(cuLimitToUse) * BigInt(finalComputeUnitPrice);
  } else {
    const { computeUnitPrice, priorityFeeMicroLamports } = await calculatePriorityFeeInternal(
      connection, transaction, cuLimitToUse, priorityLevel
    );
    finalComputeUnitPrice = computeUnitPrice;
    finalPriorityFeeMicroLamports = priorityFeeMicroLamports;
  }

  return {
    computeUnitLimit: cuLimitToUse,
    computeUnitPrice: finalComputeUnitPrice, // microLamports
    priorityFee: (finalPriorityFeeMicroLamports / BigInt(1_000_000)).toString(), // Lamports
    baseFee: baseFee.toString(), // Lamports
  };
}

// --- Exported: Add Priority Fee Instructions to Transaction ---
export async function addPriorityFeeInstructions(
  connection: Connection,
  transaction: VersionedTransaction | Transaction,
  computeUnitLimit: number,
  computeUnitPrice: number // This is in microLamports
): Promise<Transaction | VersionedTransaction> {

  const newComputeBudgetInstructions: TransactionInstruction[] = [];
  if (computeUnitLimit > 0) {
    newComputeBudgetInstructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }));
  }
  if (computeUnitPrice > 0) {
    newComputeBudgetInstructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }));
  }

  if (newComputeBudgetInstructions.length === 0) {
    return transaction; // No changes needed
  }

  if (transaction instanceof VersionedTransaction) {
    const originalMessage = transaction.message;
    const loadedLuts: AddressLookupTableAccount[] = await getLoadedAddressLookupTableAccounts(connection, originalMessage.addressTableLookups);
    const resolvedAccountKeys = originalMessage.getAccountKeys({ addressLookupTableAccounts: loadedLuts });

    // Decompile original instructions to prepend new ones
    const decompiledOriginalInstructions = originalMessage.compiledInstructions.map(
      (compiledInstruction) => {
        const programId = resolvedAccountKeys.get(compiledInstruction.programIdIndex)!;
        const accountsMeta: AccountMeta[] = compiledInstruction.accountKeyIndexes.map((accountKeyIndex) => ({
          pubkey: resolvedAccountKeys.get(accountKeyIndex)!,
          isSigner: originalMessage.isAccountSigner(accountKeyIndex),
          isWritable: originalMessage.isAccountWritable(accountKeyIndex),
        }));
        return new TransactionInstruction({
          keys: accountsMeta,
          programId: programId,
          data: Buffer.from(compiledInstruction.data),
        });
      }
    );

    const allInstructions = [...newComputeBudgetInstructions, ...decompiledOriginalInstructions];
    const feePayer = resolvedAccountKeys.get(0); // First account is payer
    if (!feePayer) {
      throw new Error('Fee payer could not be determined for VersionedTransaction message recompilation.');
    }
    const recentBlockhash = originalMessage.recentBlockhash || (await connection.getLatestBlockhash('confirmed')).blockhash;

    const newMessage = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: recentBlockhash,
      instructions: allInstructions,
    }).compileToV0Message(loadedLuts); // Pass loaded LUTs for recompilation

    return new VersionedTransaction(newMessage, transaction.signatures); // Preserve original signatures if any

  } else { // Legacy Transaction
    const legacyTx = transaction as Transaction;
    if (!legacyTx.feePayer) {
      throw new Error('Legacy transaction is missing a feePayer to add priority fee instructions.');
    }
    if (!legacyTx.recentBlockhash) {
      legacyTx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    }
    // Prepend new instructions to existing ones
    legacyTx.instructions.unshift(...newComputeBudgetInstructions);
    return legacyTx;
  }
}