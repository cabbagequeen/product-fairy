import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

export default function CsvUpload({
  file,
  onFileSelect,
  validation,
  isValidating,
  disabled
}) {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled,
  });

  const requiredColumns = [
    'ProductNumber',
    'GenderCode',
    'ColorCode',
    'ProductName',
    'ColorName',
    'FlatLayPrompt',
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Step 2: Upload CSV File
      </h2>

      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Required columns:</p>
        <div className="flex flex-wrap gap-2">
          {requiredColumns.map((col) => (
            <span
              key={col}
              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-mono rounded"
            >
              {col}
            </span>
          ))}
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />

        {isValidating ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-gray-600">Validating CSV...</span>
          </div>
        ) : file ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-900 font-medium">{file.name}</span>
          </div>
        ) : (
          <div>
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              {isDragActive ? 'Drop your CSV file here' : 'Drag and drop your CSV file here, or click to browse'}
            </p>
          </div>
        )}
      </div>

      {validation && (
        <div className="mt-4">
          {validation.errors?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800">Validation Errors:</p>
              <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                {validation.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.warnings?.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mt-2">
              <p className="text-sm font-medium text-yellow-800">Warnings:</p>
              <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                {validation.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.valid && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">
                {validation.rowCount} valid products found
              </p>

              {validation.preview?.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-green-700 mb-2">Preview:</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-green-800">
                          <th className="pr-4 py-1">Product #</th>
                          <th className="pr-4 py-1">Name</th>
                          <th className="pr-4 py-1">Gender</th>
                          <th className="py-1">Color</th>
                        </tr>
                      </thead>
                      <tbody className="text-green-700">
                        {validation.preview.map((row, i) => (
                          <tr key={i}>
                            <td className="pr-4 py-1 font-mono text-xs">{row.productNumber}</td>
                            <td className="pr-4 py-1">{row.productName}</td>
                            <td className="pr-4 py-1">{row.genderCode}</td>
                            <td className="py-1">{row.colorName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
