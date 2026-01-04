# backend/app/routers/projects.py
"""
Project management endpoints for Layout AI
Handles project creation with questionnaire data
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import logging

from ..database import get_db
from .. import models
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# =============================================================================
# Schemas
# =============================================================================

class ProjectCreateRequest(BaseModel):
    """Schema for creating a new project with requirements"""
    name: str
    description: Optional[str] = None
    
    # Land/Site information
    land_size: Optional[float] = None
    land_dimensions: Optional[Dict[str, Any]] = None
    land_contour_url: Optional[str] = None
    
    # Building requirements from questionnaire
    building_type: Optional[str] = None  # single_storey, double_storey
    num_bedrooms: Optional[int] = None
    num_bathrooms: Optional[float] = None  # Can be 3.5 for example
    num_living_areas: Optional[int] = None
    num_garages: Optional[int] = None
    
    # Style preferences
    style: Optional[str] = None  # Modern, Traditional, etc.
    
    # Features (stored in questionnaire_data)
    features: Optional[List[str]] = None  # ["Open Plan", "Home Office", etc.]
    
    # Full questionnaire data (JSON)
    questionnaire_data: Optional[Dict[str, Any]] = None
    
    # NCC Compliance
    ncc_zone: Optional[str] = None
    bushfire_level: Optional[str] = None


class ProjectUpdateRequest(BaseModel):
    """Schema for updating a project"""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    land_size: Optional[float] = None
    land_dimensions: Optional[Dict[str, Any]] = None
    land_contour_url: Optional[str] = None
    building_type: Optional[str] = None
    num_bedrooms: Optional[int] = None
    num_bathrooms: Optional[float] = None
    num_living_areas: Optional[int] = None
    num_garages: Optional[int] = None
    questionnaire_data: Optional[Dict[str, Any]] = None
    ncc_zone: Optional[str] = None
    bushfire_level: Optional[str] = None


class ProjectResponse(BaseModel):
    """Project response schema"""
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    status: str
    land_size: Optional[float] = None
    land_dimensions: Optional[Dict[str, Any]] = None
    land_contour_url: Optional[str] = None
    building_type: Optional[str] = None
    num_bedrooms: Optional[int] = None
    num_bathrooms: Optional[int] = None
    num_living_areas: Optional[int] = None
    num_garages: Optional[int] = None
    questionnaire_data: Optional[Dict[str, Any]] = None
    ncc_zone: Optional[str] = None
    bushfire_level: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """Response for project list"""
    projects: List[ProjectResponse]
    total: int
    page: int
    page_size: int


# =============================================================================
# Endpoints
# =============================================================================

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new project with requirements from questionnaire.
    Called when user clicks 'Generate Floor Plans'.
    """
    logger.info(f"Creating project for user: {current_user.id}")
    logger.info(f"Project data: {project_data.dict()}")
    
    # Get user from database
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please sign in again."
        )
    
    # Check subscription limits
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
    if limit != -1 and project_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Project limit reached. Your {db_user.subscription_tier} plan allows {limit} projects. Please upgrade to create more."
        )
    
    # Build questionnaire_data JSON with all requirements
    questionnaire_data = project_data.questionnaire_data or {}
    
    # Add individual fields to questionnaire_data for easy access
    questionnaire_data.update({
        "bedrooms": project_data.num_bedrooms,
        "bathrooms": project_data.num_bathrooms,
        "living_areas": project_data.num_living_areas,
        "garages": project_data.num_garages,
        "storeys": project_data.building_type,
        "style": project_data.style,
        "features": project_data.features or [],
    })
    
    # Create project
    db_project = models.Project(
        user_id=db_user.id,
        name=project_data.name,
        description=project_data.description,
        status="processing",  # Set to processing since we're generating floor plans
        land_size=project_data.land_size,
        land_dimensions=project_data.land_dimensions,
        land_contour_url=project_data.land_contour_url,
        building_type=project_data.building_type,
        num_bedrooms=project_data.num_bedrooms,
        num_bathrooms=int(project_data.num_bathrooms) if project_data.num_bathrooms else None,
        num_living_areas=project_data.num_living_areas,
        num_garages=project_data.num_garages,
        questionnaire_data=questionnaire_data,
        ncc_zone=project_data.ncc_zone,
        bushfire_level=project_data.bushfire_level,
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    logger.info(f"Created project with ID: {db_project.id}")
    
    return db_project


@router.get("", response_model=ProjectListResponse)
@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    page: int = 1,
    page_size: int = 10,
    status_filter: Optional[str] = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all projects for the current user."""
    # Get user from database
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Build query
    query = db.query(models.Project).filter(
        models.Project.user_id == db_user.id
    )
    
    if status_filter:
        query = query.filter(models.Project.status == status_filter)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * page_size
    projects = query.order_by(models.Project.created_at.desc()).offset(offset).limit(page_size).all()
    
    return ProjectListResponse(
        projects=projects,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific project by ID."""
    # Get user from database
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get project
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    update_data: ProjectUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project."""
    # Get user from database
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get project
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update fields
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        if value is not None:
            setattr(project, field, value)
    
    # If status changed to completed, set completed_at
    if update_data.status == "completed" and not project.completed_at:
        project.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(project)
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project."""
    # Get user from database
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get project
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    db.delete(project)
    db.commit()
    
    return None


@router.post("/{project_id}/generate", response_model=ProjectResponse)
async def generate_floor_plans(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger floor plan generation for a project.
    This would typically queue a background job.
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
    
    # Get project
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update status to processing
    project.status = "processing"
    db.commit()
    db.refresh(project)
    
    # TODO: Queue background job to generate floor plans using AI
    # For now, just return the project with processing status
    
    logger.info(f"Floor plan generation triggered for project: {project_id}")
    
    return project
