import React, { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | string;
  className?: string;
  availableNow?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = 'User',
  size = 'md',
  className = '',
  availableNow = false
}) => {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = 
    size === 'xs' ? 'w-5 h-5 text-[10px]' :
    size === 'sm' ? 'w-7 h-7 text-xs' :
    size === 'lg' ? 'w-14 h-14 text-base' :
    size === 'xl' ? 'w-20 h-20 text-xl' :
    'w-9 h-9 text-sm'; // md default

  const initials = (name || 'User')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const colors = [
    'bg-emerald-600 text-white',
    'bg-indigo-600 text-white',
    'bg-blue-600 text-white',
    'bg-purple-600 text-white',
    'bg-amber-600 text-white',
    'bg-teal-600 text-white'
  ];
  const colorIndex = (name || 'User').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  const bgClass = colors[colorIndex];

  const showFallback = !src || hasError || src.includes('undefined') || src.includes('null');

  return (
    <div className={`relative inline-block shrink-0 ${sizeClasses} ${className}`}>
      {showFallback ? (
        <div className={`w-full h-full rounded-full flex items-center justify-center font-bold shadow-xs select-none ${bgClass}`}>
          {initials || 'W'}
        </div>
      ) : (
        <img
          src={src || ''}
          alt={name || 'User'}
          className="w-full h-full rounded-full object-cover border border-slate-200 bg-slate-100"
          onError={() => setHasError(true)}
        />
      )}
      {availableNow && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" title="Available Now" />
      )}
    </div>
  );
};
