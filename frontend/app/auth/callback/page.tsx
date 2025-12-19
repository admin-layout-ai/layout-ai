'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');

        if (!idToken) {
          console.error('No id_token found in URL');
          router.push('/auth/signin?error=no_token');
          return;
        }

        const tokenParts = idToken.split('.');
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('Token payload:', payload);

        // Try to get email from token
        const email = payload.email || 
                     payload.mail ||
                     payload.emails?.[0] || 
                     payload.preferred_username || 
                     payload.upn ||
                     null;

        // Extract names
        const givenName = payload.given_name || payload.givenName || '';
        const familyName = payload.family_name || payload.familyName || payload.surname || '';
        
        let fullName = '';
        if (givenName && familyName) {
          fullName = `${givenName} ${familyName}`;
        } else if (givenName) {
          fullName = givenName;
        } else if (familyName) {
          fullName = familyName;
        } else {
          fullName = 'User';
        }

        const userId = payload.sub || payload.oid || '1';

        // Check if this user has already provided email before
        const existingUsers = JSON.parse(localStorage.getItem('user_emails') || '{}');
        const savedEmail = existingUsers[userId];

        const user = {
          id: userId,
          email: email || savedEmail || '',  // Use saved email if available
          name: fullName,
          givenName: givenName,
          familyName: familyName,
          profilePicture: payload.picture || null
        };

        console.log('User:', user);

        localStorage.setItem('auth_token', idToken);
        localStorage.setItem('user_info', JSON.stringify(user));

        // If no email, redirect to collect it (only once per user)
        if (!user.email) {
          router.push('/auth/complete-profile');
        } else {
          router.push('/dashboard');
        }
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
