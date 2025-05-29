// src/popup/views/settings/ChangePasswordSettings.tsx
import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../../store/appStore';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ChangePasswordSettingsProps {
  onBack: () => void; // Prop is declared but not used as parent SettingsView handles the header/back button
}

const ChangePasswordSettings: React.FC<ChangePasswordSettingsProps> = () => {
  const { t } = useTranslation(); // Initialize useTranslation
  const lockWallet = useAppStore((s) => s.lockWallet);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] = useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const toggleCurrentPasswordVisibility = () => setIsCurrentPasswordVisible(!isCurrentPasswordVisible);
  const toggleNewPasswordVisibility = () => setIsNewPasswordVisible(!isNewPasswordVisible);
  const toggleConfirmPasswordVisibility = () => setIsConfirmPasswordVisible(!isConfirmPasswordVisible);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('changePassword.errors.allFieldsRequired'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.errors.newPasswordsDoNotMatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('changePassword.errors.newPasswordTooShort'));
      return;
    }
    if (newPassword === currentPassword) {
        setError(t('changePassword.errors.newPasswordSameAsCurrent'));
        return;
    }

    setIsLoading(true);

    chrome.runtime.sendMessage(
      {
        action: 'changePassword',
        payload: { currentPassword, newPassword }
      },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          const errorMsg = chrome.runtime.lastError?.message || response?.error || t('changePassword.errors.changeFailedUnknown');
          console.error('Error changing password:', errorMsg);
          setError(errorMsg);
        } else {
          setSuccess(t('changePassword.successMessage'));
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setTimeout(() => {
            lockWallet();
          }, 1500);
        }
      }
    );
  }, [currentPassword, newPassword, confirmPassword, lockWallet, t]);

  const getBorderColor = (field: 'current' | 'new' | 'confirm') => {
      if (!error) return 'border-[#334155]';
      // These checks might need to be more robust if error messages are fully translated and dynamic
      // For now, assuming the English fragments are indicative or using specific keys if errors were key-based
      if (error === t('changePassword.errors.allFieldsRequired') && (
          (field === 'current' && !currentPassword) ||
          (field === 'new' && !newPassword) ||
          (field === 'confirm' && !confirmPassword)
      )) return 'border-red-500';
      if (error === t('changePassword.errors.newPasswordsDoNotMatch') && (field === 'new' || field === 'confirm')) return 'border-red-500';
      if (error === t('changePassword.errors.newPasswordTooShort') && field === 'new') return 'border-red-500';
      if (error === t('changePassword.errors.newPasswordSameAsCurrent') && field === 'new') return 'border-red-500';
      // Assuming 'Current password is incorrect' would be a specific error from backend
      if (error.toLowerCase().includes('current password is incorrect') && field === 'current') return 'border-red-500';
      return 'border-[#334155]';
  };


  return (
    <div className="flex flex-col h-full bg-[#090f14] p-4 text-white">
      {/* The parent SettingsView handles the header including the title and back button */}
      <form onSubmit={handleSubmit} className="flex-grow flex flex-col space-y-4 px-2 overflow-y-auto custom-scrollbar">
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-900/50 border border-green-700 text-green-300 rounded-lg text-center text-sm">
            {success}
          </div>
        )}

        <div className="relative">
          <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300 mb-1">{t('changePassword.labels.currentPassword')}</label>
          <input
            id="currentPassword"
            type={isCurrentPasswordVisible ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t('changePassword.placeholders.currentPassword')}
            required
            className={`w-full p-3 pr-10 bg-[#161E2D] border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 ${getBorderColor('current')}`}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={toggleCurrentPasswordVisibility}
            className="absolute right-3 top-[38px] text-gray-400 hover:text-white"
            aria-label={isCurrentPasswordVisible ? t('passwordSetup.ariaLabels.hidePassword') : t('passwordSetup.ariaLabels.showPassword')} // Reusing
          >
            {isCurrentPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="relative">
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">{t('changePassword.labels.newPassword')}</label>
          <input
            id="newPassword"
            type={isNewPasswordVisible ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('changePassword.placeholders.newPassword')}
            required
            minLength={8}
            className={`w-full p-3 pr-10 bg-[#161E2D] border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 ${getBorderColor('new')}`}
            disabled={isLoading}
          />
           <button
            type="button"
            onClick={toggleNewPasswordVisibility}
            className="absolute right-3 top-[38px] text-gray-400 hover:text-white"
            aria-label={isNewPasswordVisible ? t('passwordSetup.ariaLabels.hidePassword') : t('passwordSetup.ariaLabels.showPassword')} // Reusing
          >
            {isNewPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
           <p className="text-xs text-gray-400 mt-1">{t('changePassword.newPasswordHint')}</p>
        </div>

         <div className="relative">
           <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">{t('changePassword.labels.confirmNewPassword')}</label>
           <input
            id="confirmPassword"
            type={isConfirmPasswordVisible ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('changePassword.placeholders.confirmNewPassword')}
            required
            minLength={8}
            className={`w-full p-3 pr-10 bg-[#161E2D] border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500 ${getBorderColor('confirm')}`}
            disabled={isLoading}
          />
           <button
            type="button"
            onClick={toggleConfirmPasswordVisibility}
            className="absolute right-3 top-[38px] text-gray-400 hover:text-white"
            aria-label={isConfirmPasswordVisible ? t('passwordSetup.ariaLabels.hidePassword') : t('passwordSetup.ariaLabels.showPassword')} // Reusing
          >
            {isConfirmPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8}
            className="w-full py-3 px-4 rounded-lg text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#090f14] focus:ring-blue-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex justify-center items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('changePassword.buttons.changing')}
              </div>
            ) : t('changePassword.buttons.changePassword')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePasswordSettings;