// src/popup/onboarding/FundedAccountSelector.tsx
import React, { useState, useMemo } from 'react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useTranslation } from 'react-i18next';

interface DerivedAccountInfo {
    publicKey: string;
    derivationPath: string;
    balance: number; // Balance in Lamports
}

interface FundedAccountSelectorProps {
    accounts: DerivedAccountInfo[];
    onConfirmSelection: (selectedPaths: string[]) => void;
    onCancel: () => void; // onCancel is still a prop, though the button is removed.
                         // It might be used by the parent if this component is conditionally rendered.
}

const formatBalance = (lamports: number): string => {
    const sol = lamports / LAMPORTS_PER_SOL;
    return sol.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 9 });
};

const truncateAddress = (address: string, chars = 6): string => {
    if (!address) return '';
    if (address.length <= chars * 2 + 3) return address;
    return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
};

const FundedAccountSelector: React.FC<FundedAccountSelectorProps> = ({
    accounts,
    onConfirmSelection,
}) => {
    const { t } = useTranslation();

    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => {
        if (accounts.length === 1) return new Set([accounts[0].derivationPath]);
        if (accounts.length > 1 && accounts[0]?.balance > 0) return new Set([accounts[0].derivationPath]);
        return new Set();
    });

    const handleCheckboxChange = (path: string, checked: boolean) => {
        setSelectedPaths(prev => {
            const next = new Set(prev);
            if (checked) next.add(path);
            else next.delete(path);
            return next;
        });
    };

    const handleConfirm = () => {
        onConfirmSelection(Array.from(selectedPaths));
    };

    const hasFundedAccounts = useMemo(() => accounts.some(acc => acc.balance > 0), [accounts]);

    return (
        <div className="w-full flex flex-col items-center justify-center px-4 py-8 text-white">
            {/* Changed background and border to match other onboarding components for a "transparent" feel */}
            <div className="w-full max-w-2xl bg-[#090f14] p-6 md:p-10 rounded-2xl shadow-lg flex flex-col space-y-6 border border-[#243B55]">
                {/* Modified header: Removed back button, centered title */}
                <div className="flex items-center justify-center mb-2 relative h-7"> {/* Added relative and fixed height for better alignment */}
                    <h2 className="text-xl font-bold text-white text-center">{t('fundedAccountSelector.title')}</h2>
                </div>

                <p className="text-base text-gray-400 text-center mb-4 px-4">
                    {hasFundedAccounts
                        ? t('fundedAccountSelector.descriptionWithFunds')
                        : t('fundedAccountSelector.descriptionWithoutFunds')}
                </p>

                <div className="flex-grow space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-[50vh]">
                    {accounts.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">{t('fundedAccountSelector.noAccountsToDisplay')}</p>
                    ) : (
                        accounts.map((account) => (
                            <div
                                key={account.derivationPath}
                                className="flex items-center justify-between p-3 bg-[#243B55] rounded-lg border border-gray-700 hover:border-blue-500 cursor-pointer transition-colors"
                                onClick={() => handleCheckboxChange(account.derivationPath, !selectedPaths.has(account.derivationPath))}
                            >
                                <div className="flex items-center space-x-3 flex-shrink min-w-0 mr-2">
                                    <input
                                        type="checkbox"
                                        id={`account-${account.publicKey}`}
                                        checked={selectedPaths.has(account.derivationPath)}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            handleCheckboxChange(account.derivationPath, e.target.checked)
                                        }}
                                        className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-[#E61946] focus:ring-offset-gray-800 flex-shrink-0"
                                    />
                                    <div className="overflow-hidden">
                                        <label
                                            htmlFor={`account-${account.publicKey}`}
                                            className="font-medium text-white block cursor-pointer truncate"
                                        >
                                            {t('fundedAccountSelector.accountNamePrefix')} {parseInt(account.derivationPath.split('/')[3] ?? '0', 10) + 1} ({truncateAddress(account.publicKey)})
                                        </label>
                                        <span className="text-xs text-gray-400 block truncate">{account.derivationPath}</span>
                                    </div>
                                </div>
                                <span className={`text-sm font-mono whitespace-nowrap ${account.balance > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                                    {formatBalance(account.balance)} SOL
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-auto pt-4">
                    <button
                        onClick={handleConfirm}
                        disabled={selectedPaths.size === 0}
                        className={`w-full py-3 rounded-lg text-lg font-semibold transition ${
                            selectedPaths.size > 0
                                ? 'bg-green-500 hover:bg-green-600 text-black'
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {t('fundedAccountSelector.importButton', { count: selectedPaths.size })}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FundedAccountSelector;