// src/background/services/currencyConversionService.ts
import { getFromStorage, saveToStorage } from '../../utils/storage';

const API_KEY = import.meta.env.VITE_EXCHANGERATE_API_KEY;
const API_BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`;

const CONVERSION_RATES_CACHE_KEY = 'currencyConversionRates_v1';
const RATES_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // Cache rates for 1 hour

interface ConversionRatesData {
  rates: Record<string, number>; // Rates against USD
  timestamp: number; // When these rates were fetched
}

interface ExchangeRateApiResponse {
  result: string;
  base_code: string;
  conversion_rates: Record<string, number>;
  time_last_update_unix: number;
  // Add other fields as per your chosen API's response structure
}

async function fetchLiveConversionRates(): Promise<Record<string, number> | null> {
  if (!API_KEY) {
    // API key for exchange rates is missing. Cannot fetch live rates.
    return null;
  }

  try {
    const response = await fetch(API_BASE_URL);
    if (!response.ok) {
      // const errorData = await response.text(); // Error data can be logged if necessary
      throw new Error(`Failed to fetch conversion rates: ${response.status}`);
    }
    const data: ExchangeRateApiResponse = await response.json();

    if (data.result === 'success' && data.conversion_rates) {
      // Store the full rates object and the timestamp
      const ratesData: ConversionRatesData = {
        rates: data.conversion_rates,
        timestamp: data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now(),
      };
      await saveToStorage(CONVERSION_RATES_CACHE_KEY, ratesData);
      return ratesData.rates;
    } else {
      // API response error or missing rates
      return null;
    }
  } catch (error) {
    // Error fetching or processing conversion rates
    return null;
  }
}

export async function getConversionRates(): Promise<Record<string, number>> {
  try {
    const cachedData = await getFromStorage<ConversionRatesData>(CONVERSION_RATES_CACHE_KEY);
    if (cachedData && (Date.now() - cachedData.timestamp < RATES_CACHE_TTL_MS)) {
      // Using cached conversion rates.
      return cachedData.rates;
    }
  } catch (error) {
    // Error reading conversion rates from cache.
  }

  // If cache is old, missing, or errored, fetch live rates
  const liveRates = await fetchLiveConversionRates();
  return liveRates || { USD: 1 }; // Fallback to USD if live fetch fails
}

/**
 * Gets the conversion rate from USD to the target currency.
 * @param targetCurrency The target currency code (e.g., "EUR", "JPY").
 * @returns The conversion rate, or 1 if not found or if target is USD.
 */
export async function getUSDToCurrencyRate(targetCurrency: string): Promise<number> {
  if (targetCurrency.toUpperCase() === 'USD') {
    return 1;
  }
  const rates = await getConversionRates();
  // Default to 1 if rate not found (means 1 USD = 1 targetCurrency)
  return rates[targetCurrency.toUpperCase()] || 1;
}