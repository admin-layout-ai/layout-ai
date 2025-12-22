# backend/app/routers/users.py
"""
Users Router - User profile management
Prefix: /api/v1/users
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.auth import get_current_user, AuthenticatedUser
from app import models

# Router with prefix
router = APIRouter(prefix="/api/v1/users", tags=["Users"])


# =============================================================================
# /me ROUTES - These MUST come FIRST (before any /{id} routes)
# =============================================================================

@router.get("/me")
async def get_my_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current user's profile.
    Creates a new user record if this is their first login.
    """
    # Look for existing user in database by B2C ID
    db_user = db.query(models.User).filter(
        models.User.b2c_id == current_user.id
    ).first()
    
    # If user doesn't exist in DB, create them (first login)
    if not db_user:
        db_user = models.User(
            b2c_id=current_user.id,
            email=current_user.email,
            name=current_user.name,
            given_name=current_user.given_name,
            family_name=current_user.family_name,
            phone_number=current_user.phone_number,
            identity_provider=current_user.identity_provider,
            created_at=datetime.utcnow(),
            last_login=datetime.utcnow()
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    else:
        # Update last login time and sync B2C fields
        db_user.last_login = datetime.utcnow()
        db_user.email = current_user.email or db_user.email
        db_user.name = current_user.name or db_user.name
        db_user.given_name = current_user.given_name or db_user.given_name
        db_user.family_name = current_user.family_name or db_user.family_name
        if current_user.phone_number:
            db_user.phone_number = current_user.phone_number
        
        db.commit()
        db.refresh(db_user)
    
    return {
        "id": db_user.id,
        "b2c_id": db_user.b2c_id,
        "email": db_user.email,
        "name": db_user.name,
        "given_name": db_user.given_name,
        "family_name": db_user.family_name,
        "phone_number": db_user.phone_number,
        "identity_provider": db_user.identity_provider,
        "company_name": db_user.company_name,
        "company_abn": db_user.company_abn,
        "address": db_user.address,
        "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
        "last_login": db_user.last_login.isoformat() if db_user.last_login else None,
    }


@router.put("/me")
async def update_my_profile(
    profile_update: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the current user's profile.
    """
    db_user = db.query(models.User).filter(
        models.User.b2c_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    # Update allowed fields
    allowed_fields = ['name', 'given_name', 'family_name', 'phone_number', 
                      'company_name', 'company_abn', 'address']
    
    for field in allowed_fields:
        if field in profile_update:
            setattr(db_user, field, profile_update[field])
    
    db_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_user)
    
    return {"id": db_user.id, "message": "Profile updated successfully"}


@router.get("/me/dashboard")
async def get_dashboard_data(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get dashboard data for the current user.
    """
    # Get or create user
    db_user = db.query(models.User).filter(
        models.User.b2c_id == current_user.id
    ).first()
    
    if not db_user:
        db_user = models.User(
            b2c_id=current_user.id,
            email=current_user.email,
            name=current_user.name,
            given_name=current_user.given_name,
            family_name=current_user.family_name,
            created_at=datetime.utcnow(),
            last_login=datetime.utcnow()
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    
    # Get project stats
    total_projects = db.query(models.Project).filter(
        models.Project.user_id == current_user.id
    ).count()
    
    completed_projects = db.query(models.Project).filter(
        models.Project.user_id == current_user.id,
        models.Project.status == "completed"
    ).count()
    
    # Get recent projects
    recent_projects = db.query(models.Project).filter(
        models.Project.user_id == current_user.id
    ).order_by(
        models.Project.created_at.desc()
    ).limit(5).all()
    
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name,
        },
        "stats": {
            "total_projects": total_projects,
            "completed_projects": completed_projects,
            "plans_generated": completed_projects * 3,
            "total_spent": 0,
        },
        "recent_projects": [
            {
                "id": p.id,
                "name": p.name,
                "status": p.status,
                "bedrooms": p.bedrooms,
                "bathrooms": p.bathrooms,
                "created_at": p.created_at.isoformat() if p.created_at else None
            }
            for p in recent_projects
        ]
    }


@router.get("/me/preferences")
async def get_preferences(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user preferences."""
    db_user = db.query(models.User).filter(
        models.User.b2c_id == current_user.id
    ).first()
    
    if not db_user:
        return {"preferences": {}}
    
    return {
        "preferences": db_user.preferences or {},
        "notifications_enabled": getattr(db_user, 'notifications_enabled', True),
        "marketing_enabled": getattr(db_user, 'marketing_enabled', False)
    }


@router.put("/me/preferences")
async def update_preferences(
    preferences: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user preferences."""
    db_user = db.query(models.User).filter(
        models.User.b2c_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.preferences = preferences
    db_user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"preferences": db_user.preferences}


# =============================================================================
# /{user_id} ROUTES - These MUST come AFTER /me routes
# =============================================================================

@router.get("/{user_id}")
async def get_user_by_id(
    user_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a user by database ID."""
    db_user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.b2c_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": db_user.id,
        "email": db_user.email,
        "name": db_user.name,
    }
