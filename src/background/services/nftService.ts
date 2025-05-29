// src/background/services/nftService.ts

import {
    CollectibleInfo,
    HeliusAsset,
    HeliusGetAssetsResult,
    HeliusCreator
} from './nftTypes';
import { getConnection } from '../shared/state';

// Define network type and Helius API URLs
type NetworkType = 'mainnet-beta' | 'devnet' | 'testnet' | 'custom';

const NETWORK_RPC_URLS: Record<NetworkType, string> = {
    'mainnet-beta': `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ''}`,
    'devnet': `https://devnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ''}`,
    'testnet': `https://testnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ''}`,
    'custom': `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ''}` // Default for custom RPC
};

// List of known spam-associated domain fragments
const SPAM_DOMAIN_FRAGMENTS: string[] = [
    "hi-hi.vip",
    // Add other known spam domains here
];


/**
 * Gets the appropriate Helius RPC URL based on the current network configuration.
 */
async function getHeliusRpcUrl(): Promise<string> {
    const connection = await getConnection();
    if (!connection) {
        throw new Error("No active Solana connection.");
    }

    let network: NetworkType = 'mainnet-beta';
    if (connection.rpcEndpoint.includes('devnet')) network = 'devnet';
    else if (connection.rpcEndpoint.includes('testnet')) network = 'testnet';
    else if (!connection.rpcEndpoint.includes('mainnet')) network = 'custom'; // Fallback for non-standard mainnet URLs

    return NETWORK_RPC_URLS[network];
}

/**
 * Maps a HeliusAsset to the local CollectibleInfo type.
 */
function mapHeliusAssetToCollectibleInfo(item: HeliusAsset): CollectibleInfo | null {
    const imageUrl = item.content?.files?.find(f => f.cdn_uri)?.cdn_uri ||
                     item.content?.files?.find(f => f.uri)?.uri ||
                     item.content?.metadata?.image; // Fallback to metadata image

    // Basic validation
    if (!item.id || !item.content?.metadata?.name || item.content.metadata.name.trim() === "" || !imageUrl) {
        return null;
    }

    // Spam indicators
    const hasVerifiedCreator = item.creators && item.creators.some((creator: HeliusCreator) => creator.verified === true);
    const jsonUri = item.content?.json_uri;
    const primaryImageUri = item.content?.files?.[0]?.uri;
    const hasSuspiciousUri = (jsonUri && SPAM_DOMAIN_FRAGMENTS.some(fragment => jsonUri.includes(fragment))) ||
                            (primaryImageUri && SPAM_DOMAIN_FRAGMENTS.some(fragment => primaryImageUri.includes(fragment)));
    const collectionInfoGroup = item.grouping?.find(g => g.group_key === 'collection');

    // Mark as spam if criteria are met
    const isSpam: boolean =
        !hasVerifiedCreator ||
        hasSuspiciousUri ||
        (collectionInfoGroup !== undefined && collectionInfoGroup?.verified === false);

    let collectionDetails: CollectibleInfo['collection'] = undefined;
    if (collectionInfoGroup) {
        collectionDetails = {
            address: collectionInfoGroup.group_value,
            name: collectionInfoGroup.collection_metadata?.name || 'Unknown Collection',
            description: collectionInfoGroup.collection_metadata?.description,
            image: collectionInfoGroup.collection_metadata?.image_url,
            external_url: collectionInfoGroup.collection_metadata?.external_url,
        };
    }

    return {
        mintAddress: item.id,
        name: item.content.metadata.name,
        imageUrl: imageUrl,
        collection: collectionDetails,
        isCompressed: item.compression?.compressed ?? false,
        description: item.content?.metadata?.description,
        attributes: item.content?.metadata?.attributes,
        external_url: item.content?.links?.external_url || item.content?.metadata?.external_url,
        isSpam: isSpam
    };
}


/**
 * Fetches metadata for a single NFT asset using Helius DAS API.
 */
