'use client';

import { useAuth } from '@/contexts/AuthContext';
import { User } from 'lucide-react';

export function UserProfile() {
  const { user } = useAuth();

  if (!user) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
        {user.profilePicture ? (
          <img 
            src={user.profilePicture} 
            alt={user.name || 'User'}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <span className="text-blue-600 font-semibold text-sm">
            {getInitials(user.name || 'U')}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {user.name || 'User'}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {user.email}
        </p>
      </div>
    </div>
  );
}
