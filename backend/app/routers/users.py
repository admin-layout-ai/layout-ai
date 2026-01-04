# backend/app/routers/users.py
"""
User management endpoints for Layout AI
FIXED: Properly extracts user info from B2C CIAM token
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, EmailStr
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
    is_active: bool
    is_builder: bool
    subscription_tier: str
    
    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    """Schema for updating user profile"""
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/me", response_model=UserResponse)
async def get_or_create_current_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user profile. Creates user if first login.
    User info is extracted from the B2C token.
    """
    logger.info(f"Getting/creating user for azure_ad_id: {current_user.id}")
    logger.info(f"Token claims - email: {current_user.email}, name: {current_user.name}")
    
    # Look up user by Azure AD ID (sub claim)
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if db_user:
        logger.info(f"Found existing user: {db_user.id}")
        
        # Update user info if it has changed or was incomplete
        updated = False
        
        # Update email if we have a better one
        if current_user.email and current_user.email != db_user.email:
            # Don't update if current email looks like a placeholder
            if '@placeholder' not in current_user.email and current_user.email:
                db_user.email = current_user.email
                updated = True
                logger.info(f"Updated email to: {current_user.email}")
        
        # Update name if we have a better one
        if current_user.name and current_user.name != 'unknown' and current_user.name != db_user.full_name:
            if db_user.full_name == 'unknown' or not db_user.full_name:
                db_user.full_name = current_user.name
                updated = True
                logger.info(f"Updated full_name to: {current_user.name}")
        
        # Update phone if available
        if current_user.phone_number and not db_user.phone:
            db_user.phone = current_user.phone_number
            updated = True
        
        if updated:
            db.commit()
            db.refresh(db_user)
        
        return db_user
    
    # First time login - create new user
    logger.info(f"Creating new user for: {current_user.id}")
    
    # Build proper email - don't use azure_ad_id as email
    email = current_user.email
    if not email or email == '':
        # Try to construct from other claims
        email = f"user_{current_user.id[:8]}@layout-ai.com.au"
        logger.warning(f"No email in token, using generated: {email}")
    
    # Build proper name
    full_name = current_user.name
    if not full_name or full_name == '' or full_name == 'unknown':
        # Try to build from given_name and family_name
        if current_user.given_name or current_user.family_name:
            full_name = f"{current_user.given_name} {current_user.family_name}".strip()
        else:
            full_name = "New User"
        logger.warning(f"No name in token, using: {full_name}")
    
    logger.info(f"Creating user with email={email}, name={full_name}")
    
    db_user = models.User(
        azure_ad_id=current_user.id,
        email=email,
        full_name=full_name,
        phone=current_user.phone_number,
        is_active=True,
        is_builder=False,
        subscription_tier="free"
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    logger.info(f"Created new user with ID: {db_user.id}")
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
    # Get user from database
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
    
    if update_data.email is not None:
        # Check if email is already taken by another user
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
    
    # Count user's projects
    project_count = db.query(models.Project).filter(
        models.Project.user_id == db_user.id
    ).count()
    
    # Define tier limits
    tier_limits = {
        "free": 2,
        "basic": 10,
        "professional": 50,
        "enterprise": -1  # unlimited
    }
    
    limit = tier_limits.get(db_user.subscription_tier, 2)
    
    return {
        "tier": db_user.subscription_tier,
        "project_count": project_count,
        "project_limit": limit,
        "can_create_project": limit == -1 or project_count < limit
    }