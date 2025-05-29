// src/background/shared/simulationParser.ts
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  TokenAmount as Web3TokenAmount,
  LAMPORTS_PER_SOL,
  AddressLookupTableAccount,
  MessageV0,
  Message as LegacyMessage,
  MessageAddressTableLookup,
  SimulateTransactionConfig,
  ParsedAccountData,
} from '@solana/web3.js';

import { TokenListProvider, TokenInfo as SPLTokenInfo } from '@solana/spl-token-registry';
import { getConnection } from './state';
import {
    estimateAllPriorityFeeTiers,
    type AllPriorityFeeTiersResult,
    type PriorityFeeTier
} from './priorityFeeHandlers';


type SimTx = (
  tx: VersionedTransaction | Transaction,
  config: SimulateTransactionConfig
) => Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;

export interface SimulatedAssetChange {
  mintAddress: string;
  ownerAddress: string;
  tokenAccountAddress?: string;
  uiAmountChange: string;
  rawAmountChange: string;
  symbol?: string;
  name?: string;
  logoUri?: string;
  decimals: number;
  isNFT?: boolean;
  preUiAmount?: string;
  postUiAmount?: string;
}

export interface AccountStateChange {
  accountAddress: string;
  preBalanceLamports?: string;
  postBalanceLamports?: string;
  changeType: 'dataModified' | 'authorityChanged' | 'accountClosed' | 'rentPayment' | 'other' | 'balanceChangeOnly';
  description: string;
  isPotentiallyMalicious?: boolean;
}

export interface SimulationAlert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface DetailedTransactionPreview {
  simulationSuccess: boolean;
  simulationError?: string;
  baseFeeLamports?: string;
  priorityFeeLamports?: string;
  totalEstimatedFeeLamports?: string;
  initialComputeUnitLimit?: number;
  initialComputeUnitPrice?: number;
  computeUnitsConsumed?: number;
  feePayerAddress: string; // This is YOUR wallet's active account (for whom changes are primary)
  feePayerAssetChanges: SimulatedAssetChange[];
  otherAccountAssetChanges: SimulatedAssetChange[];
  alerts: SimulationAlert[];
  summaryMessage?: string;
  rawSimulationResponse?: RpcResponseAndContext<SimulatedTransactionResponse>;
  accountStateChanges?: AccountStateChange[];
  priorityFeeTiers?: {
    low: PriorityFeeTier;
    medium: PriorityFeeTier;
    high: PriorityFeeTier;
    estimatedComputeUnitsForTiers: number;
  };
}

interface DecodedSimulatedTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: Web3TokenAmount;
}

function parseSplTokenAccountData(data: string): { mint: string; owner: string; amount: string; decimals: number } | null {
  try {
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length < 72) {
      // Potentially invalid SPL token account data length
    }
    const mint = new PublicKey(buffer.slice(0, 32)).toBase58();
    const owner = new PublicKey(buffer.slice(32, 64)).toBase58();
    const amount = buffer.readBigUInt64LE(64).toString();
    const decimals = 0; // Decimals are not part of token account data, must be fetched from mint.
    return { mint, owner, amount, decimals };
  } catch (err) {
    return null;
  }
}

let tokenInfoMap: Map<string, SPLTokenInfo> | null = null;
let tokenInfoMapCluster: string | null = null;

async function getTokenRegistryMap(
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' | 'custom'
): Promise<Map<string, SPLTokenInfo>> {
  const registryCluster = cluster === 'custom' ? 'mainnet-beta' : cluster;
  if (tokenInfoMap && tokenInfoMapCluster === registryCluster) {
    return tokenInfoMap;
  }
  try {
    const provider = new TokenListProvider();
    const container = await provider.resolve();
    type ValidSlug = 'mainnet-beta' | 'devnet' | 'testnet';
    const list = container.filterByClusterSlug(registryCluster as ValidSlug).getList();
    tokenInfoMap = list.reduce((m, item) => m.set(item.address, item), new Map());
    tokenInfoMapCluster = registryCluster;
  } catch (err) {
    tokenInfoMap = new Map();
  }
  return tokenInfoMap!;
}

const MAX_U64_BIGINT = 2n ** 64n - 1n;

export async function getLoadedAddressLookupTableAccounts(
  conn: Connection,
  lookups: readonly MessageAddressTableLookup[] | undefined
): Promise<AddressLookupTableAccount[]> {
  if (!lookups?.length) {
    return [];
  }
  const promises = lookups.map(lookup =>
    conn.getAddressLookupTable(lookup.accountKey)
      .then(res => {
        if (res?.value) {
          const isActive = res.value.state.deactivationSlot === MAX_U64_BIGINT;
          if (!isActive) {
         //   console.warn(`[SimParser] LUT ${lookup.accountKey.toBase58()} is deactivated.`);
          }
          return res.value;
        }
       // console.warn(`[SimParser] LUT not found or value is null: ${lookup.accountKey.toBase58()}`);
        return null;
      })
      .catch(_e => {
       // console.error(`[SimParser] Failed to load LUT ${lookup.accountKey.toBase58()}:`, e);
        return null;
      })
  );
  const all = await Promise.all(promises);
  const loadedAccounts = all.filter((x): x is AddressLookupTableAccount => x !== null);
  if (loadedAccounts.length !== lookups.length) {
   // console.warn("[SimParser] Not all LUTs were loaded successfully. This might cause simulation issues if transaction uses unloaded LUTs.");
  }
  return loadedAccounts;
}

