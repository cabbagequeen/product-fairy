import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

/**
 * Store description input with file uploads for the Store Builder flow.
 */
export default function StoreBuilder({
  description,
  onDescriptionChange,
  productCount,
  onProductCountChange,
  files,
  onFilesChange,
  onGenerate,
  isGenerating,
  disabled,
  progress,
}) {
  const [fileError, setFileError] = useState('');

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setFileError('');

    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(f => f.errors[0]?.message).join(', ');
      setFileError(errors || 'Some files were rejected');
    }

    // Limit to 5 files total
    const newFiles = [...files, ...acceptedFiles].slice(0, 5);
    onFilesChange(newFiles);
  }, [files, onFilesChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    disabled: disabled || isGenerating,
  });

  const removeFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const canGenerate = description.trim().length > 10 && !isGenerating && !disabled;

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Describe Your Store
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Tell us about your brand, products, and style. Be as detailed as you like.
        </p>

        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="e.g., A sustainable outdoor clothing brand inspired by Pacific Northwest forests. Focus on hiking and camping apparel with earth tones and natural materials. Modern minimalist aesthetic with eco-friendly messaging..."
          rows={6}
          disabled={disabled || isGenerating}
          className={`
            w-full px-4 py-3 rounded-lg border text-gray-900 placeholder-gray-400
            focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            disabled:bg-gray-100 disabled:cursor-not-allowed
            ${description.trim().length > 10 ? 'border-green-300' : 'border-gray-300'}
          `}
        />

        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Minimum 10 characters</span>
          <span className={description.length < 10 ? 'text-amber-600' : 'text-green-600'}>
            {description.length} characters
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of Products
        </label>
        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="5"
            max="100"
            value={productCount}
            onChange={(e) => onProductCountChange(Number(e.target.value))}
            disabled={disabled || isGenerating}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <span className="w-12 text-center font-medium text-gray-900 bg-gray-100 px-3 py-1 rounded">
            {productCount}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Generate between 5 and 100 products
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reference Files (Optional)
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Upload mood boards, inspiration images, or brand guidelines. Max 5 files, 10MB each.
        </p>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
            transition-colors
            ${isDragActive
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-300 hover:border-gray-400'
            }
            ${disabled || isGenerating ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          <input {...getInputProps()} />
          <div className="text-gray-500">
            <svg
              className="mx-auto h-8 w-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-2 text-sm">
              {isDragActive
                ? 'Drop files here...'
                : 'Drag & drop files, or click to browse'
              }
            </p>
            <p className="text-xs mt-1 text-gray-400">
              PNG, JPG, GIF, WebP, PDF, TXT
            </p>
          </div>
        </div>

        {fileError && (
          <p className="mt-2 text-sm text-red-600">{fileError}</p>
        )}

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-gray-400">
                    {file.type.startsWith('image/') ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm text-gray-700 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                  disabled={disabled || isGenerating}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isGenerating && progress && (
        <div className="bg-indigo-50 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <svg
              className="animate-spin h-5 w-5 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-indigo-700 font-medium">{progress.message}</span>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className={`
            px-8 py-3 text-lg font-medium rounded-lg transition-colors
            ${canGenerate
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isGenerating ? 'Generating...' : 'Generate Store'}
        </button>
      </div>
    </div>
  );
}
