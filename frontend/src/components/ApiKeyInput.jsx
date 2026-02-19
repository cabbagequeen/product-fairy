import { useState } from 'react';

export default function ApiKeyInput({ apiKey, onKeyChange, disabled }) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Step 1: Enter API Key
        </h2>
        <a
          href="https://ai.google.dev/gemini-api/docs/api-key"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
        >
          Get your API key
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder="Enter your Gemini API key"
          disabled={disabled}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed pr-20"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
        >
          {showKey ? 'Hide' : 'Show'}
        </button>
      </div>

      <p className="mt-2 text-sm text-gray-500">
        Your API key is only used for this session and is not stored.
      </p>
    </div>
  );
}
