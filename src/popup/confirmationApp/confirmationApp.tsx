import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Loader2, EyeOff as EyeOffIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import HeaderBar from './components/HeaderBar';
import TransactionSummaryDisplay from './components/TransactionSummaryDisplay';
import ActionButtonsRow from './components/ActionButtonsRow';
import {
    parseSignInMessage,
    verifySignInMessage,
    ParsedSignInMessage,
    SignInMessageErrorType,
} from '../../utils/solanaSignInUtils';

import type {
    DetailedTransactionPreview,
    SimulationAlert as BackgroundSimulationAlert,
} from '../../background/shared/simulationParser';

const POPUP_RESPONSE_ACTION_TYPE = 'KYOKU_POPUP_RESPONSE';

export type SimulationAlertProp = BackgroundSimulationAlert;

export interface PopupAccountMetadata {
    uuid: string;
    name: string;
    publicKey: string;
    isViewOnly: boolean;
}

interface UrlParams {
    requestId: string | null;
    interactionType: 'connect' | 'signTransaction' | 'signAllTransactions' | 'signMessage' | string | null;
    dappOrigin: string | null;
    dappTitle: string | null | undefined;
    dappIcon: string | null | undefined;
    isWalletLocked: boolean;
    sessionDataKey?: string | null;
}

type ConfirmationStep = 'loading' | 'password' | 'approve_connect' | 'approve_sign' | 'error' | 'processing_unlock' | 'fetching_data' | 'view_only_error' | 'simulation_failed';

interface StoredSignMessageData {
    messageBytes: number[];
    displayFormat: 'utf8' | 'hex';
    reqOrigin?: string | null | undefined;
    dappTitle?: string | null | undefined;
    dappIcon?: string | null | undefined;
}

interface StoredSessionData {
    transactionBytes?: number[];
    simulationPreview?: DetailedTransactionPreview;
    sendOptions?: any;
    transactionsToSign?: Array<{ type: string; data: number[] }>;
    individualPreviews?: DetailedTransactionPreview[];
    aggregatedPreview?: DetailedTransactionPreview;
    overallSimulationSuccess?: boolean;
    firstSimulationError?: string;
    reqOrigin?: string | null | undefined;
    dappTitle?: string | null | undefined;
    dappIcon?: string | null | undefined;
}

