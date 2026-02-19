/**
 * Mode selector component for switching between Store Builder and CSV Upload modes.
 */
export default function ModeSelector({ mode, onModeChange, disabled }) {
  const modes = [
    { id: 'store-builder', label: 'Build a Store' },
    { id: 'csv-upload', label: 'Upload CSV' },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-1 inline-flex">
      {modes.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onModeChange(id)}
          disabled={disabled}
          className={`
            px-6 py-2 text-sm font-medium rounded-md transition-colors
            ${mode === id
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
