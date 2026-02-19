export default function ProgressBar({ current, total, currentProduct, onCancel }) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Generating Images
        </h2>
        <span className="text-sm text-gray-600">
          {current} / {total}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
        <div
          className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        {currentProduct && (
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Processing: {currentProduct}
          </p>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
