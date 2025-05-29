// src/utils/currencyUtils.ts
import { getUSDToCurrencyRate } from '../background/services/currencyConversionService'; // Adjust path

export async function convertAndFormatFiat(
    usdValue: number | null | undefined,
    targetCurrency: string,
    decimals = 2
): Promise<string> {
    if (usdValue === null || usdValue === undefined) return '...';

    let convertedValue = usdValue;
    if (targetCurrency.toUpperCase() !== 'USD') {
        try {
            const rate = await getUSDToCurrencyRate(targetCurrency);
            convertedValue = usdValue * rate;
        } catch (error) {
          //  console.error(`[CurrencyUtils] Failed to get conversion rate for ${targetCurrency}:`, error);
            // Fallback: display in USD or show an error indicator
            try {
                return new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: 'USD', // Fallback to USD
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }).format(usdValue) + ` (USD - ${targetCurrency} rate unavailable)`;
            } catch (intlErr) {
                return `USD ${usdValue.toFixed(2)} (Rate Error)`;
            }
        }
    }

    // Adjust decimals for JPY or other non-decimal currencies
    const displayDecimals = (targetCurrency.toUpperCase() === 'JPY') ? 0 : decimals;

    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: targetCurrency,
            minimumFractionDigits: displayDecimals,
            maximumFractionDigits: displayDecimals,
        }).format(convertedValue);
    } catch (e) {
       // console.warn(`[CurrencyUtils] Intl.NumberFormat failed for currency ${targetCurrency}:`, e);
        // Fallback for unsupported currency codes by Intl.NumberFormat
        return `${targetCurrency.toUpperCase()} ${convertedValue.toFixed(displayDecimals)}`;
    }
}