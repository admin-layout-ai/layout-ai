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
    
    # Land/Site information (matches database columns)
    land_width: Optional[float] = None
    land_depth: Optional[float] = None
    land_area: Optional[float] = None
    land_slope: Optional[str] = None
    orientation: Optional[str] = None
    street_frontage: Optional[str] = None
    contour_plan_url: Optional[str] = None
    
    # Building requirements from questionnaire (matches database columns)
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: Optional[int] = None
    
    # Style preferences
    style: Optional[str] = None
    open_plan: Optional[bool] = True
    outdoor_entertainment: Optional[bool] = False
    home_office: Optional[bool] = False
    
    # Location & Compliance
    state: Optional[str] = None
    council: Optional[str] = None
    bal_rating: Optional[str] = None


class ProjectUpdateRequest(BaseModel):
    """Schema for updating a project"""
    name: Optional[str] = None
    status: Optional[str] = None
    land_width: Optional[float] = None
    land_depth: Optional[float] = None
    land_area: Optional[float] = None
    land_slope: Optional[str] = None
    orientation: Optional[str] = None
    street_frontage: Optional[str] = None
    contour_plan_url: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: Optional[int] = None
    style: Optional[str] = None
    open_plan: Optional[bool] = None
    outdoor_entertainment: Optional[bool] = None
    home_office: Optional[bool] = None
    state: Optional[str] = None
    council: Optional[str] = None
    bal_rating: Optional[str] = None


class ProjectResponse(BaseModel):
    """Project response schema"""
    id: int
    user_id: int
    name: str
    status: Optional[str] = None
    land_width: Optional[float] = None
    land_depth: Optional[float] = None
    land_area: Optional[float] = None
    land_slope: Optional[str] = None
    orientation: Optional[str] = None
    street_frontage: Optional[str] = None
    contour_plan_url: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: Optional[int] = None
    style: Optional[str] = None
    open_plan: Optional[bool] = None
    outdoor_entertainment: Optional[bool] = None
    home_office: Optional[bool] = None
    state: Optional[str] = None
    council: Optional[str] = None
    bal_rating: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
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
    
    # Calculate land_area if width and depth provided
    land_area = project_data.land_area
    if not land_area and project_data.land_width and project_data.land_depth:
        land_area = project_data.land_width * project_data.land_depth
    
    # Create project with actual database columns
    db_project = models.Project(
        user_id=db_user.id,
        name=project_data.name,
        status=models.ProjectStatus.GENERATING,
        
        # Land details
        land_width=project_data.land_width,
        land_depth=project_data.land_depth,
        land_area=land_area,
        land_slope=project_data.land_slope,
        orientation=project_data.orientation,
        street_frontage=project_data.street_frontage,
        contour_plan_url=project_data.contour_plan_url,
        
        # Building requirements
        bedrooms=project_data.bedrooms,
        bathrooms=project_data.bathrooms,
        living_areas=project_data.living_areas,
        garage_spaces=project_data.garage_spaces,
        storeys=project_data.storeys or 1,
        
        # Style preferences
        style=project_data.style,
        open_plan=project_data.open_plan,
        outdoor_entertainment=project_data.outdoor_entertainment,
        home_office=project_data.home_office,
        
        # Location & Compliance
        state=project_data.state,
        council=project_data.council,
        bal_rating=project_data.bal_rating,
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
        if hasattr(project, field):
            setattr(project, field, value)
    
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
    
    # Update status to generating
    project.status = models.ProjectStatus.GENERATING
    db.commit()
    db.refresh(project)
    
    # TODO: Queue background job to generate floor plans using AI
    logger.info(f"Floor plan generation triggered for project: {project_id}")
    
    return project