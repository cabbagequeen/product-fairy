import ProductTable from './ProductTable';
import { csvEscape } from '../lib/shopifyCsv';

/**
 * Product review/edit screen showing brand concept and editable product catalog.
 */
export default function ProductEditor({
  brand,
  products,
  onProductsChange,
  onBack,
  onApprove,
  disabled,
}) {
  // Products need at minimum a number, name, and color to be valid
  const validProducts = products.filter(p =>
    p.ProductNumber &&
    p.ProductName &&
    p.ColorName
  );

  const canApprove = validProducts.length > 0 && !disabled;

  const handleDownloadCsv = () => {
    const headers = ['ProductNumber', 'ProductName', 'GenderCode', 'ColorCode', 'ColorName', 'ProductType', 'Description', 'Price', 'Inventory'];
    const rows = products.map(p =>
      headers.map(h => csvEscape(p[h])).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${brand.name?.replace(/\s+/g, '_') || 'catalog'}_catalog.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Brand Display */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{brand.name}</h2>
            <p className="text-indigo-100 italic mt-1">{brand.tagline}</p>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            {products.length} products
          </span>
        </div>
        <p className="mt-4 text-indigo-50">{brand.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {brand.style?.split(',').map((tag, i) => (
            <span
              key={i}
              className="bg-white/10 px-2 py-1 rounded text-xs"
            >
              {tag.trim()}
            </span>
          ))}
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Product Catalog</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {validProducts.length} of {products.length} products ready
            </span>
            <button
              onClick={handleDownloadCsv}
              disabled={products.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        <ProductTable
          products={products}
          onProductsChange={onProductsChange}
          disabled={disabled}
        />

        {validProducts.length < products.length && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700">
              <strong>{products.length - validProducts.length}</strong> product(s) missing required fields
              (Product Number, Name, or Color). These will be skipped during generation.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={disabled}
          className="flex items-center space-x-2 px-6 py-3 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Description</span>
        </button>

        <button
          onClick={onApprove}
          disabled={!canApprove}
          className={`
            flex items-center space-x-2 px-8 py-3 rounded-lg font-medium transition-colors
            ${canApprove
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          <span>Choose Photo Style</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
