import React, { useState } from 'react';
import { generatePayPalLink, autoConfigureSeller, getSetupProgress, isSetupComplete } from '../lib/autoSetup';

/**
 * Auto-Setup Wizard
 * Guides seller through 3 simple steps — everything else is automatic
 */
export default function AutoSetupWizard({ profile, onComplete }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(profile?.name || '');
  const [paypalEmail, setPaypalEmail] = useState(profile?.paypalEmail || '');
  const [autoShare, setAutoShare] = useState(true);
  const [error, setError] = useState('');

  const progress = getSetupProgress({ name, email: profile?.email, paypalEmail, autoShare });

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      setError('בבקשה הכנסי שם');
      return;
    }
    if (step === 2 && !paypalEmail.includes('@')) {
      setError('בבקשה הכנסי אימייל PayPal תקין');
      return;
    }
    setError('');
    if (step < 3) setStep(step + 1);
  };

  const handleFinish = () => {
    const configured = autoConfigureSeller({
      ...profile,
      name,
      paypalEmail,
      autoShare,
    });
    onComplete(configured);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-6">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>התקנה אוטומטית</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 1: Name */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">מה השם שלך?</h2>
          <p className="text-gray-500 text-sm">השם שלך יופיע בחנות האישית שלך</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: נועה, מיכל, דניאל..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Step 2: PayPal */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">איפה לשלוח לך כסף?</h2>
          <p className="text-gray-500 text-sm">הכנסי את האימייל של PayPal העיסקי שלך</p>
          <input
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="your-paypal@email.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {paypalEmail.includes('@') && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
              ✅ קישור PayPal שלך יהיה:
              <div className="mt-1 font-mono text-xs break-all">
                {generatePayPalLink(paypalEmail)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Auto-share */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">פרסום אוטומטי?</h2>
          <p className="text-gray-500 text-sm">האם שהאתר יפרסם אוטומטית בשבילך?</p>
          <label className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={autoShare}
              onChange={(e) => setAutoShare(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded"
            />
            <div>
              <div className="font-medium">כן, פרסם אוטומטית</div>
              <div className="text-sm text-gray-500">האתר יפרסם פעם ביום בשעה הכי טובה</div>
            </div>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            חזרה
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={handleNext}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            המשך
          </button>
        ) : (
          <button
            onClick={handleFinish}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            סיימתי! 🎉
          </button>
        )}
      </div>
    </div>
  );
}