const METAPLEX_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function hasMetaplexMetadata(
  connection: Connection,
  mint: PublicKey
): Promise<boolean> {
  try {
    const [metadataPda] = await PublicKey.findProgramAddress(
      [Buffer.from('metadata'), METAPLEX_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      METAPLEX_METADATA_PROGRAM_ID
    );
    const accountInfo = await connection.getAccountInfo(metadataPda);
    return !!accountInfo && accountInfo.owner.equals(METAPLEX_METADATA_PROGRAM_ID);
  } catch (err) {
    return false;
  }
}

async function getTokenDecimals(connection: Connection, mint: PublicKey): Promise<number> {
  try {
    const mintAccount = await connection.getParsedAccountInfo(mint);
    if (mintAccount.value && 'parsed' in mintAccount.value.data) {
      const parsedData = mintAccount.value.data as ParsedAccountData;
      return parsedData.parsed?.info?.decimals ?? 0;
    }
    return 0;
  } catch (err) {
    return 0;
  }
}

export async function simulateAndParseTransaction(
  transactionBytes: Uint8Array,
  yourWalletAddressString: string, 
  network: 'mainnet-beta' | 'devnet' | 'testnet' | 'custom'
): Promise<DetailedTransactionPreview> {
  const connection = await getConnection();

  const makeErrorResult = (msg: string, critical = true): DetailedTransactionPreview => {
    return {
      simulationSuccess: false,
      simulationError: msg,
      baseFeeLamports: "0",
      priorityFeeLamports: "0",
      totalEstimatedFeeLamports: "0",
      initialComputeUnitLimit: 0,
      initialComputeUnitPrice: 0,
      feePayerAddress: yourWalletAddressString,
      feePayerAssetChanges: [],
      otherAccountAssetChanges: [],
      alerts: critical ? [{ severity: 'critical', message: msg }] : [],
    };
  };

  if (!connection) {
    return makeErrorResult("Failed to establish Solana connection.");
  }

  let transactionToSimulate: VersionedTransaction | Transaction;
  let actualMessage: MessageV0 | LegacyMessage;
  let loadedLutsForSim: AddressLookupTableAccount[] = [];

  try {
    try {
      transactionToSimulate = VersionedTransaction.deserialize(transactionBytes);
      actualMessage = transactionToSimulate.message;
      if (actualMessage.addressTableLookups && actualMessage.addressTableLookups.length > 0) {
        loadedLutsForSim = await getLoadedAddressLookupTableAccounts(connection, actualMessage.addressTableLookups);
      }
    } catch {
      transactionToSimulate = Transaction.from(transactionBytes);
      const tempFeePayer = new PublicKey(yourWalletAddressString); 
      if (!transactionToSimulate.feePayer) {
        transactionToSimulate.feePayer = tempFeePayer;
      }
      if (!transactionToSimulate.recentBlockhash) {
        transactionToSimulate.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
      }
      actualMessage = transactionToSimulate.compileMessage();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return makeErrorResult(`Failed to deserialize transaction: ${msg}`);
  }

  const resolvedKeys = actualMessage.getAccountKeys({ addressLookupTableAccounts: loadedLutsForSim });
  let allKeysForSimConfig: PublicKey[] = [...resolvedKeys.staticAccountKeys];
  if (resolvedKeys.accountKeysFromLookups) {
    allKeysForSimConfig.push(...resolvedKeys.accountKeysFromLookups.writable);
    allKeysForSimConfig.push(...resolvedKeys.accountKeysFromLookups.readonly);
  }
  const uniqueAccountKeysForSim = Array.from(new Set(allKeysForSimConfig.map(k => k.toBase58()))).map(addr => new PublicKey(addr));

  const preview: DetailedTransactionPreview = {
    simulationSuccess: false,
    feePayerAddress: yourWalletAddressString,
    feePayerAssetChanges: [],
    otherAccountAssetChanges: [],
    alerts: [],
  };

  // --- Fetch Pre-Simulation Balances for ALL involved accounts ---
  const preBalancesLamports = new Map<string, bigint>();
  if (uniqueAccountKeysForSim.length > 0) {
    try {
      const accountsInfo = await connection.getMultipleAccountsInfo(uniqueAccountKeysForSim);
      accountsInfo.forEach((info, index) => {
        preBalancesLamports.set(uniqueAccountKeysForSim[index].toBase58(), BigInt(info?.lamports ?? 0));
      });
    } catch (e) {
     // console.warn("[SimParser] Failed to fetch some pre-balances:", e);
      // For accounts where pre-balance fetch failed, they will default to 0n later
    }
  }
  
  // --- Fee Estimation ---
  try {
    const actualTxFeePayerPk = actualMessage.staticAccountKeys[0];
    if (!actualTxFeePayerPk) throw new Error("Transaction message has no fee payer for estimation.");
    const feeEstimates: AllPriorityFeeTiersResult = await estimateAllPriorityFeeTiers(
        connection,
        transactionToSimulate,
        actualTxFeePayerPk,
        undefined
    );
    preview.baseFeeLamports = feeEstimates.baseFeeLamports;
    preview.priorityFeeTiers = { low: feeEstimates.low, medium: feeEstimates.medium, high: feeEstimates.high, estimatedComputeUnitsForTiers: feeEstimates.estimatedComputeUnits };
    preview.initialComputeUnitLimit = feeEstimates.estimatedComputeUnits;
    preview.initialComputeUnitPrice = feeEstimates.medium.computeUnitPrice; // Default to medium
    preview.priorityFeeLamports = feeEstimates.medium.priorityFeeLamports;
    preview.totalEstimatedFeeLamports = feeEstimates.medium.finalTotalFeeLamports;
  } catch (feeError: any) {
      preview.alerts.push({ severity: 'warning', message: 'Could not estimate priority fees. Transaction may use base fee only if approved.' });
      const numSigs = actualMessage.header.numRequiredSignatures;
      preview.baseFeeLamports = (BigInt(numSigs) * BigInt(5000)).toString();
      preview.priorityFeeLamports = "0";
      preview.totalEstimatedFeeLamports = preview.baseFeeLamports;
      preview.initialComputeUnitLimit = 200000;
      preview.initialComputeUnitPrice = 0;
  }

  // --- Main Simulation ---
  try {
    const simulateConfig: SimulateTransactionConfig = {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'confirmed',
      accounts: {
        encoding: 'base64',
        addresses: uniqueAccountKeysForSim.map(pk => pk.toBase58()),
      },
    };

    const simulateAny = (connection.simulateTransaction as unknown as SimTx).bind(connection);
    const simulationResult = await simulateAny(transactionToSimulate, simulateConfig);
    preview.rawSimulationResponse = simulationResult;

    if (simulationResult.value.err) {
      preview.simulationSuccess = false;
      const errVal = simulationResult.value.err;
      const errStr = typeof errVal === 'string' ? errVal : JSON.stringify(errVal);
      preview.simulationError = parseSimulationErrorLogs(simulationResult.value.logs) || errStr;
      preview.alerts.push({ severity: 'critical', message: `Transaction simulation failed: ${preview.simulationError.substring(0, 150)}...`});
      return preview;
    }

    preview.simulationSuccess = true;
    preview.computeUnitsConsumed = simulationResult.value.unitsConsumed ?? 0;

    const postAccountsSimData = simulationResult.value.accounts ?? [];
    const solChanges: SimulatedAssetChange[] = [];

    // Calculate SOL Changes using Pre/Post Balances
    uniqueAccountKeysForSim.forEach((accountPk) => {
      const addressStr = accountPk.toBase58();
      const preBalance = preBalancesLamports.get(addressStr) ?? 0n;
      const postAccountInfo = postAccountsSimData.find((_acc, idx) => uniqueAccountKeysForSim[idx].equals(accountPk));
      const postBalance = BigInt(postAccountInfo?.lamports ?? preBalance); // Use preBalance if post not found (shouldn't happen for simulated accounts)
      
      const change = postBalance - preBalance;

      if (change !== 0n) {
       // console.log(`[SimParser SOL Change] Account: ${addressStr}, Pre: ${preBalance.toString()}, Post: ${postBalance.toString()}, Change: ${change.toString()}`);
        solChanges.push({
          mintAddress: 'SOL',
          ownerAddress: addressStr,
          uiAmountChange: (Number(change) / LAMPORTS_PER_SOL).toFixed(9),
          rawAmountChange: change.toString(),
          symbol: 'SOL', name: 'Solana', decimals: 9, isNFT: false,
          preUiAmount: (Number(preBalance) / LAMPORTS_PER_SOL).toFixed(9),
          postUiAmount: (Number(postBalance) / LAMPORTS_PER_SOL).toFixed(9),
        });
      }
    });
    
    // Token Change Parsing (largely existing logic, ensure preTokenBalances are accurate)
    const postTokenBalances = new Map<string, DecodedSimulatedTokenBalance>();
    await Promise.all(postAccountsSimData.map(async (accData, index) => {
        const accountAddressPk = uniqueAccountKeysForSim[index];
        if (!accData || !accountAddressPk) return;
        const accountAddressStr = accountAddressPk.toBase58();
        if (Array.isArray(accData.data) && accData.data[1] === 'base64') {
            const parsedRaw = parseSplTokenAccountData(accData.data[0]);
            if (parsedRaw) {
                const tokenMeta = await getTokenRegistryMap(network);
                const decimals = tokenMeta.get(parsedRaw.mint)?.decimals ?? await getTokenDecimals(connection, new PublicKey(parsedRaw.mint));
                const amountBigInt = BigInt(parsedRaw.amount);
                const uiAmount = Number(amountBigInt) / (10 ** decimals);
                postTokenBalances.set(accountAddressStr, {
                    accountIndex: index, mint: parsedRaw.mint, owner: parsedRaw.owner, programId: TOKEN_PROGRAM_ID.toBase58(),
                    uiTokenAmount: { amount: parsedRaw.amount, decimals, uiAmount: uiAmount, uiAmountString: uiAmount.toFixed(decimals) }
                });
            }
        }
    }));

    const preTokenBalances = new Map<string, DecodedSimulatedTokenBalance>();
    await Promise.all(uniqueAccountKeysForSim.map(async (accPk, index) => {
        const accAddressStr = accPk.toBase58();
        try {
            // Note: This fetches current on-chain state, which is "pre" relative to simulation IF simulation starts from current state.
            // If simulation uses a specific slot, these pre-balances might not perfectly align with the simulation's internal starting point.
            // For most dApp transactions, this is acceptable.
            const accountInfo = await connection.getParsedAccountInfo(accPk);
            if (accountInfo.value && 'parsed' in accountInfo.value.data) {
                const parsedData = accountInfo.value.data as ParsedAccountData;
                const info = parsedData.parsed?.info;
                if (info && info.mint && info.owner && info.tokenAmount && info.tokenAmount.uiAmount !== null) {
                    preTokenBalances.set(accAddressStr, {
                        accountIndex: index, mint: info.mint, owner: info.owner, programId: TOKEN_PROGRAM_ID.toBase58(),
                        uiTokenAmount: info.tokenAmount as Web3TokenAmount,
                    });
                }
            }
        } catch (e) { /* Failed to get parsed account info for pre-balance */ }
    }));

    const tokenChanges: SimulatedAssetChange[] = [];
    const registry = await getTokenRegistryMap(network);
    const allInvolvedTokenAccounts = new Set([...preTokenBalances.keys(), ...postTokenBalances.keys()]);

    for (const tokenAccountAddress of allInvolvedTokenAccounts) {
        const pre = preTokenBalances.get(tokenAccountAddress);
        const post = postTokenBalances.get(tokenAccountAddress);
        const mintAddress = pre?.mint || post?.mint;
        const ownerAddressForToken = pre?.owner || post?.owner;
        const decimals = pre?.uiTokenAmount.decimals ?? post?.uiTokenAmount.decimals ?? 0;

        if (!mintAddress || !ownerAddressForToken) continue;

       // console.log(`[SimParser TokenChange] Account: ${tokenAccountAddress}, Mint: ${mintAddress}, Owner: ${ownerAddressForToken}`);
      //  console.log(`  PreAmt: ${pre?.uiTokenAmount.amount}, PostAmt: ${post?.uiTokenAmount.amount}`);

        const beforeAmount = BigInt(pre?.uiTokenAmount.amount ?? '0');
        const afterAmount = BigInt(post?.uiTokenAmount.amount ?? '0');
        const diff = afterAmount - beforeAmount;
        // console.log(`  Diff: ${diff.toString()}`);

        if (diff !== 0n) {
            const meta = registry.get(mintAddress);
            const isMetaNFT = meta ? (meta.tags || []).includes('nft') || meta.decimals === 0 : false;
            const hasMPMetadata = await hasMetaplexMetadata(connection, new PublicKey(mintAddress));
            const isNFT = isMetaNFT || hasMPMetadata || (decimals === 0 && (diff === 1n || diff === -1n));
        //    console.log(`  For Mint ${mintAddress}: meta?.decimals=${meta?.decimals}, isMetaNFT=${isMetaNFT}, hasMPMetadata=${hasMPMetadata}, parsedDecimals=${decimals}, final isNFT=${isNFT}`);

            const preUiAmountStr = pre ? (Number(pre.uiTokenAmount.amount) / (10**decimals)).toFixed(decimals) : "0";
            const postUiAmountStr = post ? (Number(post.uiTokenAmount.amount) / (10**decimals)).toFixed(decimals) : "0";

            const changeObject: SimulatedAssetChange = {
              mintAddress, ownerAddress: ownerAddressForToken, tokenAccountAddress,
              uiAmountChange: (Number(diff) / (10 ** decimals)).toFixed(decimals),
              rawAmountChange: diff.toString(),
              symbol: meta?.symbol || (isNFT ? 'NFT' : 'Token'),
              name: meta?.name || (isNFT ? `NFT (${mintAddress.slice(0,4)}...)` : `Unknown Token (${mintAddress.slice(0,4)}...)`),
              logoUri: meta?.logoURI, decimals, isNFT,
              preUiAmount: preUiAmountStr, postUiAmount: postUiAmountStr,
            };
            tokenChanges.push(changeObject);
        //    console.log(`[SimParser TokenChange] Pushed asset change for Mint ${mintAddress}:`, JSON.stringify(changeObject));
        }
    }

    preview.feePayerAssetChanges = [...solChanges, ...tokenChanges].filter(c => c.ownerAddress === yourWalletAddressString);
    preview.otherAccountAssetChanges = [...solChanges, ...tokenChanges].filter(c => c.ownerAddress !== yourWalletAddressString);

    const yourWalletSolChangeEntry = solChanges.find(c => c.ownerAddress === yourWalletAddressString);
    const actualTxFeePayerString = actualMessage.staticAccountKeys[0].toBase58();

    if (yourWalletSolChangeEntry) {
      preview.summaryMessage = `Net SOL change for you: ${yourWalletSolChangeEntry.uiAmountChange} SOL.`;
    } else {
      preview.summaryMessage = `No direct SOL balance changes for your account (${yourWalletAddressString.substring(0,6)}...).`;
    }
    // Informational: overall transaction fee and who paid it.
    const estTotalFeeNum = Number(preview.totalEstimatedFeeLamports || "0");
    if (estTotalFeeNum > 0) {
        preview.summaryMessage += ` Est. total tx fee: ${(estTotalFeeNum / LAMPORTS_PER_SOL).toFixed(9)} SOL (paid by ${actualTxFeePayerString === yourWalletAddressString ? "you" : actualTxFeePayerString.substring(0,6) + "..."}).`;
    }


    if (simulationResult.value.logs?.some(l => l.toLowerCase().includes('set authority') || l.toLowerCase().includes('update authority'))) {
      preview.alerts.push({ severity: 'warning', message: 'This transaction may change account authorities. Review carefully.' });
    }

    return preview;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    preview.simulationSuccess = false;
    preview.simulationError = msg;
    preview.alerts.push({ severity: 'critical', message: `Simulation analysis failed: ${msg.substring(0,150)}...` });
    return preview;
  }
}

function parseSimulationErrorLogs(logs: string[] | null): string | null {
  if (!logs) return null;
  const knownErrors: Record<string, string> = {
    "insufficient lamports": "Insufficient SOL for transaction fees or rent.",
    "custom program error: 0x1": "Operation failed: Often due to insufficient funds (tokens) or a program-specific constraint.", // NOSONAR
    "program failed to complete": "A smart contract instruction failed during execution.",
    "account in use": "An account required by the transaction is already being processed or is locked.",
    "blockhash not found": "The transaction's blockhash is too old or invalid. Please try again.",
    "instruction_error": "Generic instruction error."
  };
  const errorPatterns = [
    /Error: Insufficient funds/i, /Error: NotEnoughBalance/i,
    /Program \w+ failed: custom program error: (0x[0-9a-fA-F]+)/i,
    /Program \w+ failed: (.*)/i,
    /failed to debit/i,
    /panic: index out of range/i,
    /slice of len \d+ (?:but|and) index \d+ (?:is|was) out of bounds/i,
  ];

  for (const log of logs.slice().reverse()) {
    const lowerLog = log.toLowerCase();
    for (const key in knownErrors) {
      if (lowerLog.includes(key)) {
        return knownErrors[key];
      }
    }
    for (const pattern of errorPatterns) {
        const match = log.match(pattern);
        if (match) {
            let detailedError = match[0];
            if (match[1] && pattern.source.includes('(0x[0-9a-fA-F]+)')) detailedError = `Program error code ${match[1]}`;
            else if (match[1] && pattern.source.includes('(.*)')) detailedError = `Program failed: ${match[1]}`;
            else if (pattern.source.includes('index out of range') || pattern.source.includes('slice of len')) detailedError = "Program error: Account data access issue (index out of range).";

            return detailedError.length > 200 ? detailedError.substring(0, 200) + "..." : detailedError;
        }
    }
    if (lowerLog.includes("sbf program panicked") || lowerLog.includes("program panicked")) {
        const panicSourceMatch = log.match(/panicked at '([^']*)', (.*):(\d+):(\d+)/);
        if (panicSourceMatch) {
            const reason = panicSourceMatch[1];
            const file = panicSourceMatch[2].split('/').pop();
            return `Program error: ${reason.substring(0,100)}. (in ${file})`;
        }
        return "Program failed: SBF program panicked.";
    }
    if (lowerLog.includes("error:") || lowerLog.includes("failed:") || lowerLog.includes("invalid ")) {
      const errorMsg = `Error: ${log.length > 150 ? log.slice(0, 150) + '...' : log}`;
      return errorMsg;
    }
  }
  return "Unknown simulation error. Check console logs in the popup for more details.";
}