/**
 * Photo style selector - lets users describe how they want their product photos to look.
 * This style is applied to all products during image generation.
 */
export default function PhotoStyleSelector({
  photoStyle,
  onPhotoStyleChange,
  onBack,
  onGenerate,
  disabled,
  productCount,
}) {
  const stylePresets = [
    { label: 'Clean & Minimal', value: 'clean, minimalist, white background, professional product photography' },
    { label: 'Flat Lay', value: 'flat lay photography, overhead view, styled arrangement, soft shadows' },
    { label: 'Lifestyle', value: 'lifestyle photography, natural setting, warm lighting, in-context use' },
    { label: 'Model Shot', value: 'model wearing the item, studio lighting, full body shot, neutral background' },
    { label: 'Editorial', value: 'editorial style, dramatic lighting, artistic composition, high fashion' },
  ];

  const handlePresetClick = (presetValue) => {
    onPhotoStyleChange(presetValue);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Photo Style</h2>
        <p className="mt-1 text-sm text-gray-600">
          Describe how you want your product photos to look. This style will be applied to all {productCount} products.
        </p>
      </div>

      {/* Style Presets */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Quick Presets
        </label>
        <div className="flex flex-wrap gap-2">
          {stylePresets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.value)}
              disabled={disabled}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                photoStyle === preset.value
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
              } disabled:opacity-50`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Style Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Style Description
        </label>
        <textarea
          value={photoStyle}
          onChange={(e) => onPhotoStyleChange(e.target.value)}
          disabled={disabled}
          placeholder="Describe your desired photo style... e.g., 'professional product photography on a clean white background with soft shadows' or 'lifestyle shot with natural lighting'"
          rows={4}
          className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
        />
        <p className="mt-1.5 text-xs text-gray-500">
          Be specific about lighting, background, composition, and mood. The AI will combine this with each product's details.
        </p>
      </div>

      {/* Example */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Example prompts</p>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>"Clean white background, soft studio lighting, subtle shadows"</li>
          <li>"Flat lay on marble surface with lifestyle props"</li>
          <li>"Model wearing the item in an urban outdoor setting"</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200">
        <button
          onClick={onBack}
          disabled={disabled}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
        >
          ← Back to Products
        </button>
        <button
          onClick={onGenerate}
          disabled={disabled || !photoStyle.trim()}
          className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            !disabled && photoStyle.trim()
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Generate {productCount} Images
        </button>
      </div>
    </div>
  );
}
