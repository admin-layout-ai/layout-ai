# backend/app/routers/users.py
"""
User management endpoints for Layout AI
UPDATED: Added /me/check endpoint to verify if user exists without auto-creating
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime
import logging

from ..database import get_db
from .. import models
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


# =============================================================================
# Schemas
# =============================================================================

class UserResponse(BaseModel):
    """User response schema"""
    id: int
    azure_ad_id: str
    email: str
    full_name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    is_builder: bool
    abn_acn: Optional[str] = None
    builder_logo_url: Optional[str] = None
    subscription_tier: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserCheckResponse(BaseModel):
    """Response for user existence check"""
    exists: bool
    user: Optional[UserResponse] = None


class UserCreateRequest(BaseModel):
    """Schema for creating a new user (from welcome form)"""
    full_name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_builder: bool = False
    abn_acn: Optional[str] = None


class UserUpdateRequest(BaseModel):
    """Schema for updating user profile"""
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    email: Optional[EmailStr] = None
    is_builder: Optional[bool] = None
    abn_acn: Optional[str] = None
    builder_logo_url: Optional[str] = None


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/me/check", response_model=UserCheckResponse)
async def check_user_exists(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check if user exists in database WITHOUT auto-creating.
    Used by frontend to determine if welcome form should be shown.
    
    Returns:
        exists: True if user record exists in database
        user: User data if exists, None otherwise
    """
    logger.info(f"Checking if user exists for azure_ad_id: {current_user.id}")
    
    # Look up user by Azure AD ID
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if db_user:
        logger.info(f"User exists: {db_user.id}")
        return UserCheckResponse(exists=True, user=db_user)
    
    logger.info(f"User does not exist for azure_ad_id: {current_user.id}")
    return UserCheckResponse(exists=False, user=None)


@router.post("/me", response_model=UserResponse)
async def create_user(
    user_data: UserCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new user record (called after welcome form submission).
    """
    logger.info(f"Creating user for azure_ad_id: {current_user.id}")
    
    # Check if user already exists
    existing_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists"
        )
    
    # Get email from token
    email = current_user.email
    if not email or email == '':
        email = f"user_{current_user.id[:8]}@layout-ai.com.au"
        logger.warning(f"No email in token, using generated: {email}")
    
    # Create new user
    db_user = models.User(
        azure_ad_id=current_user.id,
        email=email,
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        phone=user_data.phone,
        address=user_data.address,
        is_active=True,
        is_builder=user_data.is_builder,
        abn_acn=user_data.abn_acn,
        subscription_tier="free",
        created_at=datetime.utcnow()
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    logger.info(f"Created new user with ID: {db_user.id}")
    return db_user


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user profile. Returns 404 if user doesn't exist.
    Use /me/check to check existence without error, then POST /me to create.
    """
    logger.info(f"Getting user for azure_ad_id: {current_user.id}")
    
    # Look up user by Azure AD ID (sub claim)
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please complete registration."
        )
    
    logger.info(f"Found user: {db_user.id}")
    
    # Update user info if it has changed
    updated = False
    
    # Update email if we have a better one
    if current_user.email and current_user.email != db_user.email:
        if '@placeholder' not in current_user.email:
            db_user.email = current_user.email
            updated = True
            logger.info(f"Updated email to: {current_user.email}")
    
    if updated:
        db_user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_user)
    
    return db_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    update_data: UserUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile.
    """
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields if provided
    if update_data.full_name is not None:
        db_user.full_name = update_data.full_name
    
    if update_data.company_name is not None:
        db_user.company_name = update_data.company_name
    
    if update_data.phone is not None:
        db_user.phone = update_data.phone
    
    if update_data.address is not None:
        db_user.address = update_data.address
    
    if update_data.is_builder is not None:
        db_user.is_builder = update_data.is_builder
    
    if update_data.abn_acn is not None:
        db_user.abn_acn = update_data.abn_acn
    
    if update_data.builder_logo_url is not None:
        db_user.builder_logo_url = update_data.builder_logo_url
    
    if update_data.email is not None:
        existing = db.query(models.User).filter(
            models.User.email == update_data.email,
            models.User.id != db_user.id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        
        db_user.email = update_data.email
    
    db_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_user)
    
    return db_user


@router.get("/me/subscription")
async def get_subscription_status(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's subscription status.
    """
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    project_count = db.query(models.Project).filter(
        models.Project.user_id == db_user.id
    ).count()
    
    tier_limits = {
        "free": 2,
        "basic": 10,
        "professional": 50,
        "enterprise": -1
    }
    
    limit = tier_limits.get(db_user.subscription_tier, 2)
    
    return {
        "tier": db_user.subscription_tier,
        "project_count": project_count,
        "project_limit": limit,
        "can_create_project": limit == -1 or project_count < limit
    }
