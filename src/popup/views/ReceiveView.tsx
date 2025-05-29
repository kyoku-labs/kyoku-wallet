// src/popup/views/ReceiveView.tsx
import React, { useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AccountMetadata } from '../../background/core/keyring/types';
import { ArrowLeft, Copy, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReceiveViewProps {
    activeAccount: AccountMetadata | null;
    onClose: () => void;
}

const truncateAddress = (address: string | undefined, startChars = 8, endChars = 8): string => {
    if (!address) return '...';
    if (address.length <= startChars + endChars + 3) return address;
    return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
};

const ReceiveView: React.FC<ReceiveViewProps> = ({ activeAccount, onClose }) => {
    const { t } = useTranslation(); // t function is initialized
    const [copied, setCopied] = useState(false);
    const address = activeAccount?.publicKey;
    const accountName = activeAccount?.name || t('receiveView.defaultAccountName');

    const handleCopy = useCallback(() => {
        if (!address) return;
        navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(_err => {
           // console.error('Failed to copy address: ', err);
            alert(t('receiveView.errors.copyFailed'));
        });
    }, [address, t]);

    if (!activeAccount || !address) {
       return (
           <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">
               <p className="text-red-500 mb-4">{t('receiveView.noActiveAccount')}</p>
               <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm">
                   {t('buttons.close')}
               </button>
           </div>
       );
    }

    const headerTitle = t('receiveView.headerTitle'); // This should work

    return (
        <div className="flex flex-col h-full bg-[#090f14] text-white">
            {/* Header */}
            <div className="flex items-center justify-center p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
                <button
                  onClick={onClose}
                  className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
                  aria-label={t('common.back')}
                >
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
                  {headerTitle} {/* Ensure this is used */}
                </h2>
            </div>

            {/* Main Content - Scrollable */}
            <div className="flex-grow overflow-y-auto p-4 flex flex-col items-center justify-center custom-scrollbar space-y-6">
                <div className="text-center">
                    <p className="text-lg font-medium text-gray-200">{accountName}</p>
                    <p className="text-xs text-gray-400 font-mono mt-1 break-all">
                        {truncateAddress(address, 10, 10)}
                    </p>
                </div>

                <div className="bg-white p-3 sm:p-4 rounded-xl inline-block shadow-2xl border-2 border-gray-700">
                    <QRCodeSVG
                        value={address}
                        size={192}
                        bgColor={"#ffffff"}
                        fgColor={"#000000"}
                        level={"M"}
                        includeMargin={false}
                    />
                </div>

                <div className="w-full max-w-md text-center space-y-4 px-2">
                    <p className="text-sm text-yellow-300 bg-yellow-900/40 border border-yellow-700 p-3 rounded-lg">
                        <span className="font-semibold">{t('receiveView.importantPrefix')}:</span> {t('receiveView.warningMessage')}
                    </p>

                    <button
                        onClick={handleCopy}
                        className={`w-full py-3 px-4 rounded-lg font-semibold text-base transition-colors duration-150 ease-in-out flex items-center justify-center shadow-md
                                    ${copied
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                    }`}
                        aria-label={copied ? t('common.copied') : t('common.copyAddress')}
                    >
                        {copied ? <CheckCircle size={18} className="mr-2" /> : <Copy size={18} className="mr-2" />}
                        {copied ? t('receiveView.buttons.addressCopied') : t('receiveView.buttons.copyAddress')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReceiveView;