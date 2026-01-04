# backend/app/auth.py
"""
Azure AD B2C CIAM Authentication for Layout AI Backend
FIXED: Uses tenant GUID for CIAM issuer validation
"""
import os
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION - Azure AD B2C CIAM
# =============================================================================

# Your B2C tenant name
B2C_TENANT_NAME = os.getenv("B2C_TENANT_NAME", "layoutaib2c")

# Your B2C tenant domain
B2C_TENANT_DOMAIN = os.getenv("B2C_TENANT_DOMAIN", f"{B2C_TENANT_NAME}.onmicrosoft.com")

# CIAM Tenant ID (GUID) - CRITICAL: This is needed for token validation
# Get this from Azure Portal > Azure AD B2C > Overview > Tenant ID
B2C_TENANT_ID = os.getenv("B2C_TENANT_ID", "417eaec3-ca5e-42d3-86cc-83e95cab8904")

# CIAM uses ciamlogin.com instead of b2clogin.com
B2C_DOMAIN = os.getenv("B2C_DOMAIN", f"{B2C_TENANT_NAME}.ciamlogin.com")

# Application (Client) ID from your B2C app registration
B2C_CLIENT_ID = os.getenv("B2C_CLIENT_ID", "b25e167b-e52c-4cb0-b5c8-5ed9feab3b38")

# =============================================================================
# JWKS Configuration - CIAM endpoints
# =============================================================================

# JWKS URL - try multiple formats
JWKS_URLS = [
    f"https://{B2C_TENANT_ID}.ciamlogin.com/{B2C_TENANT_ID}/discovery/v2.0/keys",
    f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/discovery/v2.0/keys",
    f"https://{B2C_DOMAIN}/{B2C_TENANT_ID}/discovery/v2.0/keys",
]

# Primary JWKS URL (CIAM with tenant ID)
JWKS_URL = os.getenv("B2C_JWKS_URL", JWKS_URLS[0])

# All valid issuers - CIAM can use different formats
VALID_ISSUERS = [
    # CIAM format with tenant GUID (most common)
    f"https://{B2C_TENANT_ID}.ciamlogin.com/{B2C_TENANT_ID}/v2.0",
    f"https://{B2C_TENANT_ID}.ciamlogin.com/{B2C_TENANT_ID}/v2.0/",
    # CIAM format with tenant name
    f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/v2.0",
    f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/v2.0/",
    f"https://{B2C_DOMAIN}/{B2C_TENANT_ID}/v2.0",
    f"https://{B2C_DOMAIN}/{B2C_TENANT_ID}/v2.0/",
    # Standard Azure AD format
    f"https://login.microsoftonline.com/{B2C_TENANT_ID}/v2.0",
    f"https://login.microsoftonline.com/{B2C_TENANT_DOMAIN}/v2.0",
]

# =============================================================================
# Security Scheme
# =============================================================================

security = HTTPBearer(auto_error=False)


# =============================================================================
# JWKS Client (Cached with fallback)
# =============================================================================

_jwks_client = None

def get_jwks_client() -> PyJWKClient:
    """Get JWKS client for token verification (cached with fallback)"""
    global _jwks_client
    
    if _jwks_client is not None:
        return _jwks_client
    
    # Try each JWKS URL until one works
    for jwks_url in JWKS_URLS:
        try:
            logger.info(f"Trying JWKS URL: {jwks_url}")
            client = PyJWKClient(jwks_url)
            # Test that we can fetch keys
            client.get_jwk_set()
            _jwks_client = client
            logger.info(f"Successfully initialized JWKS client with: {jwks_url}")
            return client
        except Exception as e:
            logger.warning(f"Failed to initialize JWKS client with {jwks_url}: {e}")
            continue
    
    # If all fail, raise error
    raise RuntimeError(f"Could not initialize JWKS client with any URL: {JWKS_URLS}")


# =============================================================================
# User Model
# =============================================================================

class AuthenticatedUser:
    """User model extracted from B2C CIAM token"""
    
    def __init__(self, token_data: Dict[str, Any]):
        # User ID - use 'sub' claim as primary identifier
        self.id: str = token_data.get("sub") or token_data.get("oid", "")
        
        # Object ID
        self.oid: str = token_data.get("oid", "")
        
        # Email - Azure AD/CIAM may return it in different fields
        emails = token_data.get("emails", [])
        self.email: str = (
            emails[0] if emails else 
            token_data.get("email") or 
            token_data.get("unique_name") or  # Common in Azure AD tokens
            token_data.get("preferred_username") or 
            token_data.get("upn") or
            ""
        )
        
        # Clean up UPN-style emails (remove @tenant suffix if it's not a real email)
        if self.email and '@' in self.email:
            # If email ends with .onmicrosoft.com, it's a UPN not a real email
            if self.email.endswith('.onmicrosoft.com'):
                # Try to get the actual email from other claims first
                actual_email = token_data.get("email") or token_data.get("unique_name")
                if actual_email and not actual_email.endswith('.onmicrosoft.com'):
                    self.email = actual_email
        
        # Name fields
        self.name: str = token_data.get("name", "")
        self.given_name: str = token_data.get("given_name", "")
        self.family_name: str = token_data.get("family_name", "") or token_data.get("surname", "")
        
        # Phone number
        self.phone_number: Optional[str] = (
            token_data.get("extension_PhoneNumber") or 
            token_data.get("phone_number") or
            token_data.get("mobilePhone")
        )
        
        # Identity provider
        self.identity_provider: str = token_data.get("idp", "local")
        
        # Token expiration
        self.exp: int = token_data.get("exp", 0)
        
        # Raw claims for debugging
        self._claims = token_data

    def dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "oid": self.oid,
            "email": self.email,
            "name": self.name,
            "given_name": self.given_name,
            "family_name": self.family_name,
            "phone_number": self.phone_number,
            "identity_provider": self.identity_provider,
        }
    
    def __repr__(self):
        return f"AuthenticatedUser(id={self.id}, email={self.email})"


