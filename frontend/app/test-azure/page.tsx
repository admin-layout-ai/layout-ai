'use client';

import { useState } from 'react';

export default function AzureTestPage() {
  const [testResult, setTestResult] = useState('');

  // Test Configuration 1: Current setup
  const testConfig1 = () => {
    const authUrl = `https://layoutaib2c.ciamlogin.com/layoutaib2c.onmicrosoft.com/oauth2/v2.0/authorize?client_id=b25e167b-e52c-4cb0-b5c8-5ed9feab3b38&redirect_uri=${encodeURIComponent('http://localhost:3000/auth/callback')}&response_type=id_token&scope=openid%20profile%20email&nonce=defaultNonce&prompt=login`;
    
    console.log('Test 1 URL:', authUrl);
    setTestResult('Test 1: Redirecting to ciamlogin.com...');
    window.location.href = authUrl;
  };

  // Test Configuration 2: Traditional B2C
  const testConfig2 = () => {
    const authUrl = `https://layoutaib2c.b2clogin.com/layoutaib2c.onmicrosoft.com/oauth2/v2.0/authorize?client_id=b25e167b-e52c-4cb0-b5c8-5ed9feab3b38&redirect_uri=${encodeURIComponent('http://localhost:3000/auth/callback')}&response_type=id_token&scope=openid%20profile%20email&nonce=defaultNonce&prompt=login`;
    
    console.log('Test 2 URL:', authUrl);
    setTestResult('Test 2: Redirecting to b2clogin.com...');
    window.location.href = authUrl;
  };

  // Test Configuration 3: With user flow
  const testConfig3 = () => {
    const authUrl = `https://layoutaib2c.b2clogin.com/layoutaib2c.onmicrosoft.com/B2C_1_signup_signin/oauth2/v2.0/authorize?client_id=b25e167b-e52c-4cb0-b5c8-5ed9feab3b38&redirect_uri=${encodeURIComponent('http://localhost:3000/auth/callback')}&response_type=id_token&scope=openid%20profile%20email&nonce=defaultNonce`;
    
    console.log('Test 3 URL:', authUrl);
    setTestResult('Test 3: Redirecting with user flow...');
    window.location.href = authUrl;
  };

  // Test Configuration 4: Check app registration endpoint
  const testConfig4 = () => {
    // This will show metadata about your tenant
    const metadataUrl = `https://layoutaib2c.ciamlogin.com/layoutaib2c.onmicrosoft.com/v2.0/.well-known/openid-configuration`;
    
    console.log('Opening metadata URL:', metadataUrl);
    window.open(metadataUrl, '_blank');
    setTestResult('Test 4: Check the opened tab for tenant configuration');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Azure AD B2C Configuration Tester</h1>

        {/* Current Error Info */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Current Error</h2>
          <p className="text-sm text-red-800 mb-2">
            <strong>AADSTS700016:</strong> Application with identifier 'undefined' was not found
          </p>
          <p className="text-sm text-red-700">
            This means either:
          </p>
          <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
            <li>The app registration doesn't exist</li>
            <li>The app is in a different tenant</li>
            <li>The redirect URI isn't configured</li>
            <li>The app needs admin consent</li>
          </ul>
        </div>

        {/* Configuration Display */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Current Configuration</h2>
          <div className="space-y-2 font-mono text-sm">
            <p><strong>Client ID:</strong> b25e167b-e52c-4cb0-b5c8-5ed9feab3b38</p>
            <p><strong>Tenant:</strong> layoutaib2c.onmicrosoft.com</p>
            <p><strong>Redirect URI:</strong> http://localhost:3000/auth/callback</p>
          </div>
        </div>

        {/* Test Buttons */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-2">Test 1: External ID (ciamlogin.com)</h3>
            <p className="text-sm text-gray-600 mb-4">
              For Microsoft Entra External ID
            </p>
            <button
              onClick={testConfig1}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700"
            >
              Test Configuration 1
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-2">Test 2: Azure AD B2C (b2clogin.com)</h3>
            <p className="text-sm text-gray-600 mb-4">
              For traditional Azure AD B2C
            </p>
            <button
              onClick={testConfig2}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700"
            >
              Test Configuration 2
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-2">Test 3: With User Flow (B2C_1_signup_signin)</h3>
            <p className="text-sm text-gray-600 mb-4">
              If you have a user flow configured
            </p>
            <button
              onClick={testConfig3}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700"
            >
              Test Configuration 3
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-2">Test 4: Check Tenant Metadata</h3>
            <p className="text-sm text-gray-600 mb-4">
              View OpenID configuration (opens in new tab)
            </p>
            <button
              onClick={testConfig4}
              className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700"
            >
              View Tenant Metadata
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-900 mb-4">Next Steps</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-800">
            <li>Go to Azure Portal → Microsoft Entra External ID or Azure AD B2C</li>
            <li>Navigate to App registrations</li>
            <li>Search for client ID: b25e167b-e52c-4cb0-b5c8-5ed9feab3b38</li>
            <li>If found: Click Authentication → Add http://localhost:3000/auth/callback as SPA redirect URI</li>
            <li>If NOT found: Create new app registration with this redirect URI</li>
            <li>Copy the actual Client ID and update your configuration</li>
          </ol>
        </div>

        {testResult && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <p className="text-sm font-mono">{testResult}</p>
          </div>
        )}
      </div>
    </div>
  );
}
