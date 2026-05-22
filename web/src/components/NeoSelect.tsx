/**
 * NeoSelect - Custom select component with neobrutalism styling
 */

import { useState, useRef, useEffect } from 'react';

export interface NeoSelectOption {
  value: string | number;
  label: string;
}

interface NeoSelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: NeoSelectOption[];
  className?: string;
  disabled?: boolean;
}

export default function NeoSelect({
  value,
  onChange,
  options,
  className = '',
  disabled = false,
}: NeoSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value);
  const selectedLabel = selectedOption?.label || '';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const currentIndex = options.findIndex((opt) => opt.value === value);
        const nextIndex =
          event.key === 'ArrowDown'
            ? Math.min(currentIndex + 1, options.length - 1)
            : Math.max(currentIndex - 1, 0);
        onChange(options[nextIndex].value);
      }

      if (event.key === 'Enter') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, options, value, onChange]);

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
    >
      {/* Select Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full border-3 border-neo-black rounded-neo px-4 py-3.5 bg-white text-neo-black text-base font-bold
          transition-all duration-150 text-left
          ${!disabled ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}
          ${isOpen ? 'border-4' : ''}
        `}
      >
        <div className="flex items-center justify-between">
          <span>{selectedLabel}</span>
          {/* Dropdown Arrow */}
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-2 bg-white border-3 border-neo-black rounded-neo overflow-hidden"
          style={{ maxHeight: '300px', overflowY: 'auto' }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`
                  w-full px-4 py-3 text-left text-base font-bold transition-colors duration-150
                  flex items-center justify-between
                  ${
                    isSelected
                      ? 'bg-neo-cyan text-neo-black'
                      : 'text-neo-black hover:bg-neo-cyan hover:text-neo-black'
                  }
                `}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    viewBox="0 0 24 24"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
