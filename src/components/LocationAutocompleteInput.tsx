'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface LocationSuggestion {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  full: string;
  lat?: string;
  lon?: string;
}

interface LocationAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectLocation?: (location: LocationSuggestion) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
}

export function LocationAutocompleteInput({
  value,
  onChange,
  onSelectLocation,
  placeholder = "123 Main St, City, State",
  className = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500",
  required = false,
  id
}: LocationAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce API query
  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          if ((data.suggestions || []).length > 0) {
            setIsOpen(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch location suggestions:', err);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: LocationSuggestion) => {
    onChange(item.street || item.full);
    if (onSelectLocation) {
      onSelectLocation(item);
    }
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen && e.target.value.length >= 2) setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          className={className}
        />
        {isLoading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
            <i className="fa-solid fa-spinner animate-spin text-purple-600 text-xs"></i>
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto animate-fade-in">
          <div className="px-3.5 py-2 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between text-[10px] font-black text-gray-700 uppercase tracking-wider">
            <span>US Address Suggestions</span>
            <span className="text-gray-400 font-normal">Standard USA Format</span>
          </div>
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none flex items-start gap-2.5 cursor-pointer group"
            >
              <i className="fa-solid fa-location-dot text-[#77248c] text-xs mt-1 shrink-0 group-hover:scale-110 transition-transform"></i>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-gray-800 truncate">
                  {item.street || item.full}
                </div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                  {item.city && <span>{item.city}</span>}
                  {item.state && <span className="font-bold text-[#77248c] text-[11px]">{item.state}</span>}
                  {item.zip && <span className="font-mono text-gray-400 text-[10px]">{item.zip}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
