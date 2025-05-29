import React, { createContext, useContext, useMemo, ReactNode, useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { useAppStore, NetworkOption } from '../store/appStore'; 
import { useQueryClient } from '@tanstack/react-query';
import { getRpcEndpoint } from '../utils/networkUtils'; 

interface SolanaContextType {
  connection: Connection | null;
  cluster: NetworkOption; // Use NetworkOption type from store
  endpoint: string; // Also provide the endpoint URL used
  networkChanged: boolean; // Add this to track network changes
  resetNetworkChanged: () => void; // Function to reset the change flag
}

const SolanaContext = createContext<SolanaContextType>({
  connection: null,
  cluster: 'mainnet-beta',
  // *** Use utility for default endpoint ***
  endpoint: getRpcEndpoint('mainnet-beta', null),
  networkChanged: false,
  resetNetworkChanged: () => {}, // Default no-op function
});

interface SolanaProviderProps {
  children: ReactNode;
}

export const SolanaProvider: React.FC<SolanaProviderProps> = ({ children }) => {
  // Read network settings directly from Zustand store
  const { network, customRpcUrl } = useAppStore();
  const queryClient = useQueryClient(); // Add QueryClient

  // State to hold the connection object and derived endpoint/cluster
  const [connection, setConnection] = useState<Connection | null>(null);
  const [derivedEndpoint, setDerivedEndpoint] = useState<string>('');
  const [derivedCluster, setDerivedCluster] = useState<NetworkOption>('mainnet-beta');
  const [networkChanged, setNetworkChanged] = useState<boolean>(false);

  // Reset function for the network changed flag
  const resetNetworkChanged = () => {
    setNetworkChanged(false);
  };

  // Effect to update connection when network settings change in the store
  useEffect(() => {
  //  console.log(`[SolanaProvider] Network changed in store: ${network}, Custom URL: ${customRpcUrl}`);
    // *** USE the imported utility function ***
    const newEndpoint = getRpcEndpoint(network, customRpcUrl);

    // Update state only if the endpoint actually changes
    if (newEndpoint !== derivedEndpoint) {
     // console.log(`[SolanaProvider] Endpoint changed from ${derivedEndpoint} to ${newEndpoint}. Creating new connection.`);
      setDerivedEndpoint(newEndpoint);
      setDerivedCluster(network);
      setNetworkChanged(true); // Set flag to indicate network has changed

      try {
        const newConnection = new Connection(newEndpoint, 'confirmed');
        setConnection(newConnection); // Update connection state
     //   console.log(`[SolanaProvider] New connection created for ${newEndpoint}`);

        // Invalidate all relevant queries when network changes
        queryClient.invalidateQueries({ queryKey: ['portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['nfts'] });
        // Add other query keys if needed
      } catch (error) {
      //  console.error("SolanaProvider: Failed to create new connection:", error);
        setConnection(null); // Set connection to null on error
      }
    } else {
   //   console.log(`[SolanaProvider] Endpoint unchanged (${newEndpoint}), reusing existing connection.`);
    }

  }, [network, customRpcUrl, derivedEndpoint, queryClient]); // Add queryClient to dependencies

  // --- Provide the connection, cluster type, endpoint and network change flag ---
  const value = useMemo<SolanaContextType>(() => ({
    connection, // Use the state variable
    cluster: derivedCluster, // Use the state variable
    endpoint: derivedEndpoint, // Use the state variable
    networkChanged, // Provide the network change flag
    resetNetworkChanged, // Provide reset function
  }), [connection, derivedCluster, derivedEndpoint, networkChanged]); // Include networkChanged in deps

  return (
    <SolanaContext.Provider value={value}>
      {children}
    </SolanaContext.Provider>
  );
};

// Custom hook remains the same
export const useSolana = (): SolanaContextType => {
  const context = useContext(SolanaContext);
  if (context === undefined) {
    throw new Error('useSolana must be used within a SolanaProvider');
  }
  return context;
};
