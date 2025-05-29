// src/background/services/portfolioService.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenListProvider, TokenInfo as SPLTokenInfoFromRegistry } from '@solana/spl-token-registry';
import { TokenInfo } from '../core/keyring/types';
import { getConnection } from '../shared/state';
import { fetchTokenPricesInUSD, getPreviousTokenPrices } from './priceFeedService';
import { enrichTokensWithJupiterData } from './tokenMetadataService';

const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

// Internal Helper: Fetch SPL Token Accounts
async function fetchSplTokenAccounts(connection: Connection, ownerPublicKey: PublicKey): Promise<any[]> {
    try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            ownerPublicKey,
            { programId: TOKEN_PROGRAM_ID },
            'confirmed'
        );
        return tokenAccounts.value;
    } catch (error) {
        // Error fetching SPL token accounts
        return [];
    }
}

// Internal Helper: Get Token Map from SPL Token Registry, with caching and timeout
let tokenMapCache: Map<string, SPLTokenInfoFromRegistry> | null = null;
let currentTokenRegistryCluster: string | null = null;
const VALID_CLUSTERS_FOR_REGISTRY: ReadonlyArray<string> = ['mainnet-beta', 'testnet', 'devnet'];

async function getTokenMap(cluster: string): Promise<Map<string, SPLTokenInfoFromRegistry>> {
    const normalizedCluster = VALID_CLUSTERS_FOR_REGISTRY.includes(cluster) ? cluster : 'mainnet-beta';
    if (tokenMapCache && currentTokenRegistryCluster === normalizedCluster) {
        return tokenMapCache;
    }
    try {
        const providerPromise = new TokenListProvider().resolve();
        // Timeout for token list provider to prevent indefinite hang
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TokenListProvider timed out')), 15000)
        );
        const tokensContainer = await Promise.race([providerPromise, timeoutPromise]);
        const tokenList = tokensContainer.filterByClusterSlug(normalizedCluster as 'mainnet-beta' | 'testnet' | 'devnet').getList();
        tokenMapCache = tokenList.reduce((map, item) => {
            map.set(item.address, item);
            return map;
        }, new Map<string, SPLTokenInfoFromRegistry>());
        currentTokenRegistryCluster = normalizedCluster;
        return tokenMapCache;
    } catch (error) {
        // Failed to load token registry
        tokenMapCache = null; // Reset cache on error
        currentTokenRegistryCluster = null;
        return new Map<string, SPLTokenInfoFromRegistry>(); // Return empty map on error
    }
}

// Internal Helper: Enrich with SPL Token Registry Metadata
function enrichTokenMetadataWithRegistry(parsedAccounts: ReadonlyArray<any>, tokenMap: Map<string, SPLTokenInfoFromRegistry>): Omit<TokenInfo, 'usdPrice' | 'usdValue' | 'price24hAgo' | 'priceChange24hPercentage'>[] {
    return parsedAccounts
        .map((accInfo): Omit<TokenInfo, 'usdPrice' | 'usdValue' | 'price24hAgo' | 'priceChange24hPercentage'> | null => {
            const parsedInfo = accInfo?.account?.data?.parsed?.info;
            const mintAddress = parsedInfo?.mint;
            const uiAmount = parsedInfo?.tokenAmount?.uiAmount;
            const decimals = parsedInfo?.tokenAmount?.decimals;
            const lamportsString = parsedInfo?.tokenAmount?.amount;

            if (!mintAddress || uiAmount === undefined || uiAmount === null || decimals === undefined || !lamportsString) {
                return null;
            }
            const balanceLamports = BigInt(lamportsString);
            // Filter out zero balance SPL tokens unless it's SOL (handled separately)
            if (balanceLamports === 0n && mintAddress !== SOL_MINT_ADDRESS) return null;

            const metadata = tokenMap.get(mintAddress);
            return {
                address: mintAddress,
                balance: uiAmount,
                balanceLamports: balanceLamports,
                decimals: decimals,
                isNative: false,
                symbol: metadata?.symbol || `${mintAddress.substring(0, 4)}...${mintAddress.substring(mintAddress.length - 4)}`,
                name: metadata?.name || 'Unknown Token',
                logo: metadata?.logoURI || undefined,
            };
        })
        .filter((token): token is Omit<TokenInfo, 'usdPrice' | 'usdValue' | 'price24hAgo' | 'priceChange24hPercentage'> => token !== null);
}

// --- Exported Service Functions ---

