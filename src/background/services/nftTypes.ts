// src/background/services/nftTypes.ts

// Represents a collectible displayed in the UI
export interface CollectibleInfo {
    mintAddress: string;
    name: string;
    imageUrl?: string; 
    collection?: {
        address: string;
        name: string; 
        description?: string; // Added collection description
        image?: string; // Added collection image
        external_url?: string; // Added collection external URL
    };
    isCompressed: boolean;
    description?: string; // Added NFT description
    attributes?: Array<{ // Added attributes (traits)
        trait_type: string;
        value: string | number;
        display_type?: string;
    }>;
    external_url?: string; // Added NFT external URL
    isSpam: boolean; // Whether this NFT meets our spam criteria
    // Add other fields as needed
}

// --- Helius API Response Types ---

export interface HeliusFile {
    uri?: string;
    cdn_uri?: string;
    mime?: string;
}

// Added attributes to HeliusMetadata
export interface HeliusMetadata {
    name?: string;
    symbol?: string;
    description?: string; 
    attributes?: Array<{ // For traits from on-chain or Helius-parsed metadata
        trait_type: string;
        value: string | number;
        display_type?: string;
    }>;
    // Other metaplex standard fields if Helius provides them top-level
    image?: string; // Often the primary image is here too
    external_url?: string;
}

export interface HeliusContent {
    json_uri?: string;
    files?: HeliusFile[];
    metadata: HeliusMetadata; 
    links?: { // Helius often puts external_url and other links here
        external_url?: string;
        [key: string]: string | undefined; // For other potential links like twitter, discord etc.
    };
}

export interface HeliusGrouping {
    group_key: string; 
    group_value: string; 
    verified?: boolean; 
    collection_metadata?: { // If Helius provides collection metadata when showCollectionMetadata=true
        name?: string;
        description?: string;
        image_url?: string; // Consistent naming with other image URLs
        external_url?: string;
        // Potentially other fields like floor_price, total_supply if Helius includes them
    }
}

export interface HeliusCompression {
  compressed: boolean;
  eligible?: boolean;
  data_hash?: string;
  creator_hash?: string;
  asset_hash?: string;
  tree?: string;
  seq?: number;
  leaf_id?: number;
}

export interface HeliusCreator {
    address: string;
    share: number;
    verified: boolean;
}

export interface HeliusAsset {
    interface: string; 
    id: string; 
    content?: HeliusContent;
    authorities?: Array<{ address: string; scopes: string[] }>; 
    compression?: HeliusCompression;
    grouping?: HeliusGrouping[];
    royalty?: { 
        royalty_model: string;
        target: string | null;
        percent: number;
        basis_points: number;
        primary_sale_happened: boolean;
        locked: boolean;
    };
    creators?: HeliusCreator[]; 
    ownership: { 
        frozen: boolean;
        delegated: boolean;
        delegate: string | null;
        ownership_model: string;
        owner: string;
    };
    supply?: { 
        print_max_supply: number;
        print_current_supply: number;
        edition_nonce: number | null;
    };
    mutable?: boolean;
    burnt: boolean; 
}

export interface HeliusGetAssetsResult {
    total: number;
    limit: number;
    page: number;
    items: HeliusAsset[];
}
