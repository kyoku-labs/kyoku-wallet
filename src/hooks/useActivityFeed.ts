// src/hooks/useActivityFeed.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { useSolana } from '../context/SolanaContext';
import { PublicKey, ParsedInstruction, PartiallyDecodedInstruction, SystemProgram, LAMPORTS_PER_SOL, ParsedTransactionWithMeta, ConfirmedSignatureInfo, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { TokenInfo } from '../background/core/keyring/types';
import { CollectibleInfo } from '../background/services/nftTypes';
import { getJupiterTokenData } from '../background/services/tokenMetadataService';

// Types
export interface ActivityTransaction {
  id: string;
  date: string;
  timestamp: number;
  type: 'token' | 'nft' | 'swap' | 'interaction' | 'unknown' | 'sol' | 'dapp_interaction';
  action: 'sent' | 'received' | 'swapped' | 'interacted_with' | 'executed' | 'created' | 'approved';
  name?: string;
  amount?: string;
  symbol?: string;
  fromAddress?: string;
  toAddress?: string;
  secondaryAmount?: string;
  secondarySymbol?: string;
  iconUrl?: string;
  secondaryIconUrl?: string;
  source?: string;
  feeLamports?: number;
  mintAddress?: string;
  secondaryMintAddress?: string;
  dappName?: string;
  dappIconUrl?: string;
}

interface CachedActivities {
  publicKey: string;
  activities: ActivityTransaction[];
  oldestSignature: string | null;
  hasMore: boolean;
  lastFetchTimestamp: number;
  totalCached: number;
}

const INITIAL_FETCH_LIMIT = 10;
const LOAD_MORE_FETCH_LIMIT = 10;
const FETCH_DELAY_MS = 150;
const CACHE_DURATION_MS = 5 * 60 * 1000;
const MAX_CACHED_ITEMS = 200;
const CACHE_KEY_PREFIX = 'activity_cache_';
const MIN_SOL_AMOUNT_THRESHOLD = 0.0001;

const activityCache = new Map<string, CachedActivities>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getCacheKey = (publicKey: string): string => `${CACHE_KEY_PREFIX}${publicKey}`;

function isParsedInstruction(instruction: TransactionInstruction | ParsedInstruction | PartiallyDecodedInstruction): instruction is ParsedInstruction {
  return (instruction as ParsedInstruction).parsed !== undefined;
}

const getCachedActivities = (publicKey: string): CachedActivities | null => {
  const cacheKey = getCacheKey(publicKey);
  const cached = activityCache.get(cacheKey);
  if (!cached) return null;
  const now = Date.now();
  if (now - cached.lastFetchTimestamp > CACHE_DURATION_MS) {
    activityCache.delete(cacheKey);
    return null;
  }
  return cached;
};

const setCachedActivities = (
  publicKey: string, activities: ActivityTransaction[],
  oldestSignature: string | null, hasMore: boolean
): void => {
  const cacheKey = getCacheKey(publicKey);
  let trimmedActivities = activities.slice(0, MAX_CACHED_ITEMS);
  const cachedData: CachedActivities = {
    publicKey, activities: trimmedActivities, oldestSignature,
    hasMore, lastFetchTimestamp: Date.now(), totalCached: trimmedActivities.length
  };
  activityCache.set(cacheKey, cachedData);
};

const clearCacheForAccount = (publicKey: string): void => {
  activityCache.delete(getCacheKey(publicKey));
};

const shouldFetchFreshData = async (
  publicKey: string, connection: any, cachedActivities: ActivityTransaction[]
): Promise<boolean> => {
  if (cachedActivities.length === 0) return true;
  try {
    const latestSigs = await connection.getSignaturesForAddress(new PublicKey(publicKey), { limit: 1 });
    if (!latestSigs || latestSigs.length === 0) return false;
    return latestSigs[0].signature !== cachedActivities[0]?.id;
  } catch (error) {
    return false;
  }
};

const KNOWN_DAPP_PROGRAMS: Record<string, { name: string, icon?: string }> = {
    "MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8": { name: "Magic Eden", icon: "/icons/dapps/magiceden.png" },
    "whirLbMiFhF8XyE1tpTBAXDgwEcRukg2WHVd2QhRnN": { name: "Orca Whirlpools", icon: "/icons/dapps/orca.png"},
    "JUP6LkbZbjS1jKKwapdHch4nbNcvnbqmqkpZfrngotU": { name: "Jupiter Aggregator", icon: "/icons/dapps/jupiter.png"},
};

const truncateAddressHookLocal = (address: string | undefined, chars = 4): string => {
    if (!address) return '...';
    if (address.length <= chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

const isGenericSymbolLocal = (symbol?: string): boolean => {
    if (!symbol) return true;
    const lowerSymbol = symbol.toLowerCase().trim();
    return ['unk', 'unknown', 'token', 'unknown token', 'token !', '$unk', '???'].includes(lowerSymbol);
};

const isTokenConsideredSpam = (meta: Partial<TokenInfo>): boolean => {
  const hasNoLogo = !meta.logo || meta.logo.includes('placehold.co');
  const hasGenericSymbol = isGenericSymbolLocal(meta.symbol);
  const hasGenericName = !meta.name || isGenericSymbolLocal(meta.name);
  return hasNoLogo && (hasGenericSymbol || hasGenericName);
};

export function useActivityFeed(knownTokens?: TokenInfo[] | null) {
  const { activeAccount } = useAppStore();
  const { connection } = useSolana();

  const [activities, setActivities] = useState<ActivityTransaction[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [oldestFetchedSignature, setOldestFetchedSignature] = useState<string | null>(null);
  const [hasMoreActivities, setHasMoreActivities] = useState<boolean>(true);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState<boolean>(false);

  const initialFetchCompletedForAccountRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<boolean>(false);

  const getInitialTokenMetadata = useCallback(async (mintAddress: string): Promise<Partial<TokenInfo>> => {
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
        return { name: "Solana", symbol: "SOL", decimals: 9, logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"};
    }
    let primaryMeta: Partial<TokenInfo> = { name: undefined, symbol: undefined, decimals: 0, logo: undefined };
    const known = knownTokens?.find(token => token.address === mintAddress);
    if (known) {
        primaryMeta = { name: known.name, symbol: known.symbol, decimals: known.decimals, logo: known.logo };
    }
    if (!primaryMeta.logo || isGenericSymbolLocal(primaryMeta.symbol) || !primaryMeta.name || isGenericSymbolLocal(primaryMeta.name)) {
        try {
            const jupiterData = await getJupiterTokenData(mintAddress);
            if (jupiterData) {
                primaryMeta.name = primaryMeta.name && !isGenericSymbolLocal(primaryMeta.name) ? primaryMeta.name : jupiterData.name || primaryMeta.name;
                primaryMeta.symbol = primaryMeta.symbol && !isGenericSymbolLocal(primaryMeta.symbol) ? primaryMeta.symbol : jupiterData.symbol || primaryMeta.symbol;
                primaryMeta.decimals = primaryMeta.decimals !== 0 ? primaryMeta.decimals : jupiterData.decimals ?? primaryMeta.decimals;
                primaryMeta.logo = primaryMeta.logo || jupiterData.logoURI || primaryMeta.logo;
            }
        } catch (e) { /* console.warn for errors */ }
    }
    return primaryMeta;
  }, [knownTokens]);

  const parseAndProcessTransactions = useCallback(async (
    fetchedTxMetas: (ParsedTransactionWithMeta | null)[],
    correspondingSigInfos: ConfirmedSignatureInfo[],
    publicKeyString: string
  ): Promise<ActivityTransaction[]> => {
    const newParsedActivities: ActivityTransaction[] = [];
    
    for (let i = 0; i < fetchedTxMetas.length; i++) {
      const txMeta = fetchedTxMetas[i];
      const sigInfo = correspondingSigInfos[i];

      if (!txMeta || !txMeta.blockTime || !txMeta.transaction?.message || !txMeta.meta) continue;

      const signature = sigInfo.signature;
      const date = new Date(txMeta.blockTime * 1000).toISOString().split('T')[0];
      const timestamp = txMeta.blockTime;
      const fee = txMeta.meta.fee;
      let mainActionProcessed = false;
      let identifiedDappName: string | undefined = undefined;
      let identifiedDappIcon: string | undefined = undefined;
      let iconUrlToUse: string | undefined = undefined;
      
      let significantSolActionFound = false;
      let allTokenChangesWerePlusZeroAndSpam = true;
      let txHadTokenBalanceChanges = false;
      let hasAnyNonSpamZeroValueTokenChange = false;

      const instructions = txMeta.transaction.message.instructions;
      for (const ix of instructions) {
        if ('programId' in ix) {
            const programIdStr = ix.programId.toBase58();
            if (KNOWN_DAPP_PROGRAMS[programIdStr]) {
                identifiedDappName = KNOWN_DAPP_PROGRAMS[programIdStr].name;
                identifiedDappIcon = KNOWN_DAPP_PROGRAMS[programIdStr].icon;
                break;
            }
        }
      }
      
      const tokenBalanceChangesRaw: Array<{ mint: string; change: bigint; decimals: number; metadata: Partial<TokenInfo>; accountIndex: number; isSpam: boolean}> = [];
      const accountIndex = txMeta.transaction.message.accountKeys.findIndex(key => key.pubkey.toBase58() === publicKeyString);

      if (txMeta.meta.preTokenBalances && txMeta.meta.postTokenBalances) {
        txHadTokenBalanceChanges = true;
        for (const postBal of txMeta.meta.postTokenBalances) {
          if (postBal.owner !== publicKeyString || !postBal.uiTokenAmount) continue;
          const preBal = txMeta.meta.preTokenBalances.find(pb => pb.accountIndex === postBal.accountIndex && pb.mint === postBal.mint);
          const change = BigInt(postBal.uiTokenAmount.amount) - BigInt(preBal?.uiTokenAmount?.amount || '0');
          
          let meta = await getInitialTokenMetadata(postBal.mint);
          const isSpam = isTokenConsideredSpam(meta);

          if (change === 0n) {
            if (isSpam) {
              // This is a +0 spam token change. It contributes to `allTokenChangesWerePlusZeroAndSpam` if no other types of changes are found.
            } else { // +0 but NOT spam
              allTokenChangesWerePlusZeroAndSpam = false; 
              hasAnyNonSpamZeroValueTokenChange = true; 
              tokenBalanceChangesRaw.push({ mint: postBal.mint, change, decimals: meta.decimals ?? postBal.uiTokenAmount.decimals, metadata: meta, accountIndex: postBal.accountIndex, isSpam });
            }
          } else { // change is non-zero
            allTokenChangesWerePlusZeroAndSpam = false;
            hasAnyNonSpamZeroValueTokenChange = true;

            const isSingleUnitTransfer = (meta.decimals === 0 && (change === 1n || change === -1n));
            if (isSingleUnitTransfer && (!meta.logo || meta.logo.includes('placehold.co') || isGenericSymbolLocal(meta.name))) {
              try {
                  const heliusResponse = await new Promise<{success: boolean, collectibleInfo: CollectibleInfo | null, error?: string}>((resolve) => {
                      chrome.runtime.sendMessage(
                          { action: 'fetchNFTAssetDetailsByMint', payload: { mintAddress: postBal.mint } },
                          (response) => {
                              if (chrome.runtime.lastError) { resolve({ success: false, collectibleInfo: null, error: chrome.runtime.lastError?.message }); }
                              else { resolve(response as {success: boolean, collectibleInfo: CollectibleInfo | null, error?: string}); }
                          }
                      );
                  });
                   if (heliusResponse.success && heliusResponse.collectibleInfo) {
                       meta.logo = heliusResponse.collectibleInfo.imageUrl || meta.logo;
                       meta.name = (heliusResponse.collectibleInfo.name && !isGenericSymbolLocal(heliusResponse.collectibleInfo.name)) ? heliusResponse.collectibleInfo.name : meta.name;
                   }
              } catch (e) { /* console.warn for Helius fetch error */ }
            }
            tokenBalanceChangesRaw.push({ mint: postBal.mint, change, decimals: meta.decimals ?? postBal.uiTokenAmount.decimals, metadata: meta, accountIndex: postBal.accountIndex, isSpam });
          }
        }
      } else {
        allTokenChangesWerePlusZeroAndSpam = false;
      }
      
      if (accountIndex !== -1 && txMeta.meta.preBalances[accountIndex] !== undefined && txMeta.meta.postBalances[accountIndex] !== undefined) {
          const preSol = txMeta.meta.preBalances[accountIndex]; const postSol = txMeta.meta.postBalances[accountIndex];
          const isFeePayer = txMeta.transaction.message.accountKeys[0].pubkey.toBase58() === publicKeyString;
          const solChange = postSol - preSol + (isFeePayer ? fee : 0);

          if (Math.abs(solChange) / LAMPORTS_PER_SOL >= MIN_SOL_AMOUNT_THRESHOLD) {
            significantSolActionFound = true;
            allTokenChangesWerePlusZeroAndSpam = false; 
            const solMeta = await getInitialTokenMetadata('So11111111111111111111111111111111111111112');
            if (solChange < 0) {
                const sysTransferOut = instructions.find(ix => isParsedInstruction(ix) && ix.programId.equals(SystemProgram.programId) && ix.parsed?.type === 'transfer' && ix.parsed.info.source === publicKeyString) as ParsedInstruction | undefined;
                if (sysTransferOut?.parsed) {
                  newParsedActivities.push({ 
                    id: signature, date, timestamp, type: 'sol', action: 'sent', name: solMeta.name || "SOL", 
                    amount: `-${(Math.abs(solChange) / LAMPORTS_PER_SOL).toFixed(4)}`, symbol: solMeta.symbol || "SOL", toAddress: sysTransferOut.parsed.info.destination, 
                    feeLamports: fee, iconUrl: solMeta.logo, dappName: identifiedDappName, dappIconUrl: identifiedDappIcon,
                  });
                  mainActionProcessed = true;
                }
            } else if (solChange > 0) {
                 const sysTransferIn = instructions.find(ix => isParsedInstruction(ix) && ix.programId.equals(SystemProgram.programId) && ix.parsed?.type === 'transfer' && ix.parsed.info.destination === publicKeyString) as ParsedInstruction | undefined;
                if (sysTransferIn?.parsed) {
                  newParsedActivities.push({ 
                    id: signature, date, timestamp, type: 'sol', action: 'received', name: solMeta.name || "SOL", 
                    amount: `+${(solChange / LAMPORTS_PER_SOL).toFixed(4)}`, symbol: solMeta.symbol || "SOL", fromAddress: sysTransferIn.parsed.info.source, 
                    feeLamports: fee, iconUrl: solMeta.logo, dappName: identifiedDappName, dappIconUrl: identifiedDappIcon,
                  });
                  mainActionProcessed = true;
                }
            }
          }
      } else { // No SOL balance changes for the user
         if (allTokenChangesWerePlusZeroAndSpam && txHadTokenBalanceChanges && tokenBalanceChangesRaw.filter(tc => !(tc.change === 0n && tc.isSpam)).length === 0) {
            // If all token changes that weren't filtered out initially were effectively +0 spam, it's still purely spam
         } else if (txHadTokenBalanceChanges && tokenBalanceChangesRaw.filter(tc => !(tc.change === 0n && tc.isSpam)).length > 0) {
            allTokenChangesWerePlusZeroAndSpam = false; // There were non-spam token changes, even if 0-value non-spam
         } else if (!txHadTokenBalanceChanges) {
            allTokenChangesWerePlusZeroAndSpam = false; // No token changes at all
         }
      }
      
      const tokenBalanceChangesForDisplay = tokenBalanceChangesRaw.filter(tc => !(tc.change === 0n && tc.isSpam));

      const noOtherRelevantInteractions = !instructions.some(ix => {
        if (!('programId' in ix)) return false;
        const pid = ix.programId.toBase58();
        const isApprovalLike = isParsedInstruction(ix) && (ix.parsed?.type === 'approve' || ix.parsed?.type === 'approveChecked' || (ix.parsed?.type === 'setAuthority' && ix.parsed?.info?.authorityType?.toLowerCase().includes('delegate')));
        return !ix.programId.equals(SystemProgram.programId) && !ix.programId.equals(TOKEN_PROGRAM_ID) && !KNOWN_DAPP_PROGRAMS[pid] && !isApprovalLike;
      });

      if (txHadTokenBalanceChanges && allTokenChangesWerePlusZeroAndSpam && !significantSolActionFound && !identifiedDappName && noOtherRelevantInteractions && !mainActionProcessed && !hasAnyNonSpamZeroValueTokenChange) {
        continue;
      }
      
      if (tokenBalanceChangesForDisplay.length > 0 && !mainActionProcessed) {
        const nonZeroChanges = tokenBalanceChangesForDisplay.filter(tc => tc.change !== 0n);
        if (nonZeroChanges.length >= 2) {
          const incoming = nonZeroChanges.filter(c => c.change > 0n);
          const outgoing = nonZeroChanges.filter(c => c.change < 0n);
          if (incoming.length >= 1 && outgoing.length >= 1) {
            const pIn = incoming[0]; const pOut = outgoing[0];
            const inAmt = parseFloat(pIn.change.toString()) / (10**pIn.decimals);
            const outAmt = parseFloat(pOut.change.toString()) / (10**pOut.decimals);
            newParsedActivities.push({
              id: signature, date, timestamp, type: 'swap', action: 'swapped',
              name: `Swap ${pOut.metadata.symbol || 'Token'} for ${pIn.metadata.symbol || 'Token'}`,
              amount: `${Math.abs(outAmt).toFixed(Math.min(pOut.decimals, 4))}`, symbol: pOut.metadata.symbol || truncateAddressHookLocal(pOut.mint,4),
              secondaryAmount: `+${inAmt.toFixed(Math.min(pIn.decimals, 4))}`, secondarySymbol: pIn.metadata.symbol || truncateAddressHookLocal(pIn.mint,4),
              iconUrl: pOut.metadata.logo, secondaryIconUrl: pIn.metadata.logo,
              mintAddress: pOut.mint, secondaryMintAddress: pIn.mint, feeLamports: fee, 
              dappName: identifiedDappName, dappIconUrl: identifiedDappIcon, source: identifiedDappName || undefined,
            });
            mainActionProcessed = true;
          }
        }
        
        if (!mainActionProcessed && nonZeroChanges.length > 0) {
          const tc = nonZeroChanges[0];
          const uiAmt = parseFloat(tc.change.toString()) / (10**tc.decimals);
          let from:string|undefined, to:string|undefined;
          const actType: ActivityTransaction['action'] = tc.change > 0n ? 'received' : 'sent';
          const accountKeys = txMeta.transaction.message.accountKeys;
          const relIx = instructions.find(ix => isParsedInstruction(ix) && ix.programId.equals(TOKEN_PROGRAM_ID) && (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') && ix.parsed.info.mint === tc.mint && ((accountKeys[tc.accountIndex].pubkey.toBase58() === ix.parsed.info.destination && actType === 'received') || (accountKeys[tc.accountIndex].pubkey.toBase58() === ix.parsed.info.source && actType === 'sent'))) as ParsedInstruction | undefined;
          if(relIx?.parsed?.info) {
                if (actType === 'received') from = relIx.parsed.info.authority || relIx.parsed.info.multisigAuthority || relIx.parsed.info.source;
                if (actType === 'sent') to = relIx.parsed.info.destination;
          }
          newParsedActivities.push({ 
            id: signature, date, timestamp, type: 'token', action: actType, 
            name: tc.metadata.name || `Token ${truncateAddressHookLocal(tc.mint,4)}`, 
            amount: `${uiAmt > 0 ? '+' : ''}${uiAmt.toFixed(Math.min(tc.decimals,4))}`, 
            symbol: tc.metadata.symbol || truncateAddressHookLocal(tc.mint,4), 
            fromAddress: from, toAddress: to, feeLamports: fee, iconUrl: tc.metadata.logo, mintAddress: tc.mint,
            dappName: identifiedDappName, dappIconUrl: identifiedDappIcon, source: identifiedDappName || undefined,
          });
          if (!mainActionProcessed) mainActionProcessed = true;
        }
      }

      if (!mainActionProcessed) {
        const programInteractionInstruction = instructions.find(ix => 'programId' in ix && !ix.programId.equals(SystemProgram.programId) && !ix.programId.equals(TOKEN_PROGRAM_ID));
        const isProgramInteraction = !!programInteractionInstruction;
        const programIdForDisplay = programInteractionInstruction?.programId.toBase58() || (instructions[0] && 'programId' in instructions[0] ? instructions[0].programId.toBase58() : 'Unknown Program');

        let activityType: ActivityTransaction['type'] = 'unknown';
        let activityName: string = 'Unknown Transaction';
        let activityAction: ActivityTransaction['action'] = 'executed';
        let activitySource: string | undefined = identifiedDappName || programIdForDisplay;
        iconUrlToUse = undefined;

        if (identifiedDappName) {
          activityType = 'dapp_interaction';
          activityName = identifiedDappName; 
          iconUrlToUse = identifiedDappIcon;
        } else if (isProgramInteraction) {
          activityType = 'dapp_interaction'; 
          activityName = `Program Interaction`; 
          activitySource = truncateAddressHookLocal(programIdForDisplay, 6);
        }
        
        const approvalInstruction = instructions.find(ix => isParsedInstruction(ix) && ((ix.parsed?.type === 'approve' || ix.parsed?.type === 'approveChecked') || (ix.parsed?.type === 'setAuthority' && ix.parsed?.info?.authorityType?.toLowerCase().includes('delegate')))) as ParsedInstruction | undefined;
        if (approvalInstruction) {
            activityType = 'token'; 
            activityAction = 'approved';
            const tokenMintForApproval = approvalInstruction.parsed?.info?.mint || approvalInstruction.parsed?.info?.account;
            if (tokenMintForApproval) {
                const tokenData = await getInitialTokenMetadata(tokenMintForApproval);
                activityName = `Approve ${tokenData.symbol || truncateAddressHookLocal(tokenMintForApproval, 4)}`;
                iconUrlToUse = tokenData.logo; 
            } else activityName = "Token Approval";
            activitySource = identifiedDappName || programIdForDisplay;
        }
        
        newParsedActivities.push({ 
          id: signature, date, timestamp, type: activityType, action: activityAction, 
          name: activityName, source: activitySource, feeLamports: fee, iconUrl: iconUrlToUse, 
          dappName: identifiedDappName, dappIconUrl: identifiedDappIcon,
        });
      }
    }
    return newParsedActivities;
  }, [getInitialTokenMetadata]);

  const fetchActivities = useCallback(async (publicKeyString: string, beforeSignature?: string | null) => {
    if (!connection) {
      setError("Connection not available.");
      if (!beforeSignature) {
        setActivities([]);
        setIsLoadingInitial(false); 
        setHasMoreActivities(false);
        initialFetchCompletedForAccountRef.current.add(publicKeyString);
      }
      return;
    }
    if (fetchingRef.current) return;
    
    if (!beforeSignature && initialFetchCompletedForAccountRef.current.has(publicKeyString) && !hasMoreActivities && activities.length === 0) {
        setIsLoadingInitial(false);
        return;
    }

    fetchingRef.current = true;

    try {
      if (beforeSignature) {
        setIsFetchingMore(true);
      } else { // Initial fetch or refresh
        const cached = getCachedActivities(publicKeyString);
        if (cached && !initialFetchCompletedForAccountRef.current.has(publicKeyString)) { // Only use cache if initial fetch wasn't explicitly triggered yet for this session/account
          setIsLoadingFromCache(true); setActivities(cached.activities);
          setOldestFetchedSignature(cached.oldestSignature); setHasMoreActivities(cached.hasMore);
          setError(null); setIsLoadingInitial(false);
          initialFetchCompletedForAccountRef.current.add(publicKeyString); // Mark as completed via cache
          
          const needsFresh = await shouldFetchFreshData(publicKeyString, connection, cached.activities);
          setIsLoadingFromCache(false);
          if (!needsFresh) {
            fetchingRef.current = false;
            return;
          }
          // If needsFresh, proceed to fetch but don't set setIsLoadingInitial(true) again
        } else {
            setIsLoadingInitial(true); // Set for non-cached initial or refresh
            if (!beforeSignature || (cached && await shouldFetchFreshData(publicKeyString, connection, cached.activities))) {
                 setActivities([]); 
                 setOldestFetchedSignature(null);
                 setHasMoreActivities(true);
            }
        }
      }
      setError(null);
      const pubKey = new PublicKey(publicKeyString);
      const limit = beforeSignature ? LOAD_MORE_FETCH_LIMIT : INITIAL_FETCH_LIMIT;
      const signaturesInfos = await connection.getSignaturesForAddress(pubKey, { limit, before: beforeSignature || undefined });

      if (!beforeSignature) {
          initialFetchCompletedForAccountRef.current.add(publicKeyString);
      }

      if (!signaturesInfos || signaturesInfos.length === 0) {
        setHasMoreActivities(false);
        if (!beforeSignature) { // If it was an initial fetch and nothing was found
            setActivities([]); // Ensure activities list is empty
            setOldestFetchedSignature(null);
            // Update cache to reflect that there are no activities and no more to fetch
            setCachedActivities(publicKeyString, [], null, false);
        }
        // No state change for activities if it's a "load more" that returns empty
        fetchingRef.current = false;
        if (beforeSignature) setIsFetchingMore(false); else setIsLoadingInitial(false);
        return;
      }

      const fetchedTxMetas: (ParsedTransactionWithMeta | null)[] = [];
      for (const sigInfo of signaturesInfos) {
          try {
              const txMeta = await connection.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
              fetchedTxMetas.push(txMeta);
              if (signaturesInfos.length > 3) await sleep(FETCH_DELAY_MS);
          } catch (txError) {
            fetchedTxMetas.push(null);
          }
      }
      const newParsedActivities = await parseAndProcessTransactions(fetchedTxMetas, signaturesInfos, publicKeyString);
      const newOldestSignature = signaturesInfos[signaturesInfos.length - 1]?.signature || null;
      const newHasMore = signaturesInfos.length === limit;

      setActivities(prev => {
        const combined = beforeSignature ? [...prev, ...newParsedActivities] : newParsedActivities;
        const uniqueMap = new Map<string, ActivityTransaction>();
        combined.forEach(act => {
            const activityKey = `${act.id}-${act.type}-${act.action}-${act.mintAddress || 'sol'}-${act.amount || 'no_amount'}-${act.name || 'no_name'}-${act.source || 'no_source'}-${act.timestamp}`;
            if(!uniqueMap.has(activityKey) ){
                 uniqueMap.set(activityKey, act);
            }
        });

        const sortedCombined = Array.from(uniqueMap.values()).sort((a,b) => {
            if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
            const keyA = `${a.id}-${a.type}-${a.action}`;
            const keyB = `${b.id}-${b.type}-${b.action}`;
            return keyB.localeCompare(keyA);
        });
        setCachedActivities(publicKeyString, sortedCombined, newOldestSignature, newHasMore);
        return sortedCombined;
      });
      setOldestFetchedSignature(newOldestSignature);
      setHasMoreActivities(newHasMore);
    } catch (err: any) {
      setError(err.message || "Failed to load activities.");
      if (!beforeSignature) {
          setActivities([]);
          setHasMoreActivities(false);
          initialFetchCompletedForAccountRef.current.add(publicKeyString);
      }
    } finally {
      fetchingRef.current = false;
      if (beforeSignature) setIsFetchingMore(false);
      else { setIsLoadingInitial(false); setIsLoadingFromCache(false); }
    }
  }, [connection, parseAndProcessTransactions]);

  useEffect(() => {
    const currentPk = activeAccount?.publicKey;
    if (currentPk && connection) {
      // If this account's initial fetch hasn't been completed yet in this session OR cache is empty
      if (!initialFetchCompletedForAccountRef.current.has(currentPk) || !getCachedActivities(currentPk)) {
        setIsLoadingInitial(true);
        setActivities([]); 
        setOldestFetchedSignature(null);
        setHasMoreActivities(true); 
        fetchActivities(currentPk, null);
      } else { // Cache exists and initial fetch was marked complete
        const cached = getCachedActivities(currentPk);
        if (cached) {
            // console.log(`[ActivityFeed] Hydrating from valid cache for ${currentPk}.`);
            setActivities(cached.activities);
            setOldestFetchedSignature(cached.oldestSignature);
            setHasMoreActivities(cached.hasMore);
            setIsLoadingInitial(false);
            // Optionally, trigger a silent refresh in background if cache is old but not expired
            if (Date.now() - cached.lastFetchTimestamp > CACHE_DURATION_MS / 2) { // e.g. half cache duration
                shouldFetchFreshData(currentPk, connection, cached.activities).then(needsFresh => {
                    if(needsFresh) fetchActivities(currentPk, null);
                });
            }
        }
      }
    } else { // No active account or connection
      clearCacheForAccount(currentPk || 'unknown_pk_effect_clear');
      setActivities([]); setError(null); setHasMoreActivities(true);
      setOldestFetchedSignature(null); 
      setIsLoadingInitial(!!currentPk); 
      setIsFetchingMore(false); setIsLoadingFromCache(false);
      if(currentPk) initialFetchCompletedForAccountRef.current.delete(currentPk); else initialFetchCompletedForAccountRef.current.clear();
    }
  }, [activeAccount?.publicKey, connection, fetchActivities]);


  const loadMoreActivities = useCallback(() => {
    if (activeAccount?.publicKey && initialFetchCompletedForAccountRef.current.has(activeAccount.publicKey) && hasMoreActivities && !isFetchingMore && !isLoadingInitial) {
      fetchActivities(activeAccount.publicKey, oldestFetchedSignature);
    }
  }, [activeAccount?.publicKey, oldestFetchedSignature, fetchActivities, hasMoreActivities, isFetchingMore, isLoadingInitial]);

  const refreshActivities = useCallback(() => {
    if (activeAccount?.publicKey) {
      clearCacheForAccount(activeAccount.publicKey);
      setOldestFetchedSignature(null); 
      setHasMoreActivities(true);
      initialFetchCompletedForAccountRef.current.delete(activeAccount.publicKey);
      setIsLoadingInitial(true);
      setActivities([]);
      fetchActivities(activeAccount.publicKey, null);
    }
  }, [activeAccount?.publicKey, fetchActivities]);

  const getCacheInfo = useCallback(() => activeAccount?.publicKey ? getCachedActivities(activeAccount.publicKey) : null, [activeAccount?.publicKey]);

  return { activities, isLoadingInitial, isFetchingMore, isLoadingFromCache, error, hasMoreActivities, loadMoreActivities, refreshActivities, getCacheInfo };
}