/** Fetches SOL balance for a given public key. */
export async function fetchSolBalance(
    _connection_DO_NOT_USE: Connection | null, // Parameter kept for signature consistency, but connection is fetched internally.
    publicKeyString: string
): Promise<number> {
    const connection = await getConnection();
    if (!connection) {
        throw new Error("No active Solana connection.");
    }
    try {
        const publicKey = new PublicKey(publicKeyString);
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        return lamports;
    } catch (error) {
        throw new Error(`Failed to fetch SOL balance: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Fetches the complete portfolio (SOL and SPL tokens) for a given public key,
 * including balances, metadata, and USD price information.
 * @param _connection_DO_NOT_USE - Unused connection parameter. Connection is obtained from shared state.
 * @param publicKeyString - The public key of the account owner.
 * @param cluster - The Solana cluster (e.g., 'mainnet-beta', 'devnet') for context.
 * @returns A promise that resolves to an array of TokenInfo objects.
 */
export async function fetchPortfolio(
    _connection_DO_NOT_USE: Connection | null,
    publicKeyString: string,
    cluster: string // e.g., 'mainnet-beta', 'devnet'
): Promise<TokenInfo[]> {
    const connection = await getConnection();
    if (!connection) {
        throw new Error("No active Solana connection.");
    }

    try {
        const ownerPublicKey = new PublicKey(publicKeyString);
        const solBalanceLamports = await fetchSolBalance(null, publicKeyString);

        // Fetch SPL accounts and token registry map concurrently
        const [parsedSplAccounts, tokenMapResult]: [any[], Map<string, SPLTokenInfoFromRegistry>] = await Promise.all([
            fetchSplTokenAccounts(connection, ownerPublicKey),
            getTokenMap(cluster)
        ]).catch(_splError => {
            // On error fetching SPL/TokenMap, proceed with empty results for them
            return [[] as any[], new Map<string, SPLTokenInfoFromRegistry>()];
        });

        const splTokensFromRegistry = enrichTokenMetadataWithRegistry(parsedSplAccounts, tokenMapResult);

        const mintAddressesToFetchPricesFor = [
            SOL_MINT_ADDRESS,
            ...splTokensFromRegistry.map(token => token.address)
        ];
        const uniqueMintAddressesForPrice = Array.from(new Set(mintAddressesToFetchPricesFor));

        // Fetch current and 24h-ago prices concurrently
        const [usdPricesMap, prices24hAgoMap] = await Promise.all([
            fetchTokenPricesInUSD(uniqueMintAddressesForPrice),
            getPreviousTokenPrices(uniqueMintAddressesForPrice, 24) // Fetch for 24 hours ago
        ]);

        let portfolio: TokenInfo[] = [];

        // Add SOL to portfolio
        const solUsdPrice = usdPricesMap[SOL_MINT_ADDRESS];
        const solPrice24hAgo = prices24hAgoMap[SOL_MINT_ADDRESS];
        let solPriceChange24hPercentage: number | null = null;
        if (solUsdPrice !== null && solUsdPrice !== undefined && solPrice24hAgo !== null && solPrice24hAgo !== undefined && solPrice24hAgo !== 0) {
            solPriceChange24hPercentage = ((solUsdPrice - solPrice24hAgo) / solPrice24hAgo) * 100;
        }
        const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
        portfolio.push({
            address: SOL_MINT_ADDRESS,
            balance: solBalance,
            balanceLamports: BigInt(solBalanceLamports),
            decimals: 9,
            isNative: true,
            symbol: 'SOL',
            name: 'Solana',
            logo: '/icons/Solana_logo.png', // Path to local asset
            usdPrice: solUsdPrice,
            usdValue: (solUsdPrice !== null && solUsdPrice !== undefined) ? solBalance * solUsdPrice : null,
            price24hAgo: solPrice24hAgo,
            priceChange24hPercentage: solPriceChange24hPercentage,
        });

        // Add SPL Tokens to portfolio
        splTokensFromRegistry.forEach(splBaseToken => {
            const currentPrice = usdPricesMap[splBaseToken.address];
            const price24hAgo = prices24hAgoMap[splBaseToken.address];
            let priceChangePct: number | null = null;
            if (currentPrice !== null && currentPrice !== undefined && price24hAgo !== null && price24hAgo !== undefined && price24hAgo !== 0) {
                priceChangePct = ((currentPrice - price24hAgo) / price24hAgo) * 100;
            }
            portfolio.push({
                ...splBaseToken,
                usdPrice: currentPrice,
                usdValue: (currentPrice !== null && currentPrice !== undefined) ? splBaseToken.balance * currentPrice : null,
                price24hAgo: price24hAgo,
                priceChange24hPercentage: priceChangePct,
            });
        });

        // Enrich with additional metadata (e.g., from Jupiter)
        portfolio = await enrichTokensWithJupiterData(portfolio);

        // Sort portfolio: native SOL first, then by USD value (desc), then by symbol (asc)
        portfolio.sort((a, b) => {
            if (a.isNative && !b.isNative) return -1;
            if (!a.isNative && b.isNative) return 1;
            const valueA = a.usdValue ?? -1; // Treat null/undefined USD value as less valuable
            const valueB = b.usdValue ?? -1;
            if (valueB !== valueA) return valueB - valueA; // Sort by USD value descending
            const symbolA = a.symbol ?? a.address;
            const symbolB = b.symbol ?? b.address;
            return symbolA.localeCompare(symbolB); // Then by symbol ascending
        });

        return portfolio;

    } catch (error) {
        throw new Error(`Failed to fetch portfolio: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Export utility formatter if used by frontend components that import from this service
export { formatTokenBalance } from '../../utils/formatters';