'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY, Country, parseInternationalPhone, formatPhoneWithDialCode } from '@/lib/phone';

interface PhoneInputProps {
  value: string;
  onChange: (fullPhoneNumber: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className = '',
  id,
  required = false,
  disabled = false,
}: PhoneInputProps) {
  // Parse initial incoming value or default to US (+1)
  const parsed = useMemo(() => parseInternationalPhone(value), [value]);

  const [selectedCountry, setSelectedCountry] = useState<Country>(parsed.country);
  const [nationalNumber, setNationalNumber] = useState<string>(parsed.nationalNumber);

  // Sync internal state when external value changes drastically
  useEffect(() => {
    const updated = parseInternationalPhone(value);
    setSelectedCountry(updated.country);
    setNationalNumber(updated.nationalNumber);
  }, [value]);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const country = COUNTRIES.find((c) => c.code === code) || DEFAULT_COUNTRY;
    setSelectedCountry(country);
    const full = formatPhoneWithDialCode(nationalNumber, country.dialCode) || '';
    onChange(full);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits and hyphens/spaces
    const digitsOnly = raw.replace(/\D/g, '');
    setNationalNumber(digitsOnly);
    const full = formatPhoneWithDialCode(digitsOnly, selectedCountry.dialCode) || '';
    onChange(full);
  };

  return (
    <div className={`relative flex items-center rounded-xl border border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-purple-500 focus-within:bg-white transition-all overflow-hidden ${className}`}>
      {/* Country Selector Dropdown */}
      <div className="relative flex items-center bg-gray-100/80 border-r border-gray-200 px-2.5 py-3 select-none hover:bg-gray-200/70 transition-colors">
        <span className="text-base mr-1.5 leading-none">{selectedCountry.flag}</span>
        <span className="text-xs font-mono font-bold text-[#77248c] mr-1">{selectedCountry.dialCode}</span>
        <i className="fa-solid fa-chevron-down text-[10px] text-gray-400"></i>
        
        <select
          value={selectedCountry.code}
          onChange={handleCountryChange}
          disabled={disabled}
          aria-label="Select Country Code"
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
        >
          {COUNTRIES.map((c) => (
            <option key={`${c.code}-${c.dialCode}`} value={c.code}>
              {c.flag} {c.name} ({c.dialCode})
            </option>
          ))}
        </select>
      </div>

      {/* Local Phone Number Input */}
      <input
        type="tel"
        id={id}
        required={required}
        disabled={disabled}
        value={nationalNumber}
        onChange={handleNumberChange}
        placeholder={placeholder || (selectedCountry.code === 'US' ? '(555) 019-2834' : 'Phone number')}
        className="w-full bg-transparent px-3.5 py-3 text-sm focus:outline-none font-mono text-gray-800 placeholder:text-gray-400"
      />
    </div>
  );
}

export default PhoneInput;
