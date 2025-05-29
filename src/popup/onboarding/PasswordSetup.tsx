// src/popup/onboarding/PasswordSetup.tsx
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface PasswordSetupProps {
  onPasswordConfirmed: () => void;
}

const PasswordSetup: React.FC<PasswordSetupProps> = ({ onPasswordConfirmed }) => {
  const { t } = useTranslation(); // Initialize useTranslation

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(''); // Error messages will now be translation keys or pre-translated
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); setError(''); };
  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => { setConfirmPassword(e.target.value); setError(''); };

  const handleSetupPassword = async () => {
    setError('');

    if (password !== confirmPassword) {
        setError(t('passwordSetup.errors.passwordsDoNotMatch'));
        return;
    }
    if (password.length < 8) {
        setError(t('passwordSetup.errors.passwordTooShort'));
        return;
    }

    setIsSettingUp(true);

    try {
        chrome.runtime.sendMessage(
            { action: 'initializeWallet', payload: { password } },
            (response) => {
                setIsSettingUp(false);

                if (chrome.runtime.lastError) {
    
                    setError(t('passwordSetup.errors.initializationFailed', { error: chrome.runtime.lastError.message || t('common.communicationError') }));
                    return;
                }

                if (response && response.success) {
                    
                    setPassword('');
                    setConfirmPassword('');
                    setError('');
                    onPasswordConfirmed();
                } else {
                 
                    let errorMessage = t('passwordSetup.errors.setupFailedUnknown', { error: response?.error || t('common.unknownBackgroundError') });
                     if (response?.error?.includes('No secret was staged')) {
                         alert(t('passwordSetup.errors.secretNotStagedAlert')); // Alert for critical flow error
                         // Potentially navigate away or offer restart
                         errorMessage = t('passwordSetup.errors.secretNotStagedDetailed');
                     }
                    setError(errorMessage);
                }
            }
        );
    } catch (err: any) {
        setError(t('passwordSetup.errors.sendRequestFailed', { error: err.message }));
        setIsSettingUp(false);
    }
  };

  const togglePasswordVisibility = () => setIsPasswordVisible(!isPasswordVisible);
  const toggleConfirmPasswordVisibility = () => setIsConfirmPasswordVisible(!isConfirmPasswordVisible);

  return (
    <div className="w-full flex flex-col items-center px-4">
      <div className="w-full max-w-xl bg-[#090f14] border border-[#243B55] rounded-2xl p-10 flex flex-col items-center space-y-8 shadow-md">
        <div className="text-center space-y-4">
          <h1 className="text-3xl text-white font-bold">{t('passwordSetup.title')}</h1>
          <p className="text-lg text-gray-300">
            {t('passwordSetup.descriptionLine1')} <br /> {t('passwordSetup.descriptionLine2')}
          </p>
        </div>

        <div className="w-full flex flex-col space-y-6">
          <div className="relative">
            <input
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder={t('passwordSetup.placeholders.enterPassword')}
              value={password}
              onChange={handlePasswordChange}
              className={`w-full p-4 text-lg bg-gray-800 text-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E61946] ${
                error && password.length > 0 && password.length < 8 ? 'border-red-500' : 'border-gray-600'
              }`}
              disabled={isSettingUp}
              aria-invalid={!!error && (error.includes(t('passwordSetup.errors.passwordTooShort')) || error.includes(t('passwordSetup.errors.passwordsDoNotMatch')))} // Use translated error for comparison
              aria-describedby={error ? "password-error-desc" : undefined}
            />
            <button
              onClick={togglePasswordVisibility}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label={isPasswordVisible ? t('passwordSetup.ariaLabels.hidePassword') : t('passwordSetup.ariaLabels.showPassword')}
              type="button"
            >
              {isPasswordVisible ? (
                <EyeOff className="w-6 h-6" />
              ) : (
                <Eye className="w-6 h-6" />
              )}
            </button>
          </div>

          <div className="relative">
            <input
              type={isConfirmPasswordVisible ? 'text' : 'password'}
              placeholder={t('passwordSetup.placeholders.confirmPassword')}
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              className={`w-full p-4 text-lg bg-gray-800 text-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E61946] ${
                error === t('passwordSetup.errors.passwordsDoNotMatch') ? 'border-red-500' : 'border-gray-600' // Compare with translated error
              }`}
              disabled={isSettingUp}
              aria-invalid={!!error && error.includes(t('passwordSetup.errors.passwordsDoNotMatch'))} // Use translated error
              aria-describedby={error ? "password-error-desc" : undefined}
              onKeyDown={(e) => e.key === 'Enter' && !isSettingUp && password && password === confirmPassword && password.length >= 8 && handleSetupPassword()}
            />
            <button
              onClick={toggleConfirmPasswordVisibility}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label={isConfirmPasswordVisible ? t('passwordSetup.ariaLabels.hideConfirmPassword') : t('passwordSetup.ariaLabels.showConfirmPassword')}
              type="button"
            >
              {isConfirmPasswordVisible ? (
                <EyeOff className="w-6 h-6" />
              ) : (
                <Eye className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {error && <p id="password-error-desc" className="text-red-400 text-center text-md">{error}</p>}

        <button
          onClick={handleSetupPassword}
          className="w-full py-4 text-lg font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSettingUp || !password || password !== confirmPassword || password.length < 8}
        >
          {isSettingUp ? (
             <div className="flex justify-center items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('passwordSetup.buttons.securingWallet')}
            </div>
          ) : t('passwordSetup.buttons.createWallet')}
        </button>
      </div>
    </div>
  );
};

export default PasswordSetup;