const ConfirmationApp: React.FC = () => {
    const { t } = useTranslation();

    const [urlParams, setUrlParams] = useState<UrlParams | null>(null);
    const [currentStep, setCurrentStep] = useState<ConfirmationStep>('loading');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allAvailableAccounts, setAllAvailableAccounts] = useState<PopupAccountMetadata[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<PopupAccountMetadata | null>(null);
    const [showAccountSelector, setShowAccountSelector] = useState(false);
    const [showDetailedView, setShowDetailedView] = useState(false);
    const accountSelectorRef = useRef<HTMLDivElement | null>(null);
    const accountSelectorTriggerRef = useRef<HTMLButtonElement | null>(null);
    const [stagedSignMessageData, setStagedSignMessageData] = useState<StoredSignMessageData | null>(null);
    const [stagedSessionData, setStagedSessionData] = useState<StoredSessionData | null>(null);
    const [hasBeenUnlockedInPopup, setHasBeenUnlockedInPopup] = useState(false);
    const [_parsedSignInData, setParsedSignInData] = useState<ParsedSignInMessage | null>(null);
    const [signInVerificationIssues, setSignInVerificationIssues] = useState<{
        errors: SignInMessageErrorType[];
        warnings: SignInMessageErrorType[];
    }>({ errors: [], warnings: [] });

    const interactionRequiresSigning = useCallback(() => {
        return urlParams?.interactionType === 'signMessage' ||
               urlParams?.interactionType === 'signTransaction' ||
               urlParams?.interactionType === 'signAllTransactions';
    }, [urlParams]);

    const fetchAllAccounts = useCallback(() => {
        chrome.runtime.sendMessage({ action: 'getAccountsMetadata' }, (response) => {
            if (chrome.runtime.lastError || !response?.success) {
                console.error("Failed to fetch all accounts:", response?.error);
                setAllAvailableAccounts([]); setSelectedAccount(null);
            } else {
                const popupAccounts: PopupAccountMetadata[] = (response.accounts || []).map((acc: any) => ({
                    uuid: acc.uuid, name: acc.name, publicKey: acc.publicKey, isViewOnly: !!acc.isViewOnly,
                }));
                setAllAvailableAccounts(popupAccounts);
                let newSelected = popupAccounts.find(acc => acc.publicKey === response.activeAccount?.publicKey) || null;
                if (newSelected && interactionRequiresSigning() && newSelected.isViewOnly) {
                    newSelected = popupAccounts.find(acc => !acc.isViewOnly) || newSelected;
                } else if (!newSelected && popupAccounts.length > 0) {
                    newSelected = interactionRequiresSigning() ? popupAccounts.find(acc => !acc.isViewOnly) || popupAccounts[0] : popupAccounts[0];
                }
                setSelectedAccount(newSelected);
            }
        });
    }, [interactionRequiresSigning]);

    const decodeMessageContentStable = useCallback((data: StoredSignMessageData | null): string => {
        if (!data?.messageBytes || !Array.isArray(data.messageBytes)) return t('confirmationApp.errors.messageDataUnavailable');
        try {
            const bytes = Uint8Array.from(data.messageBytes);
            if (data.displayFormat === 'utf8') return new TextDecoder().decode(bytes);
            else if (data.displayFormat === 'hex') return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
            return t('confirmationApp.errors.unknownDisplayFormat');
        } catch (e) { console.error("Error decoding message:", e); return t('confirmationApp.errors.errorDecodingMessage'); }
    }, [t]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const currentUrlParams: UrlParams = {
            requestId: params.get('requestId'),
            interactionType: params.get('interactionType') as UrlParams['interactionType'],
            dappOrigin: params.get('dappOrigin'),
            dappTitle: params.get('dappTitle') || params.get('dappOrigin'),
            dappIcon: params.get('dappIcon'),
            isWalletLocked: params.get('isWalletLocked') === 'true',
            sessionDataKey: params.get('sessionDataKey'),
        };
        setUrlParams(currentUrlParams);

        if (!currentUrlParams.requestId || !currentUrlParams.interactionType) {
            setError(t('confirmationApp.errors.invalidRequestParams'));
            setCurrentStep('error');
            return;
        }

        const fetchAndProceed = (dataKey: string, type: string, lockedFromUrl: boolean) => {
            setCurrentStep('fetching_data');
            chrome.storage.session.get(dataKey, (result) => {
                if (chrome.runtime.lastError) {
                    setError(t('confirmationApp.errors.failedToRetrieveStagedData', { error: chrome.runtime.lastError.message }));
                    setCurrentStep('error'); return;
                }
                const payload = result[dataKey];
                if (!payload) {
                    setError(t('confirmationApp.errors.requiredDataNotFound', { requestId: currentUrlParams.requestId }));
                    setCurrentStep('error'); return;
                }

                if (type === 'signMessage') {
                    setStagedSignMessageData(payload as StoredSignMessageData);
                    if (lockedFromUrl && !hasBeenUnlockedInPopup) {
                        setCurrentStep('password');
                    } else {
                        fetchAllAccounts();
                        setCurrentStep('approve_sign');
                    }
                } else if (type === 'signTransaction' || type === 'signAllTransactions') {
                    const txData = payload as StoredSessionData;
                    setStagedSessionData(txData);
                    const simFailed = (type === 'signTransaction' && !txData.simulationPreview?.simulationSuccess) ||
                                      (type === 'signAllTransactions' && !txData.aggregatedPreview?.simulationSuccess);
                    if (simFailed) {
                        const simErrorMsg = type === 'signTransaction'
                            ? txData.simulationPreview?.simulationError
                            : txData.aggregatedPreview?.simulationError;
                        setError(simErrorMsg || t('confirmationApp.errors.simulationFailedUnknown'));
                        setCurrentStep('simulation_failed');
                    } else if (lockedFromUrl && !hasBeenUnlockedInPopup) {
                        setCurrentStep('password');
                    } else {
                        fetchAllAccounts();
                        setCurrentStep('approve_sign');
                    }
                }
            });
        };

        if (['signMessage', 'signTransaction', 'signAllTransactions'].includes(currentUrlParams.interactionType!)) {
            if (!currentUrlParams.sessionDataKey) {
                setError(t('confirmationApp.errors.sessionDataKeyMissing'));
                setCurrentStep('error'); return;
            }
            if (!currentUrlParams.isWalletLocked || hasBeenUnlockedInPopup) {
                fetchAndProceed(currentUrlParams.sessionDataKey, currentUrlParams.interactionType!, currentUrlParams.isWalletLocked);
            } else {
                setCurrentStep('password');
            }
        } else if (currentUrlParams.interactionType === 'connect') {
            if (currentUrlParams.isWalletLocked && !hasBeenUnlockedInPopup) {
                setCurrentStep('password');
            } else {
                fetchAllAccounts();
                setCurrentStep('approve_connect');
            }
        } else {
            setError(t('confirmationApp.errors.unsupportedInteractionType', { type: currentUrlParams.interactionType }));
            setCurrentStep('error');
        }
    }, [hasBeenUnlockedInPopup, t]);

    useEffect(() => {
        if (selectedAccount?.isViewOnly && interactionRequiresSigning() && (currentStep === 'approve_sign' || currentStep === 'approve_connect')) {
            setCurrentStep('view_only_error');
        } else if (currentStep === 'view_only_error' && (!selectedAccount?.isViewOnly || !interactionRequiresSigning())) {
            setCurrentStep(interactionRequiresSigning() ? 'approve_sign' : 'approve_connect');
        }
    }, [selectedAccount, interactionRequiresSigning, currentStep]);

    useEffect(() => {
        if (currentStep === 'approve_sign' && urlParams?.interactionType === 'signMessage' && stagedSignMessageData && selectedAccount && urlParams.dappOrigin) {
            const messageString = decodeMessageContentStable(stagedSignMessageData);
            const parsed = parseSignInMessage(messageString);
            setParsedSignInData(parsed);
            if (parsed) {
                const verificationIssues = verifySignInMessage(parsed, urlParams.dappOrigin, selectedAccount.publicKey);
                const critical: SignInMessageErrorType[] = []; const warnings: SignInMessageErrorType[] = [];
                verificationIssues.forEach(issue => {
                    switch (issue) {
                        case SignInMessageErrorType.DOMAIN_MISMATCH: case SignInMessageErrorType.URI_MISMATCH:
                        case SignInMessageErrorType.EXPIRED: case SignInMessageErrorType.NOT_YET_VALID:
                        case SignInMessageErrorType.INVALID_DOMAIN_FORMAT: case SignInMessageErrorType.INVALID_URI_FORMAT:
                        case SignInMessageErrorType.INVALID_ISSUED_AT_FORMAT: case SignInMessageErrorType.INVALID_EXPIRATION_TIME_FORMAT:
                        case SignInMessageErrorType.INVALID_NOT_BEFORE_FORMAT: case SignInMessageErrorType.EXPIRES_BEFORE_ISSUANCE:
                        case SignInMessageErrorType.EXPIRES_BEFORE_NOT_BEFORE: case SignInMessageErrorType.UNEXPECTED_PARSING_ERROR:
                            critical.push(issue); break;
                        default: warnings.push(issue); break;
                    }
                });
                setSignInVerificationIssues({ errors: critical, warnings });
            } else setSignInVerificationIssues({ errors: [], warnings: [] });
        } else { setParsedSignInData(null); setSignInVerificationIssues({ errors: [], warnings: [] });}
    }, [currentStep, urlParams, stagedSignMessageData, selectedAccount, decodeMessageContentStable]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (accountSelectorRef.current && !accountSelectorRef.current.contains(event.target as Node) &&
                accountSelectorTriggerRef.current && !accountSelectorTriggerRef.current.contains(event.target as Node)) {
                setShowAccountSelector(false);
            }
        }
        if (showAccountSelector) document.addEventListener("mousedown", handleClickOutside);
        else document.removeEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showAccountSelector]);

    const sendResponseToBackground = useCallback((approved: boolean, responseDetails?: any) => {
        if (!urlParams?.requestId) { setError(t('confirmationApp.errors.missingRequestId')); setCurrentStep('error'); return; }
        const finalResponseDetails = selectedAccount ? { ...responseDetails, activeAccountPublicKey: selectedAccount.publicKey } : responseDetails;
        setIsSubmitting(true);
        chrome.runtime.sendMessage({ type: POPUP_RESPONSE_ACTION_TYPE, data: { requestId: urlParams.requestId, approved, ...finalResponseDetails }}, 
        (ackResponse) => {
            setIsSubmitting(false);
            if (chrome.runtime.lastError) console.error("ConfirmationApp: Error sending response:", chrome.runtime.lastError.message);
            else console.log("ConfirmationApp: Response sent.", ackResponse);
            setTimeout(() => window.close(), 100);
        });
    }, [urlParams, selectedAccount, t]);

    const handlePasswordSubmit = useCallback(async () => {
        setError(null); setIsSubmitting(true);
        if (!password) { setError(t('confirmationApp.errors.passwordEmpty')); setIsSubmitting(false); return; }

        chrome.runtime.sendMessage({ action: 'unlockWallet', payload: { password } }, (unlockResponse) => {
            setIsSubmitting(false);
            if (chrome.runtime.lastError || !unlockResponse?.success) {
                setError(chrome.runtime.lastError?.message || unlockResponse?.error || t('confirmationApp.errors.unlockFailed'));
                setPassword('');
            } else {
                setHasBeenUnlockedInPopup(true); 
            }
        });
    }, [password, t]);

    const handleApprove = useCallback(() => {
        if (!selectedAccount) { setError(t('confirmationApp.errors.noAccountSelected')); setCurrentStep('error'); return; }
        if (selectedAccount.isViewOnly && interactionRequiresSigning()) {
            setCurrentStep('view_only_error'); return;
        }
        if (urlParams?.interactionType === 'signTransaction' && stagedSessionData?.simulationPreview && !stagedSessionData.simulationPreview.simulationSuccess) {
            setError(t('confirmationApp.errors.cannotApproveSimFailed', { error: stagedSessionData.simulationPreview.simulationError || "" }));
            setCurrentStep('simulation_failed'); return;
        }
        if (urlParams?.interactionType === 'signAllTransactions' && stagedSessionData && !stagedSessionData.aggregatedPreview?.simulationSuccess) {
            setError(t('confirmationApp.errors.cannotApproveBatchSimFailed', { error: stagedSessionData.aggregatedPreview?.simulationError || "" }));
            setCurrentStep('simulation_failed'); return;
        }
        sendResponseToBackground(true, { activeAccountPublicKey: selectedAccount.publicKey });
    }, [selectedAccount, sendResponseToBackground, interactionRequiresSigning, urlParams, stagedSessionData, t]);

    const handleReject = useCallback((reasonKey?: string, reasonMessage?: string) => {
        const finalReason = reasonKey ? t(reasonKey) : (reasonMessage || t('confirmationApp.userRejected'));
        sendResponseToBackground(false, { error: finalReason });
    }, [sendResponseToBackground, t]);
    
    const accountsForDropdown = allAvailableAccounts.filter(acc => {
        if (interactionRequiresSigning()) return !acc.isViewOnly;
        return true;
    });
    
    const isApproveActionDisabled = !selectedAccount ||
        (selectedAccount.isViewOnly && interactionRequiresSigning()) ||
        (urlParams?.interactionType === 'signMessage' && signInVerificationIssues.errors.length > 0) ||
        (urlParams?.interactionType === 'signTransaction' && !stagedSessionData?.simulationPreview?.simulationSuccess) ||
        (urlParams?.interactionType === 'signAllTransactions' && !stagedSessionData?.aggregatedPreview?.simulationSuccess);

    // --- RENDER LOGIC ---
    if (currentStep === 'loading' || currentStep === 'fetching_data' || !urlParams) {
        return ( 
            <div className="flex flex-col items-center justify-center h-full text-white bg-[#090f14] p-4 space-y-3"> 
                <Loader2 className="animate-spin h-10 w-10 text-blue-400" /> 
                <p>{currentStep === 'fetching_data' ? t('confirmationApp.analyzingTransaction') : t('confirmationApp.loadingRequest')}</p> 
            </div> 
        );
    }
    if (currentStep === 'error') {
        return ( 
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-4 text-center text-white bg-[#090f14]"> 
                <AlertTriangle size={48} className="text-red-500" /> 
                <h2 className="text-xl font-bold text-red-400">{t('confirmationApp.requestErrorTitle')}</h2> 
                <p className="text-gray-300 bg-red-900/30 border border-red-700 p-3 rounded-md max-w-xs break-words text-sm"> 
                    {error || t('confirmationApp.errors.unexpectedError')} 
                </p> 
                <button 
                    onClick={() => handleReject('confirmationApp.errors.popupClosedAfterError')} 
                    className="mt-4 px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg text-white font-semibold text-base"
                > 
                    {t('buttons.close')} 
                </button> 
            </div> 
        );
    }

    const getDisplayableDappInfo = () => {
        let origin = urlParams!.dappOrigin || t('dAppInfoCard.unknownDApp');
        let dappName = urlParams!.dappTitle || origin;
        let icon = urlParams!.dappIcon || "/icons/kyoku-logo.png";

        const sessionDataSource: StoredSessionData | StoredSignMessageData | null = 
            urlParams!.interactionType === 'signMessage' ? stagedSignMessageData : stagedSessionData;
        
        if (sessionDataSource) {
            origin = sessionDataSource.reqOrigin || origin;
            dappName = sessionDataSource.dappTitle || dappName;
            icon = sessionDataSource.dappIcon || icon;
        }
        return { displayedDappOrigin: origin, displayedDappTitle: dappName, displayedDappIcon: icon };
    };

    if (currentStep === 'simulation_failed') {
        const { displayedDappOrigin: _simFailDappOrigin, displayedDappTitle: simFailDappTitle } = getDisplayableDappInfo();
        return ( 
            <div className="flex flex-col h-full p-3 space-y-3 text-white bg-[#090f14] pb-16"> 
                <HeaderBar title={t('confirmationApp.titles.transactionPreviewFailed')} /> 
                <div className="text-center text-sm text-gray-300">{simFailDappTitle}</div>
                <div className="flex flex-col items-center justify-center text-center flex-grow"> 
                    <AlertTriangle size={48} className="text-red-500 mb-3" /> 
                    <h3 className="text-xl font-semibold text-red-400 mb-2">{t('confirmationApp.simulationFailedTitle')}</h3> 
                    <p className="text-sm text-gray-300 bg-red-900/30 border border-red-700 p-3 rounded-md max-w-xs break-words"> 
                        {error || t('confirmationApp.errors.simulationFailedRecommendNotProceed')}
                    </p> 
                </div> 
                <div className="space-y-1 border-t border-gray-700 bg-[#090f14] absolute bottom-0 left-0 right-0 p-2"> 
                    <ActionButtonsRow 
                        onReject={() => handleReject('confirmationApp.userRejectedAfterSimFailure')}
                        onApprove={handleApprove} 
                        isSubmitting={isSubmitting} 
                        approveButtonText={isSubmitting ? t('common.processing') : t('buttons.approveAnywayRisky')}
                        isApproveDisabled={false} 
                    /> 
                </div> 
            </div> 
        );
    }

    if (currentStep === 'password') {
        const dappNameForDisplay = urlParams.dappTitle || urlParams.dappOrigin; 
        return ( 
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 text-white bg-[#090f14] pb-16"> 
                <img 
                    src={urlParams.dappIcon || "/icons/kyoku-logo.png"} 
                    alt={t('dAppInfoCard.altIconText')} 
                    className="w-16 h-16 rounded-lg mb-1 border-2 border-gray-700 object-cover bg-gray-800 shadow-md" 
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/icons/kyoku-logo.png"; }} 
                /> 
                <h2 className="text-xl font-semibold text-center">{t('confirmationApp.unlockWalletTitle')}</h2> 
                <p className="text-sm text-gray-300 text-center max-w-xs"> 
                    <Trans
        i18nKey="confirmationApp.unlockToApproveRequest"
        values={{ dappName: dappNameForDisplay }}
        components={{ 1: <span className="font-semibold text-gray-100" /> }} // Or any other styling you want for the dApp name
    />
                </p> 
                <div className="w-full max-w-sm"> 
                    <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => { setPassword(e.target.value); setError(null); }} 
                        placeholder={t('confirmationApp.placeholders.enterPassword')} 
                        className="w-full px-4 py-3 bg-[#161E2D] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm" 
                        onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && password && handlePasswordSubmit()} 
                        disabled={isSubmitting} 
                        autoFocus 
                    /> 
                    {error && <p className="text-xs text-red-400 mt-2 text-center">{error}</p>} 
                </div> 
                <div className="w-full max-w-sm absolute bottom-0 left-0 right-0 p-2 border-t border-gray-700 bg-[#090f14]"> 
                    <ActionButtonsRow 
                        onReject={() => handleReject('confirmationApp.userRejectedUnlock')} 
                        onApprove={handlePasswordSubmit} 
                        isSubmitting={isSubmitting} 
                        approveButtonText={isSubmitting ? t('confirmationApp.unlockingButton') : t('buttons.unlock')} 
                        isApproveDisabled={!password} 
                    /> 
                </div> 
            </div> 
        );
    }
    if (currentStep === 'view_only_error') {
        return ( 
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-4 text-center text-white bg-[#090f14] pb-16"> 
                <EyeOffIcon size={48} className="text-orange-400" /> 
                <h2 className="text-xl font-bold text-orange-300">{t('confirmationApp.actionNotAllowedTitle')}</h2> 
                <p className="text-gray-300 max-w-xs text-sm"> 
                    {t('confirmationApp.viewOnlyCannotSign', { accountName: selectedAccount?.name, accountKey: selectedAccount?.publicKey.substring(0,6) })} 
                </p> 
                {accountsForDropdown.length > 0 ? ( 
                    <p className="text-gray-400 text-xs">{t('confirmationApp.selectDifferentAccountOrReject')}</p> 
                ) : ( 
                    <p className="text-gray-400 text-xs">{t('confirmationApp.noOtherAccountsForAction')}</p> 
                )} 
                <div className="w-full max-w-sm absolute bottom-0 left-0 right-0 p-2 border-t border-gray-700 bg-[#090f14]"> 
                    <ActionButtonsRow 
                        onReject={() => handleReject('confirmationApp.operationCancelledViewOnly')} 
                        onApprove={() => { 
                            if (accountsForDropdown.length > 0) { 
                                setSelectedAccount(accountsForDropdown[0]); 
                                setCurrentStep(interactionRequiresSigning() ? 'approve_sign' : 'approve_connect'); 
                            } 
                        }} 
                        isSubmitting={false} 
                        approveButtonText={accountsForDropdown.length > 0 ? t('buttons.changeAccount') : t('buttons.ok')} 
                        isApproveDisabled={accountsForDropdown.length === 0} 
                    /> 
                </div> 
            </div> 
        );
    }

    const isConnectInteraction = urlParams.interactionType === 'connect'; 
    let mainPageTitleKey = 'confirmationApp.titles.approveTransaction';
    if (isConnectInteraction) mainPageTitleKey = 'confirmationApp.titles.connectionRequest';
    else if (urlParams.interactionType === 'signMessage') mainPageTitleKey = 'confirmationApp.titles.signMessage';
    else if (urlParams.interactionType === 'signAllTransactions') mainPageTitleKey = 'confirmationApp.titles.approveMultipleTransactions';

    const mainPageTitle = t(mainPageTitleKey, { count: stagedSessionData?.individualPreviews?.length || 0 });

    const { displayedDappTitle } = getDisplayableDappInfo();

    return (
        <div className="flex flex-col h-full text-white bg-[#090f14]">
            {/* Header and DApp Title - Fixed */}
            <div className="p-2 space-y-1 sticky top-0 z-10 bg-[#090f14]">
                <HeaderBar title={mainPageTitle} />
                <div className="text-center text-sm text-gray-300">{displayedDappTitle}</div>
            </div>

            {/* Main Transaction Details Section - Scrollable with Hidden Scrollbar */}
            <div className="flex-grow overflow-y-auto hide-scrollbar px-4 pt-2 pb-24">
                {isConnectInteraction && selectedAccount && (
                    <div className="text-sm text-gray-300 p-2 rounded-lg bg-[#161E2D] border border-gray-700">
                        {t('confirmationApp.connectAllowApp')}
                        <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                            <li>{t('confirmationApp.connectViewAddress')}: <br />
                                <strong className="text-gray-200 font-mono text-xs break-all">
                                    {selectedAccount.name} ({selectedAccount.publicKey ? `${selectedAccount.publicKey.substring(0, 6)}...${selectedAccount.publicKey.substring(selectedAccount.publicKey.length - 6)}` : t('common.loading')})
                                    {selectedAccount.isViewOnly && <span className="text-orange-400 text-xs ml-1">({t('common.viewOnly')})</span>}
                                </strong>
                            </li>
                            <li>{t('confirmationApp.connectRequestApproval')}</li>
                        </ul>
                    </div>
                )}
                {urlParams.interactionType === 'signMessage' && stagedSignMessageData && (
                    <div className="p-2 rounded-lg bg-[#161E2D] border border-gray-700 space-y-1 text-sm">
                        <p className="text-xs text-gray-400 mb-1">{t('confirmationApp.messageLabel', { format: stagedSignMessageData.displayFormat || 'utf8' })}:</p>
                        <div className="bg-[#0c131e] p-2 rounded border-gray-600/50 text-xs font-mono break-words text-gray-300">
                            {decodeMessageContentStable(stagedSignMessageData)}
                        </div>
                    </div>
                )}
                {(urlParams.interactionType === 'signTransaction' && stagedSessionData?.simulationPreview) && (
                    <TransactionSummaryDisplay 
                        simulationPreview={stagedSessionData.simulationPreview} 
                        suppressOwnErrorDisplay={false} 
                    />
                )}
                {(urlParams.interactionType === 'signAllTransactions' && stagedSessionData?.aggregatedPreview && stagedSessionData?.individualPreviews) && (
                    <div className="space-y-2">
                        {/* Aggregated or Detailed View */}
                        {!showDetailedView ? (
                            <div className="p-2 rounded-lg bg-[#161E2D] border border-gray-700">
                                <div className="text-gray-300 font-medium text-sm mb-1">
                                    {t('confirmationApp.aggregatedTransactionSummary', { count: stagedSessionData.individualPreviews.length })}
                                    {stagedSessionData.aggregatedPreview.simulationSuccess ? (
                                        stagedSessionData.aggregatedPreview.feePayerAssetChanges.length > 0 ? (
                                            ` (${t('confirmationApp.assetChangesCount', { count: stagedSessionData.aggregatedPreview.feePayerAssetChanges.length })})`
                                        ) : (
                                            ` (${t('confirmationApp.noDirectAssetChanges')})`
                                        )
                                    ) : (
                                        ` (${t('confirmationApp.simulationFailedLabel')})`
                                    )}
                                </div>
                                <TransactionSummaryDisplay
                                    simulationPreview={stagedSessionData.aggregatedPreview}
                                    suppressOwnErrorDisplay={false}
                                />
                            </div>
                        ) : (
                            stagedSessionData.individualPreviews.map((preview, txIndex) => (
                                <div key={txIndex} className="p-2 rounded-lg bg-[#161E2D] border border-gray-700">
                                    <div className="text-gray-300 font-medium text-sm mb-1">
                                        {t('confirmationApp.transactionNumber', { number: txIndex + 1 })}
                                        {preview.simulationSuccess ? (
                                            preview.feePayerAssetChanges.length > 0 ? (
                                                ` (${t('confirmationApp.assetChangesCount', { count: preview.feePayerAssetChanges.length })})`
                                            ) : (
                                                ` (${t('confirmationApp.noDirectAssetChanges')})`
                                            )
                                        ) : (
                                            ` (${t('confirmationApp.simulationFailedLabel')})`
                                        )}
                                    </div>
                                    <TransactionSummaryDisplay
                                        simulationPreview={preview}
                                        suppressOwnErrorDisplay={false}
                                    />
                                </div>
                            ))
                        )}
                        {/* Toggle Button - Styled as Dropdown */}
                        <div className="flex justify-center py-4">
                            <button
                                onClick={() => setShowDetailedView(!showDetailedView)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1A2533] text-white text-sm font-medium rounded-lg border border-gray-600 hover:bg-[#2A3543] hover:border-gray-500 transition-colors duration-200 shadow-sm"
                            >
                                {showDetailedView ? (
                                    <>
                                        <span>{t('confirmationApp.hideDetails')}</span>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                    </>
                                ) : (
                                    <>
                                        <span>{t('confirmationApp.showDetails')}</span>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Section - Fixed at Bottom */}
            <div className="space-y-1 border-t border-gray-700 bg-[#090f14] absolute bottom-0 left-0 right-0 p-2 z-10">
                {(urlParams.interactionType === 'signTransaction' || urlParams.interactionType === 'signAllTransactions') && (
                    <div className="p-1 rounded-lg bg-[#161E2D] border border-gray-700 text-sm">
                        <p className="text-xs text-orange-400">{t('confirmationApp.transactionApprovalCautionMessage')}</p>
                    </div>
                )}
                <ActionButtonsRow
                    onReject={() => handleReject('confirmationApp.userRejected')} 
                    onApprove={handleApprove} 
                    isSubmitting={isSubmitting}
                    approveButtonText={isSubmitting ? t('common.processing') : (isConnectInteraction ? t('buttons.connect') : t('buttons.approve'))}
                    isApproveDisabled={isApproveActionDisabled}
                />
            </div>
        </div>
    );
};
export default ConfirmationApp;