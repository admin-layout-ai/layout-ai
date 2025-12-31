# backend/app/routers/projects.py
# UPDATED: Projects router with B2C authentication
# This replaces your current projects.py - now uses token auth instead of user_id param

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser
from ..analytics import analytics

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


def get_db_user(current_user: AuthenticatedUser, db: Session) -> models.User:
    """Helper to get database user from authenticated token user."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        # Auto-create user if they don't exist yet
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
    
    return db_user


@router.post("/", response_model=schemas.ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: schemas.ProjectCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project for the authenticated user."""
    db_user = get_db_user(current_user, db)
    
    # Calculate land area
    land_area = None
    if project.land_width and project.land_depth:
        land_area = project.land_width * project.land_depth
    
    db_project = models.Project(
        user_id=db_user.id,
        name=project.name,
        land_width=project.land_width,
        land_depth=project.land_depth,
        land_area=land_area,
        bedrooms=project.bedrooms,
        bathrooms=project.bathrooms,
        living_areas=project.living_areas,
        garage_spaces=project.garage_spaces,
        storeys=project.storeys,
        style=project.style,
        state=project.state,
        status=models.ProjectStatus.DRAFT,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # Track analytics
    analytics.track_event("project_created", db_user.id, {
        "project_id": db_project.id,
        "bedrooms": project.bedrooms,
        "bathrooms": project.bathrooms,
        "style": project.style,
        "state": project.state,
        "land_area": land_area
    })
    
    return db_project


@router.get("/", response_model=List[schemas.ProjectResponse])
async def list_projects(
    current_user: AuthenticatedUser = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all projects for the authenticated user."""
    db_user = get_db_user(current_user, db)
    
    projects = db.query(models.Project).filter(
        models.Project.user_id == db_user.id
    ).order_by(models.Project.created_at.desc()).offset(skip).limit(limit).all()
    
    return projects


@router.get("/{project_id}", response_model=schemas.ProjectResponse)
async def get_project(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific project by ID."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project


@router.put("/{project_id}", response_model=schemas.ProjectResponse)
async def update_project(
    project_id: int,
    project_update: schemas.ProjectUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project."""
    db_user = get_db_user(current_user, db)
    
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update fields
    update_data = project_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_project, field, value)
    
    # Recalculate land area if dimensions changed
    if db_project.land_width and db_project.land_depth:
        db_project.land_area = db_project.land_width * db_project.land_depth
    
    db_project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_project)
    
    # Track analytics
    analytics.track_event("project_updated", db_user.id, {
        "project_id": project_id,
        "updated_fields": list(update_data.keys())
    })
    
    return db_project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project."""
    db_user = get_db_user(current_user, db)
    
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Track analytics before deleting
    analytics.track_event("project_deleted", db_user.id, {
        "project_id": project_id,
        "project_name": db_project.name
    })
    
    db.delete(db_project)
    db.commit()
    
    return None


@router.post("/{project_id}/questionnaire", response_model=schemas.ProjectResponse)
async def submit_questionnaire(
    project_id: int,
    questionnaire: schemas.QuestionnaireResponse,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit questionnaire data for a project."""
    db_user = get_db_user(current_user, db)
    
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update project with questionnaire data
    db_project.bedrooms = questionnaire.bedrooms
    db_project.bathrooms = questionnaire.bathrooms
    db_project.living_areas = questionnaire.living_areas
    db_project.garage_spaces = questionnaire.garage_spaces
    db_project.storeys = questionnaire.storeys
    db_project.style = questionnaire.style
    db_project.open_plan = questionnaire.open_plan
    db_project.outdoor_entertainment = questionnaire.outdoor_entertainment
    db_project.home_office = questionnaire.home_office
    db_project.budget_min = questionnaire.budget_min
    db_project.budget_max = questionnaire.budget_max
    db_project.status = models.ProjectStatus.QUESTIONNAIRE
    db_project.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_project)
    
    # Track analytics
    analytics.track_event("questionnaire_submitted", db_user.id, {
        "project_id": project_id,
        "bedrooms": questionnaire.bedrooms,
        "bathrooms": questionnaire.bathrooms,
        "style": questionnaire.style,
        "has_home_office": questionnaire.home_office
    })
    
    return db_project


@router.get("/{project_id}/floor-plans", response_model=List[schemas.FloorPlanResponse])
async def get_floor_plans(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all floor plans for a project."""
    db_user = get_db_user(current_user, db)
    
    # Verify project belongs to user
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    plans = db.query(models.FloorPlan).filter(
        models.FloorPlan.project_id == project_id
    ).all()
    
    return plans
