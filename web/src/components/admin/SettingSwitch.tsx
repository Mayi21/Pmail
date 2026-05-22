/**
 * Setting Switch Component
 * 设置开关组件
 */
interface SettingSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export default function SettingSwitch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SettingSwitchProps) {
  return (
    <div className="flex items-start justify-between py-4 border-b-2 border-gray-200 last:border-0">
      <div className="flex-1">
        <h3 className="text-lg font-bold text-neo-black">{label}</h3>
        {description && (
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        )}
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`
          relative w-16 h-8 border-3 border-neo-black rounded-full transition-all
          ${checked ? 'bg-green-400' : 'bg-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-neo-sm'}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-6 h-6 bg-white border-3 border-neo-black rounded-full transition-all
            ${checked ? 'right-0.5' : 'left-0.5'}
          `}
        />
      </button>
    </div>
  );
}
