/**
 * MobileMenu - Hamburger menu for mobile header navigation
 * Only visible below md breakpoint (< 768px)
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface MobileMenuProps {
  children: ReactNode;
}

export default function MobileMenu({ children }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="md:hidden relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-neo border-3 border-neo-black bg-white hover:bg-gray-50 active:translate-x-0.5 active:translate-y-0.5 transition-all"
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5 text-neo-black"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-56 bg-white border-3 border-neo-black rounded-neo-lg shadow-neo z-50 animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div className="py-2 flex flex-col gap-1 p-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
