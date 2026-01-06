# backend/app/routers/users.py
"""
User management endpoints for Layout AI
UPDATED: GET /me returns 404 if not found (no auto-create)
         POST /me creates user with email from request body
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


class UserCreateRequest(BaseModel):
    """Schema for creating a new user (from welcome form)"""
    full_name: str
    email: str  # Required - from complete-email page
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_builder: bool = False
    abn_acn: Optional[str] = None


class UserUpdateRequest(BaseModel):
    """Schema for updating user profile"""
    full_name: Optional[str] = None
    email: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_builder: Optional[bool] = None
    abn_acn: Optional[str] = None
    builder_logo_url: Optional[str] = None


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user profile.
    Returns 404 if user doesn't exist - use POST /me to create.
    """
    logger.info(f"Getting user for azure_ad_id: {current_user.id}")
    
    # Look up user by Azure AD ID
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        logger.info(f"User not found for azure_ad_id: {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please complete registration."
        )
    
    logger.info(f"Found user: {db_user.id}, email: {db_user.email}")
    return db_user


@router.post("/me", response_model=UserResponse)
async def create_user(
    user_data: UserCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new user record.
    Email comes from request body (collected on complete-email page).
    """
    logger.info(f"Creating user for azure_ad_id: {current_user.id}")
    logger.info(f"Request data: email={user_data.email}, name={user_data.full_name}")
    
    # Check if user already exists
    existing_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if existing_user:
        logger.info(f"User already exists: {existing_user.id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists. Use PUT to update."
        )
    
    # Validate email
    if not user_data.email or '@' not in user_data.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid email address is required"
        )
    
    # Check if email is already used by another user
    email_exists = db.query(models.User).filter(
        models.User.email == user_data.email
    ).first()
    
    if email_exists:
        logger.warning(f"Email already in use: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already registered"
        )
    
    # Create new user
    db_user = models.User(
        azure_ad_id=current_user.id,
        email=user_data.email,
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        phone=user_data.phone,
        address=user_data.address,
        is_active=True,
        is_builder=user_data.is_builder or False,
        abn_acn=user_data.abn_acn,
        subscription_tier="free",
        created_at=datetime.utcnow()
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    logger.info(f"Created new user: id={db_user.id}, email={db_user.email}")
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
    
    if update_data.email is not None:
        # Check if email is already used by another user
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
    
    db_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_user)
    
    logger.info(f"Updated user: id={db_user.id}")
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
