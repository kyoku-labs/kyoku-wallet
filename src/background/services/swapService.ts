// src/background/services/swapService.ts

import {
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  Connection,

  MessageV0,
  Transaction,
  type TransactionInstruction,
  type AccountMeta,
  AddressLookupTableAccount,
  VersionedMessage
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import {
  getUserPriorityFeeLevelSetting,
  PriorityFeeLevel,
  getConnection
} from '../shared/state';
import { getLoadedAddressLookupTableAccounts } from '../shared/simulationParser';

// --- Constants ---
const OUR_PLATFORM_FEE_BPS = 10; // 0.1%
const OUR_FEE_COLLECTION_ACCOUNT_PUBKEY =
  import.meta.env.VITE_KYOKU_FEE_ACCOUNT_PUBKEY;

const JUPITER_QUOTE_API_URL = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API_URL = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/strict';

// --- Typings and Interfaces ---
export interface JupiterMarketInfo {
  id: string; // Fixed typo: 'Nord' -> 'id'
  label: string;
  inputMint: string;
  outputMint: string;
  notEnoughLiquidity: boolean;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  lpFee: { amount: string; mint: string; pct: number };
  platformFee: { amount: string; mint: string; pct: number };
}

export interface JupiterRoutePlanStep {
  swapInfo: JupiterMarketInfo;
  percent: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: { amount: string; feeMint?: string; feeBps?: number } | null;
  priceImpactPct: string;
  routePlan: JupiterRoutePlanStep[];
  contextSlot: number;
  timeTaken: number;
  marketInfos: JupiterMarketInfo[];
  feeAmount?: string;
  feeMint?: string;
}

export interface GetSwapQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}

export interface QuoteDetailsForUI {
  originalQuoteResponse: JupiterQuoteResponse;
  ourCalculatedFeeAmountLamports: string;
  ourFeeMint: string;
  displayOutAmountNetUser: string;
  grossAmountBeforeOurFee?: string;
}

export interface JupiterSwapResponse {
  swapTransaction: string; // base64 encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
}

export interface GetSwapTransactionParams {
  userPublicKey: string;
  originalQuoteResponse: JupiterQuoteResponse;
  priorityFeeLevelOverride?: PriorityFeeLevel;
  maxLamportsForPriorityFee?: number;
}

// Token List Cache
let jupiterTokenListCache: any[] | null = null;
let lastTokenListFetchTimestamp = 0;
const TOKEN_LIST_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Functions ---
export async function getJupiterTokenList(): Promise<any[]> {
  const now = Date.now();
  if (
    jupiterTokenListCache &&
    now - lastTokenListFetchTimestamp < TOKEN_LIST_CACHE_DURATION_MS
  ) {
    return jupiterTokenListCache;
  }
  try {
    const res = await fetch(JUPITER_TOKEN_LIST_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch token list: ${res.status}`);
    }
    const list = await res.json();
    jupiterTokenListCache = list;
    lastTokenListFetchTimestamp = now;
    return list;
  } catch (err) {
    // Return cached list if available, otherwise empty array on error
    return jupiterTokenListCache || [];
  }
}

export async function getSwapQuote(
  params: GetSwapQuoteParams
): Promise<QuoteDetailsForUI> {
  const { inputMint, outputMint, amount, slippageBps } = params;

  const query = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
    platformFeeBps: OUR_PLATFORM_FEE_BPS.toString()
  });
  const res = await fetch(`${JUPITER_QUOTE_API_URL}?${query.toString()}`);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Jupiter /quote error ${res.status}: ${errText}`);
  }
  const quote: JupiterQuoteResponse = await res.json();

  // Calculate our platform fee based on the gross output amount
  const platformFeeFromQuote = quote.platformFee;
  let ourCalculatedFeeLamports = BigInt(0);
  if (platformFeeFromQuote?.amount) {
    ourCalculatedFeeLamports = BigInt(platformFeeFromQuote.amount);
  }
  const grossOutputAmount = BigInt(quote.outAmount);
  const netUserOutputAmount = grossOutputAmount - ourCalculatedFeeLamports;

  return {
    originalQuoteResponse: quote,
    ourCalculatedFeeAmountLamports: ourCalculatedFeeLamports.toString(),
    ourFeeMint: outputMint,
    displayOutAmountNetUser: netUserOutputAmount.toString(),
    grossAmountBeforeOurFee: grossOutputAmount.toString()
  };
}