export async function fetchNFTAssetDetails(mintAddress: string): Promise<CollectibleInfo | null> {
    const heliusRpcUrl = await getHeliusRpcUrl();
    if (!heliusRpcUrl || !import.meta.env.VITE_HELIUS_API_KEY) {
        // Missing Helius API key. Cannot fetch asset details.
        return null;
    }

    try {
        const response = await fetch(heliusRpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `kyoku-get-asset-${mintAddress}`,
                method: 'getAsset',
                params: {
                    id: mintAddress,
                    displayOptions: { // Request more details
                        showCollectionMetadata: true,
                    }
                },
            }),
        });

        if (!response.ok) {
            let errorBody = `HTTP error! Status: ${response.status}`;
            try { const body = await response.json(); errorBody = body?.error?.message ? `RPC Error: ${body.error.message}` : errorBody; } catch(e) {/* ignore json parsing error on error response */}
            throw new Error(errorBody);
        }
        const data = await response.json();
        if (data.error) throw new Error(`RPC Error: ${data.error.message}`);

        const asset = data.result as HeliusAsset;
        if (!asset || !asset.id) {
            // Asset not found or invalid response
            return null;
        }
        return mapHeliusAssetToCollectibleInfo(asset);

    } catch (error) {
        // Error fetching asset details
        return null;
    }
}


/**
 * Fetches NFTs owned by a public key using Helius DAS API with pagination and spam filtering.
 */
export async function fetchNFTsByOwner(ownerPublicKey: string): Promise<CollectibleInfo[]> {
    const heliusRpcUrl = await getHeliusRpcUrl();
    if (!heliusRpcUrl || !import.meta.env.VITE_HELIUS_API_KEY) {
         // Missing or invalid Helius API key.
         return [];
    }

    let allNfts: CollectibleInfo[] = [];
    let currentPage = 1;
    const limit = 1000; // Max items per page for Helius API
    let totalAssets = Infinity; // Initialize to allow first loop entry

    try {
        while (allNfts.length < totalAssets) {
            const response = await fetch(heliusRpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: `kyoku-get-assets-by-owner-${ownerPublicKey}-${currentPage}`,
                    method: 'getAssetsByOwner',
                    params: {
                        ownerAddress: ownerPublicKey,
                        page: currentPage,
                        limit: limit,
                        options: { // Helius display options
                            showUnverifiedCollections: false,
                            showCollectionMetadata: true,
                            showFungible: false,
                            showNativeBalance: false,
                            showInscription: false,
                            showZeroBalance: false,
                        }
                    },
                }),
            });

            if (!response.ok) {
                let errorBody = `HTTP error! Status: ${response.status}`;
                try { const body = await response.json(); errorBody = body?.error?.message ? `RPC Error: ${body.error.message}` : errorBody; } catch(e) {/* ignore */}
                throw new Error(errorBody);
            }
            const data = await response.json();
            if (data.error) throw new Error(`RPC Error: ${data.error.message}`);

            const result = data.result as HeliusGetAssetsResult;
            if (!result || !Array.isArray(result.items)) {
                 throw new Error("Invalid response structure received from Helius API.");
            }
            totalAssets = result.total; // Update total based on API response

            const pageNfts = result.items
                .filter((item: HeliusAsset) => { // Filter for actual NFTs (including compressed)
                    const isNFTInterface = item.interface === 'V1_NFT' ||
                                           item.interface === 'ProgrammableNFT' ||
                                           item.compression?.compressed;
                    return !item.burnt && isNFTInterface;
                })
                .map(mapHeliusAssetToCollectibleInfo) // Map to CollectibleInfo
                .filter((nft: CollectibleInfo | null): nft is CollectibleInfo => nft !== null); // Filter out nulls from mapping

            allNfts = allNfts.concat(pageNfts);

            if (result.items.length < limit || allNfts.length >= totalAssets) {
                break; // Exit loop if all assets fetched or no more items on page
            }
            currentPage++;
        }
        return allNfts;

    } catch (error) {
        // Error fetching NFTs
        throw new Error(`Failed to fetch NFTs: ${error instanceof Error ? error.message : String(error)}`);
    }
}