# backend/app/routers/users.py
# UPDATED: User router with proper B2C authentication integration
# This replaces your current users.py to work with your frontend's expectations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, get_optional_user, AuthenticatedUser
from ..analytics import analytics

router = APIRouter(prefix="/api/v1/users", tags=["users"])


# ============================================================================
# SCHEMAS for this router (can also add to schemas.py)
# ============================================================================

class DashboardStats(BaseModel):
    total_projects: int
    completed_projects: int
    plans_generated: int


class DashboardResponse(BaseModel):
    user: schemas.UserResponse
    stats: DashboardStats
    recent_projects: list


class UserPreferences(BaseModel):
    default_style: Optional[str] = None
    default_storeys: Optional[int] = None
    notifications_enabled: bool = True
    theme: str = "dark"


# ============================================================================
# USER ENDPOINTS - These are what your frontend expects
# ============================================================================

@router.get("/me", response_model=schemas.UserResponse)
async def get_or_create_current_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user profile from B2C token.
    Creates user in database if this is their first login.
    
    This is the main endpoint your frontend calls after login.
    """
    # Look up user by Azure AD ID
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        # First time login - create user from token data
        db_user = models.User(
            azure_ad_id=current_user.id,
            email=current_user.email or f"{current_user.id}@placeholder.com",
            full_name=current_user.name or f"{current_user.given_name} {current_user.family_name}".strip() or "User",
            phone=current_user.phone_number,
            is_active=True,
            subscription_tier="free",
            created_at=datetime.utcnow()
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        # Track new user signup
        analytics.track_event("user_created", db_user.id, {
            "identity_provider": current_user.identity_provider,
            "has_email": bool(current_user.email)
        })
    else:
        # Update user info from token if changed
        updated = False
        
        if current_user.email and db_user.email != current_user.email:
            db_user.email = current_user.email
            updated = True
            
        if current_user.name and db_user.full_name != current_user.name:
            db_user.full_name = current_user.name
            updated = True
            
        if current_user.phone_number and db_user.phone != current_user.phone_number:
            db_user.phone = current_user.phone_number
            updated = True
        
        if updated:
            db_user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_user)
    
    return db_user


@router.put("/me", response_model=schemas.UserResponse)
async def update_current_user(
    updates: schemas.UserBase,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user's profile."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update allowed fields
    update_data = updates.dict(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(db_user, field):
            setattr(db_user, field, value)
    
    db_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_user)
    
    # Track profile update
    analytics.track_event("profile_updated", db_user.id, {
        "updated_fields": list(update_data.keys())
    })
    
    return db_user


@router.get("/me/dashboard")
async def get_dashboard_data(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get dashboard data including stats and recent projects.
    This is what your dashboard page calls on load.
    """
    # Get or create user
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        # Create user if doesn't exist
        db_user = models.User(
            azure_ad_id=current_user.id,
            email=current_user.email or f"{current_user.id}@placeholder.com",
            full_name=current_user.name or "User",
            is_active=True,
            subscription_tier="free"
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    
    # Get project stats
    total_projects = db.query(models.Project).filter(
        models.Project.user_id == db_user.id
    ).count()
    
    completed_projects = db.query(models.Project).filter(
        models.Project.user_id == db_user.id,
        models.Project.status == models.ProjectStatus.COMPLETED
    ).count()
    
    plans_generated = db.query(models.FloorPlan).join(models.Project).filter(
        models.Project.user_id == db_user.id
    ).count()
    
    # Get recent projects (last 5)
    recent_projects = db.query(models.Project).filter(
        models.Project.user_id == db_user.id
    ).order_by(models.Project.created_at.desc()).limit(5).all()
    
    return {
        "user": {
            "id": db_user.id,
            "azure_ad_id": db_user.azure_ad_id,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "company_name": db_user.company_name,
            "phone": db_user.phone,
            "is_active": db_user.is_active,
            "subscription_tier": db_user.subscription_tier,
            "created_at": db_user.created_at
        },
        "stats": {
            "total_projects": total_projects,
            "completed_projects": completed_projects,
            "plans_generated": plans_generated
        },
        "recent_projects": [
            {
                "id": p.id,
                "name": p.name,
                "status": p.status.value,
                "bedrooms": p.bedrooms,
                "bathrooms": p.bathrooms,
                "created_at": p.created_at.isoformat() if p.created_at else None
            }
            for p in recent_projects
        ]
    }


@router.get("/me/preferences")
async def get_user_preferences(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user preferences (stored in user record or separate table)."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return default preferences for now
    # TODO: Store preferences in database
    return UserPreferences()


@router.put("/me/preferences")
async def update_user_preferences(
    preferences: UserPreferences,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user preferences."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # TODO: Store preferences in database
    
    return preferences


# ============================================================================
# LEGACY ENDPOINTS (for backwards compatibility)
# ============================================================================

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    email: str,
    azure_ad_id: str,
    full_name: str = None,
    db: Session = Depends(get_db)
):
    """
    Create a new user (legacy endpoint).
    Note: The /me endpoint above is preferred as it uses token data.
    """
    existing_user = db.query(models.User).filter(
        models.User.email == email
    ).first()
    
    if existing_user:
        return existing_user
    
    db_user = models.User(
        azure_ad_id=azure_ad_id,
        email=email,
        full_name=full_name,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.get("/{user_id}")
async def get_user_by_id(
    user_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a user by ID (admin or self only)."""
    # Get requesting user
    requesting_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    # Only allow viewing own profile or if admin
    if not requesting_user or (requesting_user.id != user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
