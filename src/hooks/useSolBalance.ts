// src/popup/hooks/useSolBalance.ts
import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useSolana } from '../context/SolanaContext';

interface UseSolBalanceReturn {
    solBalance: number | null; // Balance in lamports
    isLoading: boolean;
    error: Error | null;
    fetchBalance: () => Promise<void>; // Function to manually trigger fetch
}

export function useSolBalance(publicKeyString: string | null | undefined): UseSolBalanceReturn {
    const { connection } = useSolana(); // Get connection from Solana context
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchBalance = useCallback(async () => {
        if (!connection || !publicKeyString) {
            // Don't attempt fetch if connection or publicKey is missing.
            setSolBalance(null); // Reset balance if inputs become invalid.
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const publicKey = new PublicKey(publicKeyString); // Validate publicKey string.
            const lamports = await connection.getBalance(publicKey, 'confirmed');
            setSolBalance(lamports);
        } catch (err: any) {
            setError(err instanceof Error ? err : new Error('Failed to fetch balance'));
            setSolBalance(null); // Reset balance on error.
        } finally {
            setIsLoading(false);
        }
    }, [connection, publicKeyString]); // Dependencies for the fetchBalance callback.

    // Effect to fetch balance automatically when publicKeyString or connection changes.
    useEffect(() => {
        fetchBalance();
    }, [fetchBalance]); // fetchBalance is memoized by useCallback, ensuring this effect runs when appropriate.

    return { solBalance, isLoading, error, fetchBalance };
}