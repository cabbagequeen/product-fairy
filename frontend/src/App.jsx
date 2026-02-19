import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { useLocalStorage, useSessionStorage } from './hooks/useLocalStorage';
import { saveImage, loadAllImages, replaceImage, clearAllImages } from './lib/imageDb';
import ApiKeyInput from './components/ApiKeyInput';
import CsvUpload from './components/CsvUpload';
import ProgressBar from './components/ProgressBar';
import ImageGallery from './components/ImageGallery';
import ModeSelector from './components/ModeSelector';
import StoreBuilder from './components/StoreBuilder';
import ProductEditor from './components/ProductEditor';
import PhotoStyleSelector from './components/PhotoStyleSelector';
import ShopifyConnect from './components/ShopifyConnect';
import { generateShopifyCsv } from './lib/shopifyCsv';

const API_BASE = 'http://localhost:8000';

export default function App() {
  // Shared state (apiKey uses sessionStorage for security - clears when tab closes)
  const [apiKey, setApiKey] = useSessionStorage('pf-api-key', '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, product: '' });
  const [images, setImages] = useState([]); // Not persisted - too large for localStorage
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const abortControllerRef = useRef(null);

  // Mode management (persisted)
  const [appMode, setAppMode] = useLocalStorage('pf-app-mode', 'store-builder');
  const [storeBuilderStep, setStoreBuilderStep] = useLocalStorage('pf-step', 'input');

  // CSV Upload mode state
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [isValidating, setIsValidating] = useState(false);

  // Store Builder mode state (persisted)
  const [storeDescription, setStoreDescription] = useLocalStorage('pf-description', '');
  const [productCount, setProductCount] = useLocalStorage('pf-product-count', 10);
  const [referenceFiles, setReferenceFiles] = useState([]); // Files can't be serialized
  const [storeProgress, setStoreProgress] = useState(null);
  const [generatedBrand, setGeneratedBrand] = useLocalStorage('pf-brand', null);
  const [generatedProducts, setGeneratedProducts] = useLocalStorage('pf-products', []);
  const [photoStyle, setPhotoStyle] = useLocalStorage('pf-photo-style', '');

  // Per-image regeneration state
  const [regeneratingFilename, setRegeneratingFilename] = useState(null);

  // Session recovery state
  const [generationSession, setGenerationSession] = useLocalStorage('pf-generation-session', null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Shopify integration state
  const [shopifyStoreUrl, setShopifyStoreUrl] = useSessionStorage('pf-shopify-url', '');
  const [shopifyClientId, setShopifyClientId] = useSessionStorage('pf-shopify-client-id', '');
  const [shopifyClientSecret, setShopifyClientSecret] = useSessionStorage('pf-shopify-client-secret', '');
  const [shopifyConnected, setShopifyConnected] = useSessionStorage('pf-shopify-connected', false);
  const [shopifyPushing, setShopifyPushing] = useState(false);
  const [shopifyProgress, setShopifyProgress] = useState(null);

  // Load persisted images from IndexedDB + detect interrupted sessions on mount
  useEffect(() => {
    window.localStorage.removeItem('pf-images');

    if (storeBuilderStep === 'review' && (!generatedBrand || generatedProducts.length === 0)) {
      setStoreBuilderStep('input');
    }
    if (storeBuilderStep === 'style' && generatedProducts.length === 0) {
      setStoreBuilderStep('input');
    }
    if (storeBuilderStep === 'shopify' && (!generatedBrand || generatedProducts.length === 0)) {
      setStoreBuilderStep('input');
    }

    // Load images from IndexedDB
    loadAllImages().then((stored) => {
      if (stored.length > 0) {
        setImages(stored);
        setIsComplete(true);
      }
    });

    // Detect interrupted session
    try {
      const raw = window.localStorage.getItem('pf-generation-session');
      if (raw) {
        const session = JSON.parse(raw);
        if (session && session.mode === 'store-builder' && session.completedFilenames.length < session.totalCount) {
          setShowResumeBanner(true);
        }
      }
    } catch {
      // ignore
    }
  }, []); // Only run on mount

  // Warn before closing tab during generation
  useEffect(() => {
    if (!isGenerating) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isGenerating]);

  const handleFileSelect = useCallback(async (selectedFile) => {
    setFile(selectedFile);
    setValidation(null);
    setError('');
    setIsValidating(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post(`${API_BASE}/api/validate-csv`, formData);
      setValidation(response.data);
    } catch (err) {
      setValidation({
        valid: false,
        errors: [err.response?.data?.detail || 'Failed to validate CSV'],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!apiKey || !file || !validation?.valid) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setImages([]);
    await clearAllImages();
    setProgress({ current: 0, total: validation.rowCount, product: '' });
    setError('');
    setIsComplete(false);
    setShowResumeBanner(false);

    // Save session for recovery (CSV mode doesn't have products in state, so we track filenames only)
    setGenerationSession({ products: null, photoStyle: null, completedFilenames: [], totalCount: validation.rowCount, mode: 'csv' });

    try {
      const formData = new FormData();
      formData.append('api_key', apiKey);
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Generation failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'progress':
                  setProgress({
                    current: data.current,
                    total: data.total,
                    product: data.product,
                  });
                  break;

                case 'image': {
                  const img = {
                    filename: data.filename,
                    productName: data.productName,
                    colorName: data.colorName,
                    productNumber: data.productNumber,
                    genderCode: data.genderCode,
                    colorCode: data.colorCode,
                    prompt: data.prompt,
                    data: data.data,
                  };
                  setImages((prev) => [...prev, img]);
                  saveImage(img);
                  setGenerationSession((prev) => prev ? { ...prev, completedFilenames: [...prev.completedFilenames, data.filename] } : prev);
                  break;
                }

                case 'error':
                  setError((prev) => prev ? `${prev}\n${data.message}` : data.message);
                  break;

                case 'complete':
                  setIsComplete(true);
                  setGenerationSession(null);
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled - not an error
      } else {
        setError(err.message || 'Failed to generate images');
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }, [apiKey, file, validation]);

  const handleDownloadAll = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/download-all`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'generated_images.zip';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download ZIP file');
    }
  }, []);

  const handleDownloadShopifyCsv = useCallback(() => {
    if (!generatedProducts.length) return;
    const csv = generateShopifyCsv(generatedProducts, generatedBrand);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${generatedBrand?.name?.replace(/\s+/g, '_') || 'products'}_shopify_import.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [generatedProducts, generatedBrand]);

  // Push to Shopify handler
  const handlePushToShopify = useCallback(async () => {
    if (!shopifyConnected || !shopifyStoreUrl || !shopifyClientId || !shopifyClientSecret) return;
    if (!generatedProducts.length || !images.length) return;

    setShopifyPushing(true);
    setShopifyProgress({ current: 0, total: 0, message: 'Preparing...' });
    setError('');

    // Build images map: filename -> base64 data
    const imagesMap = {};
    for (const img of images) {
      imagesMap[img.filename] = img.data;
    }

    try {
      const response = await fetch(`${API_BASE}/api/push-to-shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_url: shopifyStoreUrl,
          client_id: shopifyClientId,
          client_secret: shopifyClientSecret,
          products: generatedProducts,
          brand: generatedBrand,
          images: imagesMap,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Push to Shopify failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'progress':
                  setShopifyProgress({
                    current: data.current || 0,
                    total: data.total || 0,
                    message: data.message || '',
                  });
                  break;

                case 'product_created':
                  setShopifyProgress({
                    current: data.current,
                    total: data.total,
                    message: `Created "${data.title}"`,
                  });
                  break;

                case 'error':
                  setError((prev) => prev ? `${prev}\n${data.message}` : data.message);
                  break;

                case 'complete':
                  setShopifyProgress({
                    current: data.created,
                    total: data.total,
                    message: `Done! ${data.created} of ${data.total} products created.`,
                  });
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to push to Shopify');
    } finally {
      setShopifyPushing(false);
    }
  }, [shopifyConnected, shopifyStoreUrl, shopifyClientId, shopifyClientSecret, generatedProducts, generatedBrand, images]);

  // Store Builder handlers
  const handleGenerateStore = useCallback(async () => {
    if (!apiKey || !storeDescription.trim()) return;

    setIsGenerating(true);
    setStoreProgress({ stage: 'starting', message: 'Starting...' });
    setError('');
    setGeneratedBrand(null);
    setGeneratedProducts([]);

    try {
      const formData = new FormData();
      formData.append('api_key', apiKey);
      formData.append('description', storeDescription);
      formData.append('product_count', productCount.toString());

      for (const file of referenceFiles) {
        formData.append('files', file);
      }

      const response = await fetch(`${API_BASE}/api/generate-store`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Store generation failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'progress':
                  setStoreProgress({ stage: data.stage, message: data.message });
                  break;

                case 'brand':
                  setGeneratedBrand(data.data);
                  break;

                case 'products':
                  setGeneratedProducts(data.data);
                  break;

                case 'error':
                  setError(data.message);
                  break;

                case 'complete':
                  setStoreBuilderStep('review');
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to generate store');
    } finally {
      setIsGenerating(false);
      setStoreProgress(null);
    }
  }, [apiKey, storeDescription, productCount, referenceFiles]);

  // Move to photo style step after approving products
  const handleApproveProducts = useCallback(() => {
    if (generatedProducts.length === 0) return;
    setStoreBuilderStep('style');
  }, [generatedProducts.length]);

  // Generate images with the selected photo style
  const handleGenerateImages = useCallback(async (productsToGenerate, isResume = false) => {
    const products = Array.isArray(productsToGenerate) ? productsToGenerate : generatedProducts;
    if (!apiKey || products.length === 0 || !photoStyle.trim()) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    if (!isResume) {
      setImages([]);
      await clearAllImages();
    }
    setProgress({ current: 0, total: products.length, product: '' });
    setError('');
    setIsComplete(false);
    setShowResumeBanner(false);

    // Save session for recovery
    if (!isResume) {
      setGenerationSession({ products: generatedProducts, photoStyle, completedFilenames: [], totalCount: generatedProducts.length, mode: 'store-builder' });
    }

    try {
      const response = await fetch(`${API_BASE}/api/generate-from-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          products,
          photo_style: photoStyle,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Image generation failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'progress':
                  setProgress({
                    current: data.current,
                    total: data.total,
                    product: data.product,
                  });
                  break;

                case 'image': {
                  const img = {
                    filename: data.filename,
                    productName: data.productName,
                    colorName: data.colorName,
                    productNumber: data.productNumber,
                    genderCode: data.genderCode,
                    colorCode: data.colorCode,
                    prompt: data.prompt,
                    data: data.data,
                  };
                  setImages((prev) => [...prev, img]);
                  saveImage(img);
                  setGenerationSession((prev) => prev ? { ...prev, completedFilenames: [...prev.completedFilenames, data.filename] } : prev);
                  break;
                }

                case 'error':
                  setError((prev) => prev ? `${prev}\n${data.message}` : data.message);
                  break;

                case 'complete':
                  setIsComplete(true);
                  setGenerationSession(null);
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled - not an error
      } else {
        setError(err.message || 'Failed to generate images');
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }, [apiKey, generatedProducts, photoStyle]);

  const handleBackToInput = useCallback(() => {
    setStoreBuilderStep('input');
  }, []);

  const handleBackToReview = useCallback(() => {
    setStoreBuilderStep('review');
  }, []);

  const handleModeChange = useCallback(async (mode) => {
    if (isGenerating) return;
    setAppMode(mode);
    setError('');
    setImages([]);
    setIsComplete(false);
    await clearAllImages();
  }, [isGenerating]);

  const handleStartNew = useCallback(async () => {
    if (isGenerating) return;
    // Clear all persisted state
    setStoreDescription('');
    setProductCount(10);
    setGeneratedBrand(null);
    setGeneratedProducts([]);
    setPhotoStyle('');
    setImages([]);
    setStoreBuilderStep('input');
    // Clear non-persisted state
    setFile(null);
    setValidation(null);
    setError('');
    setIsComplete(false);
    setReferenceFiles([]);
    setGenerationSession(null);
    setShowResumeBanner(false);
    setShopifyProgress(null);
    await clearAllImages();
  }, [isGenerating]);

  // Per-image regeneration
  const handleRegenerate = useCallback(async (filename, image) => {
    if (!apiKey || regeneratingFilename) return;
    setRegeneratingFilename(filename);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/regenerate-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          product_number: image.productNumber,
          product_name: image.productName,
          gender_code: image.genderCode,
          color_code: image.colorCode,
          color_name: image.colorName,
          prompt: image.prompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Regeneration failed');
      }

      const result = await response.json();
      const newImg = {
        ...image,
        data: result.data,
        prompt: result.prompt || image.prompt,
      };

      setImages((prev) => prev.map((img) => img.filename === filename ? newImg : img));
      await replaceImage(filename, newImg);
    } catch (err) {
      setError(err.message || 'Failed to regenerate image');
    } finally {
      setRegeneratingFilename(null);
    }
  }, [apiKey, regeneratingFilename]);

  // Resume interrupted generation (store-builder mode only)
  const handleResume = useCallback(() => {
    if (!generationSession || generationSession.mode !== 'store-builder') {
      setShowResumeBanner(false);
      return;
    }
    const completedSet = new Set(generationSession.completedFilenames);
    const remaining = generationSession.products.filter((p) => {
      const pn = String(p.ProductNumber || '').replace(/-/g, '');
      const fn = `${pn}${p.GenderCode || 'U'}${p.ColorCode || ''}`;
      return !completedSet.has(fn);
    });

    if (remaining.length === 0) {
      setShowResumeBanner(false);
      setGenerationSession(null);
      return;
    }

    handleGenerateImages(remaining, true);
  }, [generationSession, handleGenerateImages]);

  const handleDismissResume = useCallback(() => {
    setShowResumeBanner(false);
    setGenerationSession(null);
  }, []);

  const canGenerate = apiKey && validation?.valid && !isGenerating;

  // Determine if we're in image generation phase
  const showImageGeneration = isGenerating && progress.total > 0;
  const showGallery = images.length > 0;
  const isShopifyStep = appMode === 'store-builder' && storeBuilderStep === 'shopify';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Product Image Generator</h1>
          <p className="mt-2 text-gray-600">
            Generate professional product images using Gemini AI
          </p>

          {/* Mode Selector */}
          <div className="mt-6 flex justify-center items-center gap-4">
            <ModeSelector
              mode={appMode}
              onModeChange={handleModeChange}
              disabled={isGenerating}
            />
            {(generatedProducts.length > 0 || storeDescription || images.length > 0) && (
              <button
                onClick={handleStartNew}
                disabled={isGenerating}
                className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
              >
                Start New
              </button>
            )}
          </div>
        </header>

        <div className="space-y-6">
          {/* API Key - always shown */}
          <ApiKeyInput
            apiKey={apiKey}
            onKeyChange={setApiKey}
            disabled={isGenerating}
          />

          {/* CSV Upload Mode */}
          {appMode === 'csv-upload' && (
            <>
              <CsvUpload
                file={file}
                onFileSelect={handleFileSelect}
                validation={validation}
                isValidating={isValidating}
                disabled={isGenerating}
              />

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex justify-center">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={`
                    px-8 py-3 text-lg font-medium rounded-lg transition-colors
                    ${canGenerate
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }
                  `}
                >
                  {isGenerating ? 'Generating...' : 'Generate Images'}
                </button>
              </div>
            </>
          )}

          {/* Store Builder Mode */}
          {appMode === 'store-builder' && (
            <>
              {storeBuilderStep === 'input' && !showImageGeneration && !showGallery && (
                <StoreBuilder
                  description={storeDescription}
                  onDescriptionChange={setStoreDescription}
                  productCount={productCount}
                  onProductCountChange={setProductCount}
                  files={referenceFiles}
                  onFilesChange={setReferenceFiles}
                  onGenerate={handleGenerateStore}
                  isGenerating={isGenerating}
                  disabled={!apiKey}
                  progress={storeProgress}
                />
              )}

              {storeBuilderStep === 'review' && generatedBrand && !showImageGeneration && !showGallery && (
                <ProductEditor
                  brand={generatedBrand}
                  products={generatedProducts}
                  onProductsChange={setGeneratedProducts}
                  onBack={handleBackToInput}
                  onApprove={handleApproveProducts}
                  disabled={isGenerating}
                />
              )}

              {storeBuilderStep === 'style' && !showImageGeneration && !showGallery && (
                <PhotoStyleSelector
                  photoStyle={photoStyle}
                  onPhotoStyleChange={setPhotoStyle}
                  onBack={handleBackToReview}
                  onGenerate={handleGenerateImages}
                  disabled={isGenerating}
                  productCount={generatedProducts.length}
                />
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}

          {/* Error Display */}
          {error && !isGenerating && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-1">Generation errors:</p>
              {error.split('\n').map((msg, i) => (
                <p key={i} className="text-sm text-red-700">{msg}</p>
              ))}
              {isComplete && images.length === 0 && (
                <button
                  onClick={() => { setError(''); setIsComplete(false); }}
                  className="mt-3 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}

          {/* Resume Banner */}
          {showResumeBanner && generationSession && !isGenerating && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-sm text-amber-800">
                  <strong>Interrupted session detected.</strong>{' '}
                  {generationSession.completedFilenames.length} of {generationSession.totalCount} images were generated.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {generationSession.mode === 'store-builder' && apiKey && (
                  <button
                    onClick={handleResume}
                    className="px-4 py-2 text-sm font-medium text-amber-800 bg-amber-200 rounded-lg hover:bg-amber-300 transition-colors"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={handleDismissResume}
                  className="px-4 py-2 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Back button - shown when gallery/progress visible in store-builder mode */}
          {appMode === 'store-builder' && (showGallery || showImageGeneration) && !isGenerating && !isShopifyStep && (
            <button
              onClick={async () => {
                setImages([]);
                await clearAllImages();
                setIsComplete(false);
                setError('');
                setGenerationSession(null);
                setShowResumeBanner(false);
                setStoreBuilderStep('style');
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">Back to Photo Style</span>
            </button>
          )}

          {/* Progress Bar - shown during image generation */}
          {showImageGeneration && (
            <ProgressBar
              current={progress.current}
              total={progress.total}
              currentProduct={progress.product}
              onCancel={handleCancel}
            />
          )}

          {/* Image Gallery - shown when images are available */}
          {showGallery && !isShopifyStep && (
            <ImageGallery
              images={images}
              onDownloadAll={handleDownloadAll}
              onRegenerate={handleRegenerate}
              regeneratingFilename={regeneratingFilename}
            />
          )}

          {/* Completion Message */}
          {!isGenerating && images.length > 0 && !isShopifyStep && (
            <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">
                {isComplete
                  ? `Generation complete! ${images.length} images generated.`
                  : `${images.length} of ${progress.total || images.length} images generated.`
                }
              </p>
              {appMode === 'store-builder' && generatedBrand && (
                <p className="text-green-700 text-sm mt-1">
                  Brand: {generatedBrand.name}
                </p>
              )}
              {appMode === 'store-builder' && generatedProducts.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setStoreBuilderStep('shopify')}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Continue to Export
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Export / Shopify Step */}
          {isShopifyStep && images.length > 0 && generatedProducts.length > 0 && (
            <div className="space-y-6">
              <button
                onClick={() => setStoreBuilderStep('style')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Images</span>
              </button>

              <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-medium">
                  {images.length} images ready for export
                </p>
                {generatedBrand && (
                  <p className="text-green-700 text-sm mt-1">Brand: {generatedBrand.name}</p>
                )}
              </div>

              {/* Download Options */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleDownloadAll}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download All Images (ZIP)
                  </button>
                  <button
                    onClick={handleDownloadShopifyCsv}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Shopify CSV
                  </button>
                </div>
              </div>

              {/* Shopify Connection */}
              <ShopifyConnect
                storeUrl={shopifyStoreUrl}
                onStoreUrlChange={setShopifyStoreUrl}
                clientId={shopifyClientId}
                onClientIdChange={setShopifyClientId}
                clientSecret={shopifyClientSecret}
                onClientSecretChange={setShopifyClientSecret}
                onConnectionChange={setShopifyConnected}
                isConnected={shopifyConnected}
                disabled={shopifyPushing}
              />

              {/* Push to Shopify */}
              {shopifyConnected && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Push to Shopify</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Create all {generatedProducts.length} products directly in your Shopify store.
                  </p>
                  <button
                    onClick={handlePushToShopify}
                    disabled={shopifyPushing}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {shopifyPushing ? 'Pushing...' : 'Push to Shopify'}
                  </button>

                  {shopifyProgress && (
                    <div className={`mt-4 p-4 rounded-lg border ${shopifyPushing ? 'bg-green-50 border-green-200' : 'bg-emerald-50 border-emerald-300'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        {shopifyPushing ? (
                          <svg className="animate-spin w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        <p className={`text-sm font-medium ${shopifyPushing ? 'text-green-800' : 'text-emerald-800'}`}>{shopifyProgress.message}</p>
                      </div>
                      {shopifyPushing && shopifyProgress.total > 0 && (
                        <div className="w-full bg-green-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(shopifyProgress.current / shopifyProgress.total) * 100}%` }}
                          />
                        </div>
                      )}
                      {!shopifyPushing && (
                        <p className="text-sm text-emerald-700 mt-1 ml-8">
                          Check your products in{' '}
                          <a
                            href={`https://${shopifyStoreUrl}/admin/products`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-medium hover:text-emerald-900"
                          >
                            Shopify Admin
                          </a>{' '}
                          to verify everything looks good.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
