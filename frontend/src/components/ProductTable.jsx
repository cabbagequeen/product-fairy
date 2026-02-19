import { useState } from 'react';

/**
 * Editable product table component for reviewing and modifying generated products.
 * Displays core product info - photo styling is handled separately.
 */
export default function ProductTable({
  products,
  onProductsChange,
  disabled,
}) {
  const [showMore, setShowMore] = useState(false);

  const hasExtraData = products.some(p => p.Description || p.Price || p.Inventory);

  const handleFieldChange = (index, field, value) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    onProductsChange(updated);
  };

  const handleDelete = (index) => {
    const updated = products.filter((_, i) => i !== index);
    onProductsChange(updated);
  };

  const handleAdd = () => {
    const nextNumber = products.length + 1;
    const newProduct = {
      ProductNumber: `PROD-${String(nextNumber).padStart(3, '0')}`,
      ProductName: '',
      GenderCode: 'U',
      ColorCode: '',
      ColorName: '',
    };
    onProductsChange([...products, newProduct]);
  };

  return (
    <div className="space-y-4">
      {hasExtraData && (
        <button
          onClick={() => setShowMore(!showMore)}
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showMore ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showMore ? 'Hide extra columns' : 'Show more columns'}
        </button>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Product #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Gender
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                Color
              </th>
              {showMore && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[240px]">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                    Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    Inventory
                  </th>
                </>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={product.ProductNumber}
                    onChange={(e) => handleFieldChange(index, 'ProductNumber', e.target.value)}
                    disabled={disabled}
                    className="w-full text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={product.ProductName}
                    onChange={(e) => handleFieldChange(index, 'ProductName', e.target.value)}
                    disabled={disabled}
                    placeholder="Product name"
                    className="w-full text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={product.GenderCode}
                    onChange={(e) => handleFieldChange(index, 'GenderCode', e.target.value)}
                    disabled={disabled}
                    className="w-full text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                  >
                    <option value="U">Unisex</option>
                    <option value="M">Men</option>
                    <option value="W">Women</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={product.ColorCode}
                      onChange={(e) => handleFieldChange(index, 'ColorCode', e.target.value.toUpperCase())}
                      disabled={disabled}
                      placeholder="BLK"
                      maxLength={3}
                      className="w-14 text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 uppercase text-center"
                    />
                    <input
                      type="text"
                      value={product.ColorName}
                      onChange={(e) => handleFieldChange(index, 'ColorName', e.target.value)}
                      disabled={disabled}
                      placeholder="Black"
                      className="flex-1 text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                    />
                  </div>
                </td>
                {showMore && (
                  <>
                    <td className="px-4 py-2">
                      <textarea
                        value={product.Description || ''}
                        onChange={(e) => handleFieldChange(index, 'Description', e.target.value)}
                        disabled={disabled}
                        placeholder="Product description"
                        rows={2}
                        className="w-full text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 resize-y"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">$</span>
                        <input
                          type="text"
                          value={product.Price || ''}
                          onChange={(e) => handleFieldChange(index, 'Price', e.target.value)}
                          disabled={disabled}
                          placeholder="0.00"
                          className="w-20 text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        value={product.Inventory || ''}
                        onChange={(e) => handleFieldChange(index, 'Inventory', e.target.value)}
                        disabled={disabled}
                        placeholder="0"
                        className="w-20 text-sm border-gray-300 rounded px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                      />
                    </td>
                  </>
                )}
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(index)}
                    disabled={disabled}
                    className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 p-1"
                    title="Delete product"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={handleAdd}
          disabled={disabled}
          className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">Add Product</span>
        </button>

        <span className="text-sm text-gray-500">
          {products.length} product{products.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
