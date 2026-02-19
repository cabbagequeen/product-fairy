export default function ImageGallery({ images, onDownloadAll, onRegenerate, regeneratingFilename }) {
  const handleDownloadSingle = (image) => {
    const link = document.createElement('a');
    link.href = `data:image/jpeg;base64,${image.data}`;
    link.download = `${image.filename}.jpg`;
    link.click();
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Generated Images ({images.length})
        </h2>
        <button
          onClick={onDownloadAll}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download All (ZIP)
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image) => {
          const isRegenerating = regeneratingFilename === image.filename;

          return (
            <div
              key={image.filename}
              className="group relative bg-gray-50 rounded-lg overflow-hidden border border-gray-200"
            >
              <div className="aspect-square relative">
                <img
                  src={`data:image/jpeg;base64,${image.data}`}
                  alt={image.productName}
                  className={`w-full h-full object-cover transition-opacity ${isRegenerating ? 'opacity-40' : ''}`}
                />
                {isRegenerating && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="p-3">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {image.productName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {image.colorName}
                </p>
                {image.prompt && (
                  <p className="text-xs text-gray-400 truncate mt-1" title={image.prompt}>
                    {image.prompt}
                  </p>
                )}
              </div>

              {/* Action buttons on hover */}
              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {onRegenerate && image.prompt && (
                  <button
                    onClick={() => onRegenerate(image.filename, image)}
                    disabled={!!regeneratingFilename}
                    className="p-2 bg-white/90 rounded-full shadow hover:bg-white disabled:opacity-50 transition-colors"
                    title="Regenerate"
                  >
                    <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleDownloadSingle(image)}
                  className="p-2 bg-white/90 rounded-full shadow hover:bg-white transition-colors"
                  title="Download"
                >
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
