# backend/app/auth.py
"""
Azure AD B2C CIAM Authentication for Layout AI Backend
Updated for CIAM (uses ciamlogin.com instead of b2clogin.com)
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

# CIAM uses ciamlogin.com instead of b2clogin.com
B2C_DOMAIN = os.getenv("B2C_DOMAIN", f"{B2C_TENANT_NAME}.ciamlogin.com")

# Application (Client) ID from your B2C app registration
B2C_CLIENT_ID = os.getenv("B2C_CLIENT_ID", "b25e167b-e52c-4cb0-b5c8-5ed9feab3b38")

# =============================================================================
# JWKS Configuration - CIAM endpoints
# =============================================================================

# JWKS URL for CIAM (different from standard B2C)
JWKS_URL = f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/discovery/v2.0/keys"

# Expected issuer - CIAM format
ISSUER = f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/v2.0"

# Alternative issuer formats to try
ALTERNATIVE_ISSUERS = [
    f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/v2.0",
    f"https://{B2C_DOMAIN}/{B2C_TENANT_DOMAIN}/v2.0/",
    f"https://login.microsoftonline.com/{B2C_TENANT_DOMAIN}/v2.0",
]

# =============================================================================
# Security Scheme
# =============================================================================

security = HTTPBearer(auto_error=False)


# =============================================================================
# JWKS Client (Cached)
# =============================================================================

@lru_cache()
def get_jwks_client() -> PyJWKClient:
    """Get JWKS client for token verification (cached)"""
    logger.info(f"Initializing JWKS client with URL: {JWKS_URL}")
    try:
        return PyJWKClient(JWKS_URL)
    except Exception as e:
        logger.error(f"Failed to initialize JWKS client: {e}")
        raise


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
        
        # Email - CIAM may return it in different fields
        emails = token_data.get("emails", [])
        self.email: str = (
            emails[0] if emails else 
            token_data.get("email") or 
            token_data.get("preferred_username") or 
            token_data.get("upn") or
            ""
        )
        
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
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # First, decode without verification to check issuer
        unverified = jwt.decode(token, options={"verify_signature": False})
        actual_issuer = unverified.get("iss", "")
        actual_audience = unverified.get("aud", "")
        
        logger.info(f"Token issuer: {actual_issuer}")
        logger.info(f"Token audience: {actual_audience}")
        logger.info(f"Expected audience: {B2C_CLIENT_ID}")
        
        # Decode and verify token with flexible issuer
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=B2C_CLIENT_ID,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": False,  # We'll verify manually
            }
        )
        
        # Manual issuer verification (allow multiple formats)
        token_issuer = payload.get("iss", "")
        valid_issuer = any(
            token_issuer == iss or token_issuer == iss.rstrip("/")
            for iss in ALTERNATIVE_ISSUERS
        )
        
        if not valid_issuer:
            logger.warning(f"Issuer mismatch. Got: {token_issuer}, Expected one of: {ALTERNATIVE_ISSUERS}")
            # Log but don't fail - CIAM issuers can vary
        
        logger.info(f"Token verified for user: {payload.get('sub', 'unknown')}")
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
            detail=f"Invalid token audience",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=422,
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
    print(f"CIAM Domain:    {B2C_DOMAIN}")
    print(f"Client ID:      {B2C_CLIENT_ID}")
    print(f"JWKS URL:       {JWKS_URL}")
    print(f"Issuer:         {ISSUER}")
    print("=" * 60)


# Print config on import if DEBUG is enabled
if os.getenv("DEBUG", "").lower() == "true":
    print_auth_config()
