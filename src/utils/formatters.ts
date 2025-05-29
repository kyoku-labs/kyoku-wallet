// src/utils/formatters.ts

/**
 * Helper function to format token balances safely and consistently.
 */
export function formatTokenBalance(balance: number | null | undefined, decimals: number = 4): string {
    // Handle null, undefined, NaN cases
    if (balance === undefined || balance === null || isNaN(balance)) return '...';
    // Handle zero case
    if (balance === 0) return '0';
  
    try {
      // Determine display precision based on input decimals, capped for readability
      const displayDecimals = Math.min(Math.max(0, decimals), 9);
  
      // Show very small balances more clearly
      // Example: 0.0000001 with 6 decimals -> < 0.000001
      const minValue = 1 / Math.pow(10, displayDecimals);
      if (balance > 0 && balance < minValue) {
        return `< 0.${'0'.repeat(displayDecimals - 1)}1`;
      }
  
      // Format using locale string for better readability (e.g., thousands separators)
      return balance.toLocaleString(undefined, { // Use default locale
        minimumFractionDigits: 0, // Avoid trailing zeros like 1.0000 if possible
        maximumFractionDigits: 4
      });
    } catch (error) {
     // console.error("[formatTokenBalance] Error formatting token balance:", error);
      return balance.toString(); // Fallback to simple string conversion on error
    }
  }
  
  // Add other formatting functions here later if needed (e.g., formatCurrency, formatDate)