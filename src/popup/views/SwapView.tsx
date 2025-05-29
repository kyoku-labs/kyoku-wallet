// src/popup/views/SwapView.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRightLeft, Settings, Loader2, ChevronDown } from 'lucide-react';
import { useAppStore, AppView, TransactionConfirmationDetails } from '../../store/appStore';
import { TokenInfo } from '../../background/core/keyring/types';
import { usePortfolio } from '../../hooks/usePortfolio';
import TokenSelectModal from './TokenSelectModal';
import { QuoteDetailsForUI } from '../../background/services/swapService';

// Value is used in fetchQuote for API call, linter may not detect this indirect usage.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OUR_PLATFORM_FEE_BPS = 10; // Example: 0.1%

interface SwapViewProps {
  onClose: () => void;
}

const tenPowBigInt = (decimals: number): bigint => {
  if (decimals < 0 || isNaN(decimals)) return BigInt(1);
  if (decimals === 0) return BigInt(1);
  return BigInt('1' + '0'.repeat(decimals));
};

// Skeleton component for the amount display
const AmountSkeleton = () => (
  <span className="inline-block bg-gray-700 rounded-md h-6 w-24 animate-pulse" />
);

interface TokenInputFieldProps {
    label: string;
    token: TokenInfo | null;
    onSelectTokenButtonClick: () => void;
    amount: string;
    onAmountChange: (value: string) => void;
    onMaxClick?: () => void;
    balancePrefix?: string;
    isOutputField?: boolean;
    inputErrorFromParent?: string | null;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    isLoadingAmount?: boolean;
}

const TokenInputField = React.memo(
    ({
      label,
      token,
      onSelectTokenButtonClick,
      amount: parentAmount,
      onAmountChange,
      onMaxClick,
      balancePrefix = "Balance: ",
      isOutputField = false,
      inputErrorFromParent,
      inputRef,
      isLoadingAmount,
    }: TokenInputFieldProps) => {
      const [internalDisplayAmount, setInternalDisplayAmount] = useState(parentAmount);

      useEffect(() => {
        if (isOutputField || parentAmount !== internalDisplayAmount) {
            setInternalDisplayAmount(parentAmount);
        }
      }, [parentAmount, isOutputField, internalDisplayAmount]);

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        if (!isOutputField) {
            setInternalDisplayAmount(newValue);
        }
        onAmountChange(newValue);
      };

      const displayError = inputErrorFromParent;

      return (
        <div className="bg-[#161E2D] p-3 sm:p-4 rounded-lg border border-gray-700/50">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">{label}</span>
            {token && !isOutputField && (
              <span className="text-xs text-gray-400">
                {balancePrefix}
                {(token.balance || 0).toLocaleString(undefined, {
                  maximumFractionDigits:
                    typeof token.decimals === 'number' && token.decimals >= 0
                      ? Math.min(token.decimals, 6)
                      : 2,
                })}
                {onMaxClick && (
                  <button
                    onClick={onMaxClick}
                    className="ml-1.5 text-blue-400 hover:text-blue-300 font-medium"
                  >
                    MAX
                  </button>
                )}
              </span>
            )}
            {isOutputField && <span className="text-xs text-gray-400"> </span>}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center">
              {isOutputField && isLoadingAmount ? (
                <div className="w-full text-xl sm:text-2xl font-medium text-white py-1">
                  <AmountSkeleton />
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={isOutputField ? parentAmount : internalDisplayAmount}
                  onChange={handleChange}
                  readOnly={isOutputField}
                  ref={isOutputField ? undefined : inputRef}
                  className={`w-full text-xl sm:text-2xl font-medium bg-transparent text-white focus:outline-none placeholder-gray-500 ${
                    displayError && !isOutputField ? 'border-b-2 border-red-400' : ''
                  }`}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              )}
              <button
                onClick={onSelectTokenButtonClick}
                className="flex items-center bg-[#2A3447] hover:bg-[#3A4456] text-white font-semibold py-2 px-3 rounded-lg transition-colors text-sm min-w-[100px] sm:min-w-[120px] justify-center"
              >
                {token?.logo && (
                  <img
                    src={token.logo}
                    alt={token.symbol}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full mr-2 object-cover bg-gray-700"
                  />
                )}
                {!token?.logo && token?.symbol && (
                  <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs mr-2 flex-shrink-0">
                    {token.symbol.charAt(0)}
                  </span>
                )}
                <span className="truncate flex-grow text-left">{token?.symbol || 'Select'}</span>
                <ChevronDown size={16} className="ml-1 opacity-70 flex-shrink-0" />
              </button>
            </div>
            {displayError && !isOutputField && (
              <div className="text-red-400 text-xs mt-1">{displayError}</div>
            )}
          </div>
        </div>
      );
    },
    (prevProps, nextProps) => {
      return (
        prevProps.token?.address === nextProps.token?.address &&
        prevProps.amount === nextProps.amount &&
        prevProps.isOutputField === nextProps.isOutputField &&
        prevProps.label === nextProps.label &&
        prevProps.balancePrefix === nextProps.balancePrefix &&
        prevProps.inputErrorFromParent === nextProps.inputErrorFromParent &&
        prevProps.isLoadingAmount === nextProps.isLoadingAmount
      );
    }
);

const SwapView: React.FC<SwapViewProps> = React.memo(({ onClose }) => {
  const { activeAccount, setTransactionForConfirmation } = useAppStore();
  const { portfolio: userPortfolio, isLoading: isLoadingUserPortfolio } = usePortfolio();

  const [jupiterTokens, setJupiterTokens] = useState<TokenInfo[]>([]);
  const [isLoadingJupiterTokens, setIsLoadingJupiterTokens] = useState(true);

  const [inputToken, setInputToken] = useState<TokenInfo | null>(null);
  const [outputToken, setOutputToken] = useState<TokenInfo | null>(null);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);

  const [quote, setQuote] = useState<QuoteDetailsForUI | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [_slippageBps, _setSlippageBps] = useState<number>(50);
  const slippageBps = _slippageBps;

  const [isSubmittingSwap, setIsSubmittingSwap] = useState(false);

  const [showInputTokenModal, setShowInputTokenModal] = useState(false);
  const [showOutputTokenModal, setShowOutputTokenModal] = useState(false);

  const quoteRequestIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // console.log('SwapView re-rendered');
  });

  useEffect(() => {
    setIsLoadingJupiterTokens(true);
    chrome.runtime.sendMessage({ action: 'getJupiterTokenListRequest' }, (response) => {
      setIsLoadingJupiterTokens(false);
      if (response?.success && Array.isArray(response.data)) {
        const mappedTokens: TokenInfo[] = response.data.map((jt: any) => ({
          address: jt.address, name: jt.name, symbol: jt.symbol,
          decimals: typeof jt.decimals === 'number' ? jt.decimals : 0,
          logo: jt.logoURI, balance: 0, balanceLamports: BigInt(0),
          isNative: jt.address === 'So11111111111111111111111111111111111111112',
        }));
        setJupiterTokens(mappedTokens);
      } else {
        console.error("Failed to fetch Jupiter token list:", response?.error);
        setJupiterTokens([]);
      }
    });
  }, []);

  useEffect(() => {
    if (!inputToken && userPortfolio && userPortfolio.length > 0) {
      const solToken = userPortfolio.find(t => t.isNative) || userPortfolio[0];
      setInputToken(solToken);
    }
    if (!outputToken && jupiterTokens.length > 0 && userPortfolio) {
      const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      
      let defaultOutput = userPortfolio.find(t => t.address === usdcMint && t.address !== inputToken?.address);

      if (!defaultOutput) {
          defaultOutput = jupiterTokens.find(t => t.address === usdcMint && t.address !== inputToken?.address);
      }
      
      if (!defaultOutput) {
        defaultOutput = jupiterTokens.find(t => !t.isNative && t.address !== inputToken?.address) || jupiterTokens.find(t => t.address !== inputToken?.address);
      }
      setOutputToken(defaultOutput || null);
    }
  }, [userPortfolio, jupiterTokens, inputToken, outputToken]);
  
  const getTokenWithBalance = useCallback((tokenAddress: string): TokenInfo | null => {
    const userToken = userPortfolio?.find(t => t.address === tokenAddress);
    if (userToken) return userToken;
    
    const jupiterToken = jupiterTokens.find(t => t.address === tokenAddress);
    return jupiterToken || null;
  }, [userPortfolio, jupiterTokens]);

  const handleInputAmountChange = useCallback((value: string) => {
    setInputAmount(value);
    if (value && !/^\d*\.?\d*$/.test(value) && value !== '.' && !/^\d+\.$/.test(value)) {
        setInputError('Please enter a valid number (e.g., 123.45)');
    } else {
        const numericValue = parseFloat(value);
        if (inputToken && typeof inputToken.balance === 'number' && numericValue > inputToken.balance) {
            setInputError('Amount exceeds available balance.');
        } else {
            setInputError(null);
        }
    }
  }, [inputToken]);

  const handlePercentageSelect = useCallback((percentage: number) => {
    if (inputToken && typeof inputToken.balance === 'number' && inputToken.balance > 0) {
        const calculatedAmount = inputToken.balance * percentage;
        const displayDecimals = inputToken.decimals ? Math.min(inputToken.decimals, 8) : 6;
        let amountStr = calculatedAmount.toFixed(displayDecimals);
        amountStr = parseFloat(amountStr).toString();
        handleInputAmountChange(amountStr);
    }
  }, [inputToken, handleInputAmountChange]);


  const fetchQuote = useCallback(async (requestId: number) => {
    if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0 || inputError) {
      setQuote(null);
      setQuoteError(inputError ? null : "Invalid input to fetch quote.");
      setIsLoadingQuote(false);
      return;
    }
    setIsLoadingQuote(true);
    setQuoteError(null);

    try {
      if (isNaN(parseFloat(inputAmount))) {
        if (requestId === quoteRequestIdRef.current) {
            setQuoteError("Invalid input amount.");
            setIsLoadingQuote(false);
        }
        return;
      }
      const inputDecimals = typeof inputToken.decimals === 'number' ? inputToken.decimals : 0;
      const parts = inputAmount.split('.');
      const integerPart = BigInt(parts[0] || '0');
      const decimalPartStr = (parts[1] || '').padEnd(inputDecimals, '0').slice(0, inputDecimals);
      const decimalPart = BigInt(decimalPartStr || '0');
      const amountInSmallestUnit = (integerPart * tenPowBigInt(inputDecimals) + decimalPart).toString();

      chrome.runtime.sendMessage(
        { action: 'getSwapQuoteRequest',
          payload: {
            inputMint: inputToken.address,
            outputMint: outputToken.address,
            amount: amountInSmallestUnit,
            slippageBps,
            platformFeeBps: OUR_PLATFORM_FEE_BPS.toString()
          },
        },
        (response) => {
          if (requestId === quoteRequestIdRef.current) {
            setIsLoadingQuote(false);
            if (response?.success && response.data) {
              setQuote(response.data as QuoteDetailsForUI); setQuoteError(null);
            } else {
              setQuoteError(response?.error || "Failed to fetch quote. Try adjusting amount or pair."); setQuote(null);
            }
          }
        }
      );
    } catch (error) {
      if (requestId === quoteRequestIdRef.current) {
        setIsLoadingQuote(false); setQuoteError("Error preparing quote request. Check input values.");
        console.error("Error in fetchQuote preparation:", error);
      }
    }
  }, [inputToken, outputToken, inputAmount, slippageBps, inputError]);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0 || inputError) {
      setQuote(null);
      if (!inputError) setQuoteError(null);
      setIsLoadingQuote(false); return;
    }
    setIsLoadingQuote(true); setQuoteError(null);
    debounceTimerRef.current = setTimeout(() => {
      const requestId = ++quoteRequestIdRef.current;
      fetchQuote(requestId);
    }, 500);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [inputToken, outputToken, inputAmount, fetchQuote, inputError]);

  // EDITED LOGIC: This function now clears the input field upon swapping tokens.
  const handleSwapTokens = () => {
    const tempInputToken = inputToken;
    const tempOutputToken = outputToken;

    const newOutputToken = tempInputToken;
    const newInputToken = tempOutputToken ? getTokenWithBalance(tempOutputToken.address) : null;

    setInputToken(newInputToken);
    setOutputToken(newOutputToken);

    // Clear the input field for the new amount, per user request.
    handleInputAmountChange('');
    
    // Reset the quote details.
    setQuote(null);
    setQuoteError(null);
  };

  const handleMaxAmount = () => {
    if (inputToken) {
      handleInputAmountChange(inputToken.balance.toString());
    }
  };

  const handleExecuteSwap = async () => {
    if (!quote || !inputToken || !outputToken || !activeAccount || inputError) {
      setQuoteError(inputError || "Missing necessary information to execute swap.");
      return;
    }
    setIsSubmittingSwap(true); setQuoteError(null);
    chrome.runtime.sendMessage(
      { action: 'executeSwapRequest', payload: { userPublicKey: activeAccount.publicKey, originalQuoteResponse: quote.originalQuoteResponse, }, },
      (response) => {
        setIsSubmittingSwap(false);
        if (response?.success && response.data?.swapTransaction) {
          const outputDec = typeof outputToken.decimals === 'number' ? outputToken.decimals : 0;
          const confirmationDetails: TransactionConfirmationDetails = {
            serializedTransaction: response.data.swapTransaction, lastValidBlockHeight: response.data.lastValidBlockHeight,
            sourceView: 'SWAP_VIEW' as AppView,
            dappInfo: { name: "Kyoku Wallet Swap", origin: "Kyoku Wallet", icon: "/icons/kyoku-logo.png" },
            actionContext: {
              type: 'swap', inputTokenSymbol: inputToken.symbol, inputTokenAmount: inputAmount,
              outputTokenSymbol: outputToken.symbol,
              outputTokenAmount: quote.displayOutAmountNetUser && outputDec >= 0 ? (Number(BigInt(quote.displayOutAmountNetUser)) / Math.pow(10, outputDec)).toString() : undefined,
            },
          };
          setTransactionForConfirmation(confirmationDetails);
        } else {
          setQuoteError(response?.error || "Failed to get swap transaction from Jupiter.");
        }
      }
    );
  };

  const derivedOutputAmount = useMemo(() => {
    if (quote && outputToken && typeof outputToken.decimals === 'number' && outputToken.decimals >= 0) {
      const netAmount = BigInt(quote.displayOutAmountNetUser);
      const divisor = tenPowBigInt(outputToken.decimals);
      if (divisor === BigInt(0)) return netAmount.toString();
      const fullNumber = Number(netAmount) / Number(divisor);
      return fullNumber.toLocaleString(undefined, { maximumFractionDigits: Math.min(outputToken.decimals, 6) });
    } return "";
  }, [quote, outputToken]);

  const showOutputSkeleton = isLoadingQuote && !quote;
  const userPortfolioTokens = useMemo(() => userPortfolio || [], [userPortfolio]);
  const allAvailableTokensForModal = useMemo(() => {
    const tokenMap = new Map<string, TokenInfo>();
    (userPortfolio || []).forEach(t => tokenMap.set(t.address, t));
    jupiterTokens.forEach(jt => {
      if (!tokenMap.has(jt.address)) { tokenMap.set(jt.address, jt);
      } else {
        const userToken = tokenMap.get(jt.address)!;
        if (!userToken.logo && jt.logo) tokenMap.set(jt.address, { ...userToken, logo: jt.logo });
        if (userToken.balance !== undefined && userToken.balance !== null) tokenMap.set(jt.address, { ...tokenMap.get(jt.address)!, balance: userToken.balance, balanceLamports: userToken.balanceLamports });
      }
    });
    return Array.from(tokenMap.values());
  }, [userPortfolio, jupiterTokens]);

  if (isLoadingUserPortfolio || (isLoadingJupiterTokens && (!inputToken || !outputToken))) {
    return ( <div className="flex flex-col h-full bg-[#090f14] text-gray-200 items-center justify-center"> <Loader2 size={32} className="animate-spin text-blue-400" /> <p className="mt-3 text-sm">Loading Swap Interface...</p> </div> );
  }

  const QuoteInfoRow = ({ label, value, valueClass = "text-gray-200" }: { label: string; value: string | React.ReactNode; valueClass?: string }) => (
    <div className="flex justify-between items-center text-xs py-1"> <span className="text-gray-400">{label}:</span> <span className={`font-medium ${valueClass} truncate`} title={typeof value === 'string' ? value : undefined}> {value} </span> </div> );

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10" aria-label="Close Swap"> <ArrowLeft size={20} /> </button>
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"> Swap Tokens </h2>
        <button onClick={() => alert("Swap settings placeholder")} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md absolute right-4 top-1/2 transform -translate-y-1/2 z-10" aria-label="Swap Settings"> <Settings size={18} /> </button>
      </div>

      <div className="flex-grow overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 custom-scrollbar">
        <TokenInputField
          label="You Pay" token={inputToken} onSelectTokenButtonClick={() => setShowInputTokenModal(true)}
          amount={inputAmount} onAmountChange={handleInputAmountChange} onMaxClick={handleMaxAmount}
          inputErrorFromParent={inputError} inputRef={inputRef} />

        {inputToken && typeof inputToken.balance === 'number' && inputToken.balance > 0 && (
            <div className="flex justify-end space-x-2 -mt-2 sm:-mt-1 mr-1">
                {[0.25, 0.50, 0.75].map((percentage) => (
                    <button
                        key={percentage}
                        onClick={() => handlePercentageSelect(percentage)}
                        className="px-2.5 py-1 text-xs bg-[#2A3447] text-blue-300 hover:bg-[#3A4456] rounded-md transition-colors"
                        aria-label={`Use ${percentage * 100}% of balance`}
                    >
                        {percentage * 100}%
                    </button>
                ))}
            </div>
        )}


        <div className="flex justify-center items-center my-1 sm:my-2">
          <button onClick={handleSwapTokens} className="p-2 bg-[#161E2D] border border-gray-700/50 rounded-full text-blue-400 hover:bg-[#2A3447] hover:text-blue-300 transition-colors" aria-label="Swap input and output tokens" > <ArrowRightLeft size={18} /> </button>
        </div>

        <TokenInputField
          label="You Receive (Estimated)" token={outputToken} onSelectTokenButtonClick={() => setShowOutputTokenModal(true)}
          amount={derivedOutputAmount} onAmountChange={() => {}} isOutputField={true}
          inputErrorFromParent={null} isLoadingAmount={showOutputSkeleton} />

        {(isLoadingQuote || quote || quoteError) && !showOutputSkeleton && (
          <div className="bg-[#161E2D] p-3 sm:p-4 rounded-lg border border-gray-700/50 mt-3 sm:mt-4 text-xs space-y-1.5">
            {isLoadingQuote && !quote && ( <div className="flex items-center justify-center py-4 text-gray-400"> <Loader2 size={20} className="animate-spin mr-2" /> Fetching best price... </div> )}
            {quoteError && !isLoadingQuote && ( <p className="text-red-400 text-center py-2">{quoteError}</p> )}
            {quote && !isLoadingQuote && !quoteError && inputToken && outputToken && typeof inputToken.decimals === 'number' && typeof outputToken.decimals === 'number' && inputToken.decimals >= 0 && outputToken.decimals >= 0 && (
              <>
                <QuoteInfoRow label="Rate" value={ BigInt(quote.originalQuoteResponse.inAmount) > 0 && BigInt(quote.originalQuoteResponse.outAmount) > 0 ? `1 ${inputToken.symbol || 'TKN1'} ≈ ${(Number(BigInt(quote.originalQuoteResponse.outAmount) * tenPowBigInt(inputToken.decimals)) / Number(BigInt(quote.originalQuoteResponse.inAmount) * tenPowBigInt(outputToken.decimals))).toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${outputToken.symbol || 'TKN2'}` : 'N/A' } />
                <QuoteInfoRow label="Price Impact" value={`${parseFloat(quote.originalQuoteResponse.priceImpactPct).toFixed(4)}%`} valueClass={parseFloat(quote.originalQuoteResponse.priceImpactPct) > 1 ? 'text-yellow-400' : parseFloat(quote.originalQuoteResponse.priceImpactPct) > 0.1 ? 'text-orange-400' : 'text-green-400'}/>
                <QuoteInfoRow label="Minimum Received" value={`${(Number(BigInt(quote.originalQuoteResponse.otherAmountThreshold)) / Number(tenPowBigInt(outputToken.decimals))).toLocaleString(undefined, { maximumFractionDigits: Math.min(outputToken.decimals, 9) })} ${outputToken.symbol || ''}`} />
                <QuoteInfoRow label="Route" value={quote.originalQuoteResponse.routePlan?.map((r: any) => r.swapInfo.label).join(' → ') || 'Direct'} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 border-t border-[#243B55] flex-shrink-0">
        <button
          onClick={handleExecuteSwap}
          disabled={!quote || isLoadingQuote || isSubmittingSwap || !!quoteError || !inputAmount || parseFloat(inputAmount) <= 0 || !!inputError}
          className="w-full py-3 px-4 rounded-lg text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isSubmittingSwap ? <Loader2 size={20} className="animate-spin mr-2" /> : null}
          {isLoadingQuote && !quote ? 'Fetching Quote...' : isSubmittingSwap ? 'Processing Swap...' : quoteError ? 'Error Getting Quote' : 'Review Swap'}
        </button>
      </div>

      <TokenSelectModal
        isOpen={showInputTokenModal} onClose={() => setShowInputTokenModal(false)}
        onSelectToken={(token) => { if (token.address === outputToken?.address) { handleSwapTokens(); } else { setInputToken(token); } setQuote(null); setShowInputTokenModal(false); }}
        userTokens={userPortfolioTokens} allTokens={allAvailableTokensForModal.filter(t => t.address !== outputToken?.address)}
        isLoadingTokens={isLoadingUserPortfolio || isLoadingJupiterTokens} currentSelectionLabel="input" />
      <TokenSelectModal
        isOpen={showOutputTokenModal} onClose={() => setShowOutputTokenModal(false)}
        onSelectToken={(token) => { if (token.address === inputToken?.address) { handleSwapTokens(); } else { setOutputToken(token); } setQuote(null); setShowOutputTokenModal(false); }}
        userTokens={userPortfolioTokens} allTokens={allAvailableTokensForModal.filter(t => t.address !== inputToken?.address)}
        isLoadingTokens={isLoadingUserPortfolio || isLoadingJupiterTokens} currentSelectionLabel="output" />
    </div>
  );
});

export default SwapView;