import { useState } from 'react';

/**
 * Shopify connection form with client credentials (OAuth 2.0 client_credentials grant).
 * Includes a collapsible setup wizard that walks users through creating a Shopify app.
 * The backend handles the token exchange transparently.
 */
export default function ShopifyConnect({
  storeUrl,
  onStoreUrlChange,
  clientId,
  onClientIdChange,
  clientSecret,
  onClientSecretChange,
  onConnectionChange,
  isConnected,
  disabled,
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const normalizeStoreUrl = (url) => {
    let cleaned = url.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, '');
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned;
  };

  const handleConnect = async () => {
    setError('');
    setTesting(true);

    const normalized = normalizeStoreUrl(storeUrl);
    if (!normalized || !clientId.trim() || !clientSecret.trim()) {
      setError('Store URL, Client ID, and Client Secret are all required.');
      setTesting(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/validate-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_url: normalized,
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Connection failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      onStoreUrlChange(data.store_url || normalized);
      onConnectionChange(true);
    } catch (err) {
      setError(err.message || 'Connection failed');
      onConnectionChange(false);
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    onConnectionChange(false);
    setError('');
  };

  const canConnect = storeUrl.trim() && clientId.trim() && clientSecret.trim();

  const setupSteps = [
    {
      title: 'Open the Shopify Dev Dashboard',
      detail: (
        <>
          Go to{' '}
          <a
            href="https://dev.shopify.com/dashboard/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-500 underline"
          >
            dev.shopify.com/dashboard
          </a>
        </>
      ),
    },
    {
      title: 'Create an app',
      detail: 'Click "Create app" \u2192 "Start from Dev Dashboard" \u2192 name it (e.g., "Product Fairy") \u2192 Create',
    },
    {
      title: 'Configure access scopes',
      detail: (
        <>
          Go to <strong>Versions</strong> tab \u2192 add{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">write_products</code> scope \u2192 Release
        </>
      ),
    },
    {
      title: 'Install the app',
      detail: 'Go to Home tab \u2192 "Install app" \u2192 select your store \u2192 Install',
    },
    {
      title: 'Copy credentials',
      detail: 'Go to Settings tab \u2192 copy Client ID and Client Secret into the fields below',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.34 3.38c-.79-.1-1.58.54-1.75 1.33l-.14.68c-.59-.17-1.2-.25-1.82-.22l-.24-.73c-.27-.84-1.12-1.37-2-.1.01-.88-.66-1.35-1.5-1.11l-.62.29c-.39-.46-.84-.84-1.35-1.14l.15-.66c.2-.88-.26-1.78-1.06-2.12-.8-.34-1.72.02-2.17.78l-.34.56c-.51-.15-1.04-.22-1.58-.2l-.12-.66c-.16-.88-.97-1.47-1.82-1.33-.85.15-1.43.96-1.3 1.84l.12.62c-.52.21-.99.5-1.4.86l-.54-.38c-.72-.5-1.69-.36-2.22.34-.52.7-.39 1.69.3 2.22l.5.37c-.2.53-.31 1.09-.33 1.67l-.63.16c-.87.22-1.41 1.08-1.22 1.95.2.87 1.04 1.43 1.91 1.25l.6-.15c.25.52.58.98.97 1.38l-.32.56c-.45.78-.22 1.78.52 2.2.74.43 1.7.22 2.18-.46l.3-.46c.48.14.97.21 1.47.2l.1.6c.14.88.94 1.49 1.8 1.37.86-.12 1.47-.93 1.36-1.81l-.1-.55c.54-.19 1.04-.46 1.48-.8l.48.35c.7.52 1.68.42 2.24-.23.55-.65.5-1.63-.12-2.22l-.42-.4c.22-.5.37-1.03.43-1.59l.58-.1c.88-.15 1.49-.96 1.37-1.84-.12-.88-.93-1.49-1.81-1.4z"/>
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">Shopify Connection</h2>
        </div>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            Connected
          </span>
        )}
      </div>

      {!isConnected ? (
        <div className="space-y-4">
          {/* Collapsible setup guide */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                First time? Setup guide
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${showGuide ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showGuide && (
              <div className="px-4 pb-4 border-t border-gray-200">
                <ol className="mt-3 space-y-3">
                  {setupSteps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold">
                        {i + 1}
                      </span>
                      <div>
                        <span className="font-medium text-gray-900">{step.title}</span>
                        <p className="text-gray-500 mt-0.5">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Store URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store URL
            </label>
            <input
              type="text"
              value={storeUrl}
              onChange={(e) => onStoreUrlChange(e.target.value)}
              placeholder="mystore.myshopify.com"
              disabled={disabled || testing}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Client ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => onClientIdChange(e.target.value)}
              placeholder="App client ID from Dev Dashboard"
              disabled={disabled || testing}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={(e) => onClientSecretChange(e.target.value)}
                placeholder="App client secret"
                disabled={disabled || testing}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed pr-20"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handleConnect}
              disabled={disabled || testing || !canConnect}
              className={`
                inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors
                ${disabled || testing || !canConnect
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }
              `}
            >
              {testing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
            <a
              href="https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:text-green-500 flex items-center gap-1"
            >
              Shopify docs
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Connected to <strong>{storeUrl}</strong>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disabled}
            className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