# =============================================================================
# Token Verification
# =============================================================================

async def verify_token(token: str) -> Dict[str, Any]:
    """
    Verify Azure AD B2C CIAM JWT token
    
    Args:
        token: JWT token from Authorization header
        
    Returns:
        Decoded token payload
        
    Raises:
        HTTPException: If token is invalid
    """
    try:
        # Get JWKS client
        jwks_client = get_jwks_client()
        
        # Get signing key from token header
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
        except Exception as e:
            logger.error(f"Failed to get signing key: {e}")
            # Clear cached client and retry once
            global _jwks_client
            _jwks_client = None
            jwks_client = get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # First, decode without verification to check issuer and audience
        unverified = jwt.decode(token, options={"verify_signature": False})
        actual_issuer = unverified.get("iss", "")
        actual_audience = unverified.get("aud", "")
        
        logger.info(f"Token issuer: {actual_issuer}")
        logger.info(f"Token audience: {actual_audience}")
        logger.info(f"Expected audience: {B2C_CLIENT_ID}")
        
        # Check if audience matches (could be a list or string)
        valid_audience = False
        if isinstance(actual_audience, list):
            valid_audience = B2C_CLIENT_ID in actual_audience
        else:
            valid_audience = actual_audience == B2C_CLIENT_ID
        
        if not valid_audience:
            logger.warning(f"Audience mismatch. Got: {actual_audience}, Expected: {B2C_CLIENT_ID}")
            raise HTTPException(
                status_code=401,
                detail="Invalid token audience",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Decode and verify token
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,  # We verified manually above
                "verify_iss": False,  # We'll verify manually below
            }
        )
        
        # Manual issuer verification (allow multiple formats)
        token_issuer = payload.get("iss", "")
        issuer_normalized = token_issuer.rstrip("/")
        valid_issuer = any(
            issuer_normalized == iss.rstrip("/")
            for iss in VALID_ISSUERS
        )
        
        if not valid_issuer:
            logger.warning(f"Issuer mismatch. Got: {token_issuer}")
            logger.warning(f"Expected one of: {VALID_ISSUERS}")
            # For CIAM, we're lenient on issuer as long as it contains our tenant ID
            if B2C_TENANT_ID not in token_issuer:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token issuer",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            logger.info("Issuer contains tenant ID, accepting token")
        
        logger.info(f"Token verified successfully for user: {payload.get('sub', 'unknown')}")
        return payload
        
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise HTTPException(
            status_code=401,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidAudienceError as e:
        logger.warning(f"Invalid audience: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid token audience",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail=f"Token verification failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# =============================================================================
# Dependency Functions
# =============================================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> AuthenticatedUser:
    """
    FastAPI dependency to get current authenticated user.
    
    Raises:
        HTTPException 401: If not authenticated
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please provide a valid token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    token_data = await verify_token(token)
    return AuthenticatedUser(token_data)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[AuthenticatedUser]:
    """
    FastAPI dependency to get current user if authenticated.
    Returns None if no valid token.
    """
    if not credentials:
        return None
    
    try:
        token_data = await verify_token(credentials.credentials)
        return AuthenticatedUser(token_data)
    except HTTPException:
        return None


# =============================================================================
# Utility Functions
# =============================================================================

def print_auth_config():
    """Print current B2C CIAM configuration (for debugging)"""
    print("=" * 60)
    print("Azure AD B2C CIAM Configuration")
    print("=" * 60)
    print(f"Tenant Name:    {B2C_TENANT_NAME}")
    print(f"Tenant Domain:  {B2C_TENANT_DOMAIN}")
    print(f"Tenant ID:      {B2C_TENANT_ID}")
    print(f"CIAM Domain:    {B2C_DOMAIN}")
    print(f"Client ID:      {B2C_CLIENT_ID}")
    print(f"JWKS URLs:      {JWKS_URLS}")
    print(f"Valid Issuers:  {VALID_ISSUERS}")
    print("=" * 60)


# Print config on import if DEBUG is enabled
if os.getenv("DEBUG", "").lower() == "true":
    print_auth_config()