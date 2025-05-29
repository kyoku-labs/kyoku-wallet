// src/store/appStore.ts
import { create } from 'zustand';
import { AccountMetadata, TokenInfo } from '../background/core/keyring/types';
import { CollectibleInfo } from '../background/services/nftTypes';
import { Cluster } from '@solana/web3.js';
import { DEFAULT_EXPLORER_ID } from '../utils/explorerUtils';
import {
    PriorityFeeLevel,
    DEFAULT_PRIORITY_FEE_LEVEL,
    config as backgroundConfig 
} from '../background/shared/state';
import { saveToStorage } from '../utils/storage';
import { SUPPORTED_EXPLORERS, Explorer } from '../utils/explorerUtils';
import { ActivityTransaction } from '../hooks/useActivityFeed';

const TABS_CONFIG_FOR_STORE = ['Tokens', 'Collectibles', 'Activity'];

export interface TransactionConfirmationDetails {
  serializedTransaction: string; 
  lastValidBlockHeight?: number;
  sourceView?: AppView; 
  dappInfo?: { 
    name: string;
    origin: string;
    icon?: string;
  };
  actionContext?: { 
    type: 'swap';
    inputTokenSymbol?: string;
    inputTokenAmount?: string;
    outputTokenSymbol?: string;
    outputTokenAmount?: string; 
  } | {
    type: 'send';
  } | {
    type: 'dappRequest'; 
  };
}

export interface SwapSuccessDetails {
    signature: string;
    inputAmount: string;
    inputSymbol?: string;
    expectedOutputAmount?: string; 
    outputSymbol?: string;
}

export type AppView =
  | 'LOCKED'
  | 'DASHBOARD'
  | 'RECEIVE'
  | 'SETTINGS'
  | 'GENERATE_MNEMONIC_PROMPT' 
  | 'IMPORT_MNEMONIC'
  | 'IMPORT_MNEMONIC_SCANNING'
  | 'IMPORT_MNEMONIC_SELECT_ACCOUNTS'
  | 'ACCOUNT_SETTINGS'
  | 'TOKEN_MANAGEMENT'
  | 'NFT_MANAGEMENT'
  | 'TOKEN_DETAILS'
  | 'NFT_DETAILS'
  | 'SEND_FLOW'
  | 'SWAP_VIEW'
  | 'CONFIRM_TRANSACTION'
  | 'SWAP_SUCCESS'
  | 'SWAP_ERROR'
  | 'ACTIVITY_TRANSACTION_DETAILS';

export type NetworkOption = Cluster | 'custom'; 

interface AppState {
  isLocked: boolean;
  isInitialLoading: boolean; 
  isLoading: boolean; 
  currentView: AppView;
  activeAccount: AccountMetadata | null;
  allAccounts: AccountMetadata[];
  loadingError: string | null; 

  network: NetworkOption;
  customRpcUrl: string | null;

  preferredExplorerId: string;
  priorityFeeLevel: PriorityFeeLevel;
  selectedCurrency: string; 
  selectedLanguage: string; 

  activeAccountPfpMint: string | null; 

  viewingAccountSettingsFor: AccountMetadata | null;
  viewingTokenDetails: TokenInfo | null;
  viewingNftDetails: CollectibleInfo | null;
  viewingCollectionAddress: string | null; 
  sendViewInitialToken: TokenInfo | null; 
  viewingActivityTransactionDetails: ActivityTransaction | null;
  dashboardActiveTab: string; 

  transactionForConfirmation: TransactionConfirmationDetails | null;
  swapSuccessDetails: SwapSuccessDetails | null;
  swapErrorDetails: string | null;

  // MODIFIED: Update the type here
  portfolioChange24h: number | null | 'new_portfolio_increase'; 
  portfolioUsdChange24h: number | null; 

  setLockedState: (locked: boolean) => void;
  setIsInitialLoading: (loading: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setView: (view: AppView) => void;
  setActiveAccount: (account: AccountMetadata | null) => void;
  setAllAccounts: (accounts: AccountMetadata[]) => void;
  setError: (error: string | null) => void;
  updateAccountName: (uuid: string, newName: string) => void;
  unlockWallet: (account: AccountMetadata | null, accounts: AccountMetadata[]) => void;
  lockWallet: () => void;
  setNetworkConfiguration: (network: NetworkOption, customRpcUrl: string | null) => void;
  setPreferredExplorerId: (explorerId: string) => void;
  setPriorityFeeLevel: (level: PriorityFeeLevel) => void;
  setSelectedCurrency: (currencyCode: string) => void;
  setSelectedLanguage: (languageCode: string) => void;
  setActiveAccountPfpMint: (mintAddress: string | null) => void;
  setViewAccountSettings: (account: AccountMetadata | null) => void;
  setViewTokenDetails: (token: TokenInfo | null) => void;
  setViewNftDetails: (nft: CollectibleInfo | null) => void;
  setViewCollectionAddress: (collectionAddress: string | null) => void;
  setSendViewInitialToken: (token: TokenInfo | null) => void;
  setViewActivityTransactionDetails: (transaction: ActivityTransaction | null) => void;
  setDashboardActiveTab: (tab: string) => void;
  setTransactionForConfirmation: (details: TransactionConfirmationDetails | null) => void;
  setSwapSuccess: (details: SwapSuccessDetails | null) => void;
  setSwapError: (error: string | null) => void;
  setPortfolioChange24h: (percentage: number | null | 'new_portfolio_increase') => void; // MODIFIED
  setPortfolioUsdChange24h: (absoluteChange: number | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isLocked: true,
  isInitialLoading: true,
  isLoading: false,
  currentView: 'LOCKED',
  activeAccount: null,
  allAccounts: [],
  loadingError: null,
  network: 'mainnet-beta',
  customRpcUrl: null,
  preferredExplorerId: DEFAULT_EXPLORER_ID,
  priorityFeeLevel: DEFAULT_PRIORITY_FEE_LEVEL,
  selectedCurrency: 'USD',
  selectedLanguage: 'en',
  activeAccountPfpMint: null,
  viewingAccountSettingsFor: null,
  viewingTokenDetails: null,
  viewingNftDetails: null,
  viewingCollectionAddress: null,
  sendViewInitialToken: null,
  viewingActivityTransactionDetails: null,
  dashboardActiveTab: TABS_CONFIG_FOR_STORE[0], 
  transactionForConfirmation: null,
  swapSuccessDetails: null,
  swapErrorDetails: null,
  portfolioChange24h: null,
  portfolioUsdChange24h: null,

  setLockedState: (locked) =>
    set((state) => ({
      isLocked: locked,
      currentView: locked ? 'LOCKED' : (state.activeAccount || state.allAccounts.length > 0 ? 'DASHBOARD' : 'GENERATE_MNEMONIC_PROMPT'),
      activeAccount: locked ? null : state.activeAccount,
      activeAccountPfpMint: locked ? null : state.activeAccountPfpMint,
      loadingError: null, isLoading: false,
      viewingAccountSettingsFor: locked ? null : state.viewingAccountSettingsFor,
      portfolioChange24h: locked ? null : state.portfolioChange24h,
      portfolioUsdChange24h: locked ? null : state.portfolioUsdChange24h,
    })),
  setIsInitialLoading: (loading) => set({ isInitialLoading: loading }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setView: (view) => set((state) => ({
    currentView: view,
    loadingError: null, 
    viewingAccountSettingsFor: view !== 'ACCOUNT_SETTINGS' ? null : state.viewingAccountSettingsFor,
    viewingTokenDetails: view !== 'TOKEN_DETAILS' ? null : state.viewingTokenDetails,
    viewingNftDetails: view !== 'NFT_DETAILS' ? null : state.viewingNftDetails,
    viewingActivityTransactionDetails: view !== 'ACTIVITY_TRANSACTION_DETAILS' ? null : state.viewingActivityTransactionDetails,
    viewingCollectionAddress: (view !== 'DASHBOARD' || (view === 'DASHBOARD' && state.dashboardActiveTab !== 'Collectibles')) ? null : state.viewingCollectionAddress,
    sendViewInitialToken: view !== 'SEND_FLOW' && view !== 'SWAP_VIEW' ? null : state.sendViewInitialToken,
    transactionForConfirmation: view !== 'CONFIRM_TRANSACTION' ? null : state.transactionForConfirmation,
    swapSuccessDetails: view !== 'SWAP_SUCCESS' ? null : state.swapSuccessDetails,
    swapErrorDetails: view !== 'SWAP_ERROR' ? null : state.swapErrorDetails,
  })),
  setActiveAccount: (newlyActiveAccountMetadata) => {
    set((state) => ({
      activeAccount: newlyActiveAccountMetadata,
      loadingError: null, 
      activeAccountPfpMint: newlyActiveAccountMetadata?.pfpMint || null,
      allAccounts: state.allAccounts.map(acc =>
        acc.uuid === newlyActiveAccountMetadata?.uuid ? newlyActiveAccountMetadata : acc
      ),
      portfolioChange24h: null,
      portfolioUsdChange24h: null,
    }));
  },
  setAllAccounts: (accounts) => set({ allAccounts: accounts }),
  setError: (error) => set({ loadingError: error, isLoading: false }),
  updateAccountName: (uuid, newName) =>
    set((state) => ({
      allAccounts: state.allAccounts.map((acc) =>
        acc.uuid === uuid ? { ...acc, name: newName } : acc
      ),
      activeAccount:
        state.activeAccount?.uuid === uuid
          ? { ...state.activeAccount, name: newName }
          : state.activeAccount,
      viewingAccountSettingsFor: 
        state.viewingAccountSettingsFor?.uuid === uuid
          ? { ...state.viewingAccountSettingsFor, name: newName }
          : state.viewingAccountSettingsFor,
    })),
  unlockWallet: (account, accounts) => {
    set((state) => ({
      isLocked: false,
      activeAccount: account,
      allAccounts: accounts,
      currentView: (account || accounts.length > 0) ? 'DASHBOARD' : 'GENERATE_MNEMONIC_PROMPT', 
      loadingError: null, isLoading: false, isInitialLoading: false,
      dashboardActiveTab: state.dashboardActiveTab || TABS_CONFIG_FOR_STORE[0],
      activeAccountPfpMint: account?.pfpMint || null,
      portfolioChange24h: null, portfolioUsdChange24h: null,
    }));
  },
  lockWallet: () =>
    set({ 
      isLocked: true, currentView: 'LOCKED', activeAccount: null, activeAccountPfpMint: null,
      loadingError: null, isLoading: false,
      viewingAccountSettingsFor: null, viewingTokenDetails: null, viewingNftDetails: null,
      viewingCollectionAddress: null, sendViewInitialToken: null, viewingActivityTransactionDetails: null,
      dashboardActiveTab: TABS_CONFIG_FOR_STORE[0], transactionForConfirmation: null,
      swapSuccessDetails: null, swapErrorDetails: null,
      portfolioChange24h: null, portfolioUsdChange24h: null,
    }),
  setNetworkConfiguration: (network, customRpcUrl) => set({
    network: network,
    customRpcUrl: network === 'custom' ? (customRpcUrl || '') : null,
    portfolioChange24h: null,
    portfolioUsdChange24h: null,
  }),
  setPreferredExplorerId: (explorerId: string) => set({
    preferredExplorerId: SUPPORTED_EXPLORERS.some(e => e.id === explorerId) ? explorerId : DEFAULT_EXPLORER_ID
  }),
  setPriorityFeeLevel: (level) => {
    set({ priorityFeeLevel: level });
    saveToStorage(backgroundConfig.PRIORITY_FEE_SETTING_KEY, level) 
      .catch(() => { /* Failed to save priority fee level */ });
  },
  setSelectedCurrency: (currencyCode) => {
    set({ selectedCurrency: currencyCode, portfolioChange24h: null, portfolioUsdChange24h: null }); 
    saveToStorage(backgroundConfig.CURRENCY_SETTING_KEY, currencyCode)
      .catch(() => { /* Failed to save currency preference */ });
  },
  setSelectedLanguage: (languageCode) => {
    set({ selectedLanguage: languageCode });
    saveToStorage(backgroundConfig.LANGUAGE_SETTING_KEY, languageCode)
      .catch(() => { /* Failed to save language preference */ });
  },
  setActiveAccountPfpMint: (mintAddress) => {
    const activeAccountUuid = get().activeAccount?.uuid;
    if (activeAccountUuid) {
      set(state => ({
        activeAccountPfpMint: mintAddress,
        activeAccount: state.activeAccount ? { ...state.activeAccount, pfpMint: mintAddress } : null,
        allAccounts: state.allAccounts.map(acc =>
          acc.uuid === activeAccountUuid ? { ...acc, pfpMint: mintAddress } : acc
        )
      }));
      
      chrome.runtime.sendMessage(
        {
          action: 'setAccountPfpPreference',
          payload: { accountUuid: activeAccountUuid, pfpMintAddress: mintAddress }
        },
        () => { if (chrome.runtime.lastError) { /* Error persisting PFP preference */ } }
      );
    } else {
      
    }
  },
  setViewAccountSettings: (account) => set({
    viewingAccountSettingsFor: account,
    currentView: account ? 'ACCOUNT_SETTINGS' : 'DASHBOARD' 
  }),
  setViewTokenDetails: (token) => set((state) => ({
    viewingTokenDetails: token,
    currentView: token ? 'TOKEN_DETAILS' : (state.currentView === 'TOKEN_DETAILS' ? 'DASHBOARD' : state.currentView)
  })),
  setViewNftDetails: (nft) => set((state) => ({
    viewingNftDetails: nft,
    currentView: nft ? 'NFT_DETAILS' : (state.currentView === 'NFT_DETAILS' ? 'DASHBOARD' : state.currentView)
  })),
  setViewCollectionAddress: (collectionAddress) => set((state) => {
    let nextView = state.currentView;
    let nextTab = state.dashboardActiveTab;
    if (collectionAddress) { 
        nextView = 'DASHBOARD';
        nextTab = 'Collectibles';
    }
    return {
        viewingCollectionAddress: collectionAddress,
        currentView: nextView,
        dashboardActiveTab: nextTab,
        viewingNftDetails: null, 
    };
  }),
  setSendViewInitialToken: (token) => set({ sendViewInitialToken: token }),
  setViewActivityTransactionDetails: (transaction) => set((state) => ({
    viewingActivityTransactionDetails: transaction,
    currentView: transaction ? 'ACTIVITY_TRANSACTION_DETAILS' : (state.currentView === 'ACTIVITY_TRANSACTION_DETAILS' ? 'DASHBOARD' : state.currentView)
  })),
  setDashboardActiveTab: (tab) => set((state) => ({
    dashboardActiveTab: tab,
    viewingCollectionAddress: tab !== 'Collectibles' ? null : state.viewingCollectionAddress,
  })),
  setTransactionForConfirmation: (details) => set({
    transactionForConfirmation: details,
    currentView: details ? 'CONFIRM_TRANSACTION' : get().currentView, 
  }),
  setSwapSuccess: (details) => set({
    swapSuccessDetails: details,
    currentView: details ? 'SWAP_SUCCESS' : get().currentView,
    transactionForConfirmation: null, 
    swapErrorDetails: null, 
  }),
  setSwapError: (error) => set({
    swapErrorDetails: error,
    currentView: error ? 'SWAP_ERROR' : get().currentView,
    transactionForConfirmation: null, 
    swapSuccessDetails: null, 
  }),
  setPortfolioChange24h: (percentage) => set({ portfolioChange24h: percentage }), 
  setPortfolioUsdChange24h: (absoluteChange) => set({ portfolioUsdChange24h: absoluteChange }),
}));

export const getPreferredExplorer = (): Explorer => {
  const state = useAppStore.getState();
  return SUPPORTED_EXPLORERS.find(e => e.id === state.preferredExplorerId) ||
         SUPPORTED_EXPLORERS.find(e => e.id === DEFAULT_EXPLORER_ID)!; 
};