export async function getSwapTransaction(
  params: GetSwapTransactionParams
): Promise<JupiterSwapResponse> {
  const {
    userPublicKey,
    originalQuoteResponse,
    priorityFeeLevelOverride,
    maxLamportsForPriorityFee
  } = params;

  // Validate fee collection account
  if (!OUR_FEE_COLLECTION_ACCOUNT_PUBKEY) {
    throw new Error('Platform fee account public key (VITE_KYOKU_FEE_ACCOUNT_PUBKEY) is not configured.');
  }
  let feeWalletPublicKey: PublicKey;
  try {
    feeWalletPublicKey = new PublicKey(OUR_FEE_COLLECTION_ACCOUNT_PUBKEY);
  } catch {
    throw new Error('Invalid platform fee account public key configured.');
  }

  const connection: Connection | null = await getConnection();
  if (!connection) throw new Error('Could not establish Solana connection.');

  // Derive Associated Token Account (ATA) for the fee on the output mint
  const outputMintPk = new PublicKey(originalQuoteResponse.outputMint);
  const feeReceiverAta = await getAssociatedTokenAddress(outputMintPk, feeWalletPublicKey, true);

  // Determine effective priority fee settings
  const userGlobalFeeSetting = await getUserPriorityFeeLevelSetting();
  const effectivePriority = priorityFeeLevelOverride ?? userGlobalFeeSetting;

  // --- Corrected Prioritization Fee Payload Logic ---
  let finalPrioritizationFeePayload: string | object | undefined = undefined;

  if (effectivePriority === 'auto') {
    if (maxLamportsForPriorityFee && maxLamportsForPriorityFee > 0) {
      finalPrioritizationFeePayload = { auto: { maxLamports: maxLamportsForPriorityFee } };
    } else {
      finalPrioritizationFeePayload = 'auto';
    }
  } else if (effectivePriority === 'low' || effectivePriority === 'medium' || effectivePriority === 'high') {
    if (maxLamportsForPriorityFee && maxLamportsForPriorityFee > 0) {
      finalPrioritizationFeePayload = maxLamportsForPriorityFee.toString();
    } else {
      finalPrioritizationFeePayload = 'auto';
     // console.warn(
      //  `[SwapService] Priority level '${effectivePriority}' provided without maxLamports. Defaulting prioritizationFeeLamports to 'auto'. Consider setting computeUnitPriceMicroLamports for specific levels.`
     // );
    }
  }
  if (finalPrioritizationFeePayload === undefined) {
    finalPrioritizationFeePayload = 'auto';
  }

  // Construct payload for Jupiter /swap endpoint
  const swapPayload: any = {
    quoteResponse: originalQuoteResponse,
    userPublicKey,
    feeAccount: feeReceiverAta.toBase58(),
    wrapAndUnwrapSol: true,
    useSharedAccounts: true,
    dynamicComputeUnitLimit: true
  };

  // Conditionally add prioritizationFeeLamports to the payload
  if (finalPrioritizationFeePayload !== undefined) {
    swapPayload.prioritizationFeeLamports = finalPrioritizationFeePayload;
  }

  // --- Logging Block ---
 // console.log('[SwapService] Payload for /v6/swap API:');
  //try {
  //  console.log(JSON.stringify(swapPayload, null, 2));
 // } catch (e: any) {
  //  console.error('[SwapService] ERROR serializing swapPayload for logging:', e.message);
  // console.log('[SwapService] Raw swapPayload object (may contain BigInts):', swapPayload);
  //}

  // Call Jupiter /swap endpoint
  const res = await fetch(JUPITER_SWAP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(swapPayload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    let errorDetail = errorText;
    try {
      const parsedError = JSON.parse(errorText);
      errorDetail = parsedError.error?.message || parsedError.message || parsedError.error || errorText;
    } catch {}
    //console.error(`[SwapService] Jupiter /swap API error ${res.status}:`, errorDetail);
    throw new Error(`Jupiter /swap API error ${res.status}: ${errorDetail}`);
  }
  const swapResponse: JupiterSwapResponse = await res.json();

  // Reconstruct transaction to add create ATA instruction for our fee account if needed
  const rawTransactionBuffer = Buffer.from(swapResponse.swapTransaction, 'base64');
  const versionedTransaction = VersionedTransaction.deserialize(rawTransactionBuffer);
  const originalMessage: VersionedMessage = versionedTransaction.message;
  let loadedLuts: AddressLookupTableAccount[] = [];

  // Handle Address Lookup Tables based on message version
  if (originalMessage.version === 0) {
    const messageV0 = originalMessage as MessageV0;
    if (messageV0.addressTableLookups && messageV0.addressTableLookups.length > 0) {
      loadedLuts = await getLoadedAddressLookupTableAccounts(connection, messageV0.addressTableLookups);
    }
  } else {
    // Legacy message (Message) does not have addressTableLookups
    loadedLuts = [];
  }

  const accountKeys = originalMessage.getAccountKeys({ addressLookupTableAccounts: loadedLuts });
  const decompiledInstructions = originalMessage.compiledInstructions.map((ix: any) => {
    const programIdAccount = accountKeys.get(ix.programIdIndex);
    if (!programIdAccount) throw new Error('Program ID not found during decompilation');
    const accountsMeta: AccountMeta[] = ix.accountKeyIndexes.map((keyIndex: number) => {
      const key = accountKeys.get(keyIndex);
      if (!key) throw new Error(`Account key not found at index ${keyIndex} during decompilation`);
      return {
        pubkey: key,
        isSigner: originalMessage.isAccountSigner(keyIndex),
        isWritable: originalMessage.isAccountWritable(keyIndex)
      };
    });
    return { programId: programIdAccount, keys: accountsMeta, data: Buffer.from(ix.data) } as TransactionInstruction;
  });

  const feeReceiverAtaForFinalCheck = await getAssociatedTokenAddress(outputMintPk, feeWalletPublicKey, true);
  const feeReceiverAtaInfo = await connection.getAccountInfo(feeReceiverAtaForFinalCheck);
  let finalInstructions = decompiledInstructions;

  if (!feeReceiverAtaInfo) {
    const payerPublicKeyForAta = new PublicKey(userPublicKey);
    const createAtaInstruction = createAssociatedTokenAccountInstruction(
      payerPublicKeyForAta,
      feeReceiverAtaForFinalCheck,
      feeWalletPublicKey,
      outputMintPk
    );
    finalInstructions = [createAtaInstruction, ...decompiledInstructions];

    const payerKeyFromMessage = accountKeys.get(0);
    if (!payerKeyFromMessage) throw new Error('Payer key not found in transaction message for recompilation.');

    let recompiledMessage: VersionedMessage;
    if (originalMessage.version === 0) {
      recompiledMessage = new TransactionMessage({
        payerKey: payerKeyFromMessage,
        recentBlockhash: originalMessage.recentBlockhash,
        instructions: finalInstructions
      }).compileToV0Message(loadedLuts.length > 0 ? loadedLuts : undefined);
    } else {
      const legacyTx = new Transaction({ recentBlockhash: originalMessage.recentBlockhash, feePayer: payerKeyFromMessage });
      legacyTx.add(...finalInstructions);
      recompiledMessage = legacyTx.compileMessage();
    }
    const newVersionedTransaction = new VersionedTransaction(recompiledMessage);
    swapResponse.swapTransaction = Buffer.from(newVersionedTransaction.serialize()).toString('base64');
  }

  return swapResponse;
}