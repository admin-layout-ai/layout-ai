# backend/app/routers/projects.py
# Project management router
#
# UPDATED: Now generates 3 floor plan variants instead of 1

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel, validator
from datetime import datetime
import logging
import traceback

from ..database import get_db
from .. import models
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

AUSTRALIAN_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]

# Default number of floor plan variants to generate
DEFAULT_VARIANT_COUNT = 3


class ProjectCreateRequest(BaseModel):
    name: str
    land_width: Optional[float] = None
    land_depth: Optional[float] = None
    land_area: Optional[float] = None
    land_slope: Optional[str] = None
    orientation: Optional[str] = None
    street_frontage: Optional[str] = None
    contour_plan_url: Optional[str] = None
    developer_guidelines_url: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: Optional[int] = None
    style: Optional[str] = None
    open_plan: Optional[bool] = True
    outdoor_entertainment: Optional[bool] = False
    home_office: Optional[bool] = False
    lot_dp: Optional[str] = None
    street_address: Optional[str] = None
    suburb: str  # Mandatory
    state: str   # Mandatory
    postcode: str  # Mandatory
    council: Optional[str] = None
    bal_rating: Optional[str] = None
    
    @validator('state')
    def validate_state(cls, v):
        if v.upper() not in AUSTRALIAN_STATES:
            raise ValueError(f'Invalid state. Must be one of: {", ".join(AUSTRALIAN_STATES)}')
        return v.upper()
    
    @validator('postcode')
    def validate_postcode(cls, v):
        if not v.isdigit() or len(v) != 4:
            raise ValueError('Invalid postcode. Must be 4 digits.')
        return v


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    land_width: Optional[float] = None
    land_depth: Optional[float] = None
    land_area: Optional[float] = None
    land_slope: Optional[str] = None
    orientation: Optional[str] = None
    street_frontage: Optional[str] = None
    contour_plan_url: Optional[str] = None
    developer_guidelines_url: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: Optional[int] = None
    style: Optional[str] = None
    open_plan: Optional[bool] = None
    outdoor_entertainment: Optional[bool] = None
    home_office: Optional[bool] = None
    lot_dp: Optional[str] = None
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    council: Optional[str] = None
    bal_rating: Optional[str] = None


class ProjectResponse(BaseModel):
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
    developer_guidelines_url: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: Optional[int] = None
    style: Optional[str] = None
    open_plan: Optional[bool] = None
    outdoor_entertainment: Optional[bool] = None
    home_office: Optional[bool] = None
    lot_dp: Optional[str] = None
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    council: Optional[str] = None
    bal_rating: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    total: int
    page: int
    page_size: int


class GenerateResponse(BaseModel):
    message: str
    project_id: int
    status: str
    floor_plans_count: Optional[int] = None
    variants: Optional[List[str]] = None


class GenerateRequest(BaseModel):
    """Optional request body for generate endpoint."""
    variant_count: Optional[int] = DEFAULT_VARIANT_COUNT
    
    @validator('variant_count')
    def validate_variant_count(cls, v):
        if v is not None and (v < 1 or v > 5):
            raise ValueError('variant_count must be between 1 and 5')
        return v


# =============================================================================
# Background task - generates multiple floor plan variants
# =============================================================================

def generate_floor_plans_task(project_id: int, db_session_factory, variant_count: int = DEFAULT_VARIANT_COUNT):
    """
    Background task to generate multiple floor plan variants.
    Delegates to the plans module which handles Gemini AI integration.
    
    Args:
        project_id: Project ID to generate plans for
        db_session_factory: Not used (kept for backwards compatibility)
        variant_count: Number of variants to generate (default 3)
    """
    from ..database import SessionLocal
    from . import plans  # Import plans router module
    
    db = SessionLocal()
    try:
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        if not project:
            logger.error(f"Project {project_id} not found for generation")
            return
        
        # Get user for image upload
        user = db.query(models.User).filter(models.User.id == project.user_id).first()
        
        logger.info(f"Starting floor plan generation for project {project_id} ({variant_count} variants)")
        
        # Call the plans module's multi-variant generation function
        created_plans = plans.create_multiple_floor_plans_for_project(
            db, 
            project, 
            user,
            variant_count=variant_count
        )
        
        logger.info(
            f"Successfully generated {len(created_plans)} floor plan variants "
            f"for project {project_id}"
        )
            
    except Exception as e:
        logger.error(f"Error generating floor plans for project {project_id}: {str(e)}")
        logger.error(traceback.format_exc())
        try:
            project = db.query(models.Project).filter(models.Project.id == project_id).first()
            if project:
                project.status = "error"
                project.updated_at = datetime.utcnow()
                db.commit()
        except Exception as commit_error:
            logger.error(f"Error updating project status: {commit_error}")
    finally:
        db.close()


# =============================================================================
# CRUD ENDPOINTS
# =============================================================================

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found. Please complete your profile first.")
    
    land_area = project_data.land_area
    if not land_area and project_data.land_width and project_data.land_depth:
        land_area = project_data.land_width * project_data.land_depth
    
    db_project = models.Project(
        user_id=db_user.id,
        name=project_data.name,
        status="draft",
        land_width=project_data.land_width,
        land_depth=project_data.land_depth,
        land_area=land_area,
        land_slope=project_data.land_slope,
        orientation=project_data.orientation,
        street_frontage=project_data.street_frontage,
        contour_plan_url=project_data.contour_plan_url,
        developer_guidelines_url=project_data.developer_guidelines_url,
        bedrooms=project_data.bedrooms,
        bathrooms=project_data.bathrooms,
        living_areas=project_data.living_areas,
        garage_spaces=project_data.garage_spaces,
        storeys=project_data.storeys or 1,
        style=project_data.style,
        open_plan=project_data.open_plan,
        outdoor_entertainment=project_data.outdoor_entertainment,
        home_office=project_data.home_office,
        lot_dp=project_data.lot_dp,
        street_address=project_data.street_address,
        suburb=project_data.suburb,
        state=project_data.state,
        postcode=project_data.postcode,
        council=project_data.council,
        bal_rating=project_data.bal_rating,
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    logger.info(f"Created project ID: {db_project.id}")
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
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(models.Project).filter(models.Project.user_id == db_user.id)
    if status_filter:
        query = query.filter(models.Project.status == status_filter)
    
    total = query.count()
    offset = (page - 1) * page_size
    projects = query.order_by(models.Project.created_at.desc()).offset(offset).limit(page_size).all()
    
    return ProjectListResponse(projects=projects, total=total, page=page, page_size=page_size)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    update_data: ProjectUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        if hasattr(project, field):
            setattr(project, field, value)
    
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Also delete associated floor plans
    db.query(models.FloorPlan).filter(models.FloorPlan.project_id == project_id).delete()
    
    db.delete(project)
    db.commit()
    return None


@router.post("/{project_id}/generate", response_model=GenerateResponse)
async def generate_floor_plans_endpoint(
    project_id: int,
    background_tasks: BackgroundTasks,
    generate_request: Optional[GenerateRequest] = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger floor plan generation for a project.
    
    Generates multiple professional floor plan variants (default 3) using AI:
    1. Optimal Layout - Balanced, efficient design
    2. Spacious Living - Emphasis on living areas
    3. Master Retreat - Emphasis on master suite
    
    Query Parameters:
        variant_count: Number of variants to generate (1-5, default 3)
    """
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if already generating
    if project.status == "generating":
        raise HTTPException(status_code=400, detail="Floor plans are already being generated")
    
    # Allow regeneration - delete existing plans first
    if project.status == "generated":
        try:
            db.query(models.FloorPlan).filter(models.FloorPlan.project_id == project_id).delete()
            db.commit()
        except:
            db.rollback()
    
    # Validate project has required data
    if not project.bedrooms:
        raise HTTPException(
            status_code=400, 
            detail="Please complete the project questionnaire before generating floor plans"
        )
    
    # Get variant count from request or use default
    variant_count = DEFAULT_VARIANT_COUNT
    if generate_request and generate_request.variant_count:
        variant_count = generate_request.variant_count
    
    # Update status to generating
    project.status = "generating"
    project.updated_at = datetime.utcnow()
    db.commit()
    
    # Variant descriptions for response
    variant_names = [
        "Optimal Layout",
        "Spacious Living",
        "Master Retreat"
    ][:variant_count]
    
    # Add background task to generate floor plans
    background_tasks.add_task(
        generate_floor_plans_task, 
        project_id, 
        None,
        variant_count
    )
    
    logger.info(f"Floor plan generation triggered for project: {project_id} ({variant_count} variants)")
    
    return GenerateResponse(
        message=f"Floor plan generation started. Generating {variant_count} design variants. This typically takes 30-60 seconds.",
        project_id=project_id,
        status="generating",
        floor_plans_count=variant_count,
        variants=variant_names
    )


@router.post("/{project_id}/reset-status", response_model=ProjectResponse)
async def reset_project_status(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reset project status back to draft. Useful if generation got stuck or errored.
    """
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.status = "draft"
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    
    logger.info(f"Reset project {project_id} status to draft")
    return project


@router.get("/{project_id}/generation-status")
async def get_generation_status(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current generation status for a project including generated plans count.
    """
    db_user = db.query(models.User).filter(models.User.azure_ad_id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get count of generated plans
    plans_count = db.query(models.FloorPlan).filter(
        models.FloorPlan.project_id == project_id
    ).count()
    
    # Get plan summaries if generated
    plans_summary = []
    if project.status == "generated":
        plans = db.query(models.FloorPlan).filter(
            models.FloorPlan.project_id == project_id
        ).order_by(models.FloorPlan.variant_number).all()
        
        for plan in plans:
            plans_summary.append({
                'id': plan.id,
                'variant_number': plan.variant_number,
                'plan_type': plan.plan_type,
                'is_compliant': plan.is_compliant,
                'total_area': plan.total_area,
                'has_image': plan.preview_image_url is not None
            })
    
    return {
        'project_id': project_id,
        'status': project.status,
        'plans_count': plans_count,
        'expected_count': DEFAULT_VARIANT_COUNT,
        'plans': plans_summary,
        'updated_at': project.updated_at.isoformat() if project.updated_at else None
    }
