// src/popup/onboarding/MnemonicSetup.tsx
import React, { useState, useEffect, useRef } from 'react';
import { CryptoUtils } from '../../utils/cryptoutils';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface MnemonicSetupProps {
  onMnemonicVerified: (mnemonic: string, isImport: boolean) => void;
  importMode: boolean;
}

type MnemonicStage = 'display' | 'confirm' | 'import_input';

const MnemonicSetup: React.FC<MnemonicSetupProps> = ({ onMnemonicVerified, importMode }) => {
  const { t } = useTranslation(); // Initialize useTranslation

  const [stage, setStage] = useState<MnemonicStage>(importMode ? 'import_input' : 'display');
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string[]>([]);
  const [confirmationMnemonic, setConfirmationMnemonic] = useState<string[]>(Array(12).fill(''));
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const wordCount = confirmationMnemonic.length;
    inputRefs.current = inputRefs.current.slice(0, wordCount);
    while (inputRefs.current.length < wordCount) {
      inputRefs.current.push(null);
    }
    if ((stage === 'confirm' || stage === 'import_input') && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [stage, confirmationMnemonic.length]);

  useEffect(() => {
    if (!importMode && stage === 'display') {
      try {
        const newMnemonic = CryptoUtils.generateMnemonicPhrase();
        setGeneratedMnemonic(newMnemonic.split(' '));
        setConfirmationMnemonic(Array(newMnemonic.split(' ').length).fill(''));
      } catch (err) {
        setError(t('mnemonicSetup.errors.generationFailed'));
      }
    }
  }, [importMode, stage, t]);

  const handleCopyToClipboard = async () => {
    const phrase = generatedMnemonic.join(' ');
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(t('mnemonicSetup.errors.copyFailed'));
    }
  };

  const handleDownloadMnemonic = () => {
    const phrase = generatedMnemonic.join(' ');
    const blob = new Blob([phrase], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = t('mnemonicSetup.downloadFilename');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasConfirmedSave(e.target.checked);
    if (error) setError(null);
  };

  const handleProceedToConfirm = () => {
    if (!hasConfirmedSave) {
      setError(t('mnemonicSetup.errors.confirmSaveRequired'));
      return;
    }
    setError(null);
    setStage('confirm');
  };

  const handleConfirmationInputChange = (index: number, value: string) => {
    const cleanedValue = value.toLowerCase().replace(/[^a-z\s]/g, '').trimStart();
    const newMnemonic = [...confirmationMnemonic];
    newMnemonic[index] = cleanedValue.trimEnd();
    setConfirmationMnemonic(newMnemonic);
    if (error) setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
     if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
        const currentWord = confirmationMnemonic[index]?.trim();
        if (currentWord) {
             e.preventDefault();
             if (index < confirmationMnemonic.length - 1) {
                 inputRefs.current[index + 1]?.focus();
             }
        } else if (e.key === 'Tab') {
             return;
        } else {
             e.preventDefault();
        }
    }
    if (e.key === 'Backspace' && confirmationMnemonic[index]?.trim() === '') {
        if (index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement> | null, pastedText: string, startIndex: number) => {
    if (e) e.preventDefault();
    const words = pastedText.toLowerCase().trim().split(/\s+/);
    const expectedWordCount = (words.length === 24 || words.length === 12) ? words.length : 12;
    const newMnemonic = Array(expectedWordCount).fill('');
    words.forEach((word, index) => {
      if (index < expectedWordCount) {
        newMnemonic[index] = word.replace(/[^a-z]/g, '');
      }
    });
    setConfirmationMnemonic(newMnemonic);
    setError(null);
    const nextEmptyIndex = newMnemonic.findIndex((w, i) => i >= startIndex && !w);
    if (nextEmptyIndex !== -1) {
        setTimeout(() => inputRefs.current[nextEmptyIndex]?.focus(), 0);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
          handlePaste(null, text, 0);
      }
    } catch (err) {
      setError(t('mnemonicSetup.errors.pasteFailed'));
    }
  };

  const handleVerifyMnemonic = () => {
    setError(null);
    const enteredPhrase = confirmationMnemonic.map(w => w.trim().toLowerCase()).join(' ');
    if (confirmationMnemonic.some(word => word.trim() === '')) {
      setError(t('mnemonicSetup.errors.allWordsRequired', { count: confirmationMnemonic.length }));
      return;
    }
    if (!CryptoUtils.isValidMnemonic(enteredPhrase)) {
      const actualWordCount = enteredPhrase.split(' ').length;
       if (actualWordCount !== 12 && actualWordCount !== 24) {
         setError(t('mnemonicSetup.errors.invalidWordCount', { count: actualWordCount }));
       } else {
        setError(t('mnemonicSetup.errors.invalidPhrase'));
      }
      return;
    }
    if (importMode) {
      onMnemonicVerified(enteredPhrase, true);
    } else {
      const originalPhrase = generatedMnemonic.join(' ');
      if (enteredPhrase === originalPhrase) {
        onMnemonicVerified(originalPhrase, false);
      } else {
        setError(t('mnemonicSetup.errors.phraseMismatch'));
      }
    }
  };

  const isConfirmInputComplete = confirmationMnemonic.every(word => word.trim() !== '');

  if (!importMode && stage === 'display' && generatedMnemonic.length === 0) {
    return <div className="text-center text-gray-400 p-6">{t('mnemonicSetup.generatingPhrase')}</div>;
  }

  const getHeaderText = () => {
    if (stage === 'confirm') return { title: t('mnemonicSetup.headers.confirm.title'), desc: t('mnemonicSetup.headers.confirm.description') };
    if (stage === 'import_input') return { title: t('mnemonicSetup.headers.import.title'), desc: t('mnemonicSetup.headers.import.description', { count: confirmationMnemonic.length }) };
    return { title: t('mnemonicSetup.headers.display.title'), desc: t('mnemonicSetup.headers.display.description') };
  };
  const headerText = getHeaderText();

  return (
    <div className="w-full flex flex-col items-center space-y-6 p-8 bg-secondary-background text-main-text rounded-xl">
      <div className="text-center mb-4">
        <h2 className="text-3xl font-bold text-main-text mb-2">{headerText.title}</h2>
        <p className="text-lg text-gray-400">{headerText.desc}</p>
      </div>

      {stage === 'display' && !importMode && (
        <div className="flex flex-col items-center space-y-8 w-full max-w-4xl">
          <p className="text-lg text-yellow-300 bg-yellow-900/30 border border-yellow-700 rounded p-6 text-center">
            <strong className="font-semibold">{t('mnemonicSetup.importantWarning.title')}</strong> {t('mnemonicSetup.importantWarning.message')}
          </p>
          <div className="grid grid-cols-3 gap-8 w-full p-8 py-10 bg-deep-blue rounded-xl border border-deep-blue-lighter min-h-[300px]">
            {generatedMnemonic.map((word, index) => (
              <div key={index} className="flex items-center bg-soft-navy p-4 h-16 rounded text-2xl">
                <span className="text-gray-400 font-mono mr-3 w-8 text-right text-xl">{index + 1}.</span>
                <span className="font-semibold">{word}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-6 w-full">
            <button onClick={handleCopyToClipboard} className="flex-1 py-4 px-6 rounded-md text-lg font-medium text-white bg-[#E63946] hover:bg-[#cc2f3d]">
              {copied ? t('mnemonicSetup.buttons.copied') : t('mnemonicSetup.buttons.copy')}
            </button>
            <button onClick={handleDownloadMnemonic} className="flex-1 py-4 px-6 bg-[#E63946] hover:bg-[#cc2f3d] text-white rounded-md text-lg font-medium">
              {t('mnemonicSetup.buttons.download')}
            </button>
          </div>

          <div className="w-full bg-deep-blue p-6 rounded flex items-center text-lg">
            <input
              type="checkbox"
              id="confirm-save"
              checked={hasConfirmedSave}
              onChange={handleCheckboxChange}
              className="w-6 h-6 mr-4"
            />
            <label htmlFor="confirm-save" className="text-gray-300">
              {t('mnemonicSetup.confirmSaveCheckboxLabel')}
            </label>
          </div>

          {error && <p className="text-red-400 text-md text-center w-full">{error}</p>}

          <button
            onClick={handleProceedToConfirm}
            disabled={!hasConfirmedSave}
            className={`w-full py-4 rounded-md font-medium text-white ${!hasConfirmedSave ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {t('mnemonicSetup.buttons.nextConfirm')}
          </button>
        </div>
      )}

      {(stage === 'confirm' || stage === 'import_input') && (
        <div className="w-full flex flex-col items-center space-y-8 max-w-4xl">
          <div className="w-full grid grid-cols-3 gap-8">
            {confirmationMnemonic.map((word, index) => (
              <div key={index} className="relative">
                <div className="flex items-center">
                  <span className="text-gray-400 text-lg mr-2">{index + 1}.</span>
                  <input
                    ref={(el) => { if (inputRefs.current) inputRefs.current[index] = el; }}
                    type="text"
                    value={word}
                    onChange={(e) => handleConfirmationInputChange(index, e.target.value)}
                    onPaste={(e) => handlePaste(e, e.clipboardData.getData('text'), index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className="w-full bg-transparent border-b border-gray-600 pb-2 text-main-text focus:border-main-accent focus:outline-none font-mono text-xl"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    aria-label={t('mnemonicSetup.ariaLabels.wordInput', { number: index + 1 })}
                  />
                </div>
              </div>
            ))}
          </div>

          <button onClick={handlePasteFromClipboard} className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-semibold transition-colors shadow-sm active:bg-blue-500">
            {t('mnemonicSetup.buttons.pastePhrase')}
          </button>

          {error && <p className="text-red-400 text-md text-center w-full">{error}</p>}

          <button
            id="verify-button"
            onClick={handleVerifyMnemonic}
            disabled={!isConfirmInputComplete}
            className={`w-full py-4 rounded-md font-medium text-white ${!isConfirmInputComplete ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {importMode ? t('mnemonicSetup.buttons.importWallet') : t('mnemonicSetup.buttons.verifyAndContinue')}
          </button>
        </div>
      )}
    </div>
  );
};

export default MnemonicSetup;