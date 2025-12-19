'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = () => {
      try {
        // Get the hash from URL (Azure B2C returns tokens in hash)
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');

        if (!idToken) {
          console.error('No id_token found in URL');
          router.push('/auth/signin?error=no_token');
          return;
        }

        // Decode the JWT token (just the payload, no verification on client side)
        const tokenParts = idToken.split('.');
        if (tokenParts.length !== 3) {
          console.error('Invalid token format');
          router.push('/auth/signin?error=invalid_token');
          return;
        }

        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('Token payload:', payload);

        // Extract user information from token
        // Azure B2C tokens can have different claim names
        const email = payload.email || 
                     payload.emails?.[0] || 
                     payload.preferred_username || 
                     payload.upn || 
                     null;
        
        const givenName = payload.given_name || payload.givenName || '';
        const familyName = payload.family_name || payload.familyName || payload.surname || '';
        
        // Build full name
        let fullName = '';
        if (givenName && familyName) {
          fullName = `${givenName} ${familyName}`;
        } else if (givenName) {
          fullName = givenName;
        } else if (familyName) {
          fullName = familyName;
        } else if (payload.name) {
          fullName = payload.name;
        } else if (email) {
          fullName = email.split('@')[0];
        } else {
          fullName = 'User';
        }

        const user = {
          id: payload.sub || payload.oid || '1',
          email: email || 'no-email@provided.com',
          name: fullName,
          givenName: givenName,
          familyName: familyName,
          profilePicture: payload.picture || null
        };

        console.log('Extracted user:', user);

        // Store in localStorage
        localStorage.setItem('auth_token', idToken);
        localStorage.setItem('user_info', JSON.stringify(user));

        // Redirect to dashboard
        router.push('/dashboard');
      } catch (error) {
        console.error('Error processing callback:', error);
        router.push('/auth/signin?error=callback_failed');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}
