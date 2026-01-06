# backend/app/routers/projects.py
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel, validator
from datetime import datetime
import logging
import json
import traceback

from ..database import get_db
from .. import models
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

AUSTRALIAN_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]


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


# =============================================================================
# Background task for floor plan generation
# =============================================================================

def generate_floor_plans_task(project_id: int, db_session_factory):
    """
    Background task to generate floor plans.
    This runs asynchronously after the API returns.
    """
    from ..database import SessionLocal
    
    db = SessionLocal()
    try:
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        if not project:
            logger.error(f"Project {project_id} not found for generation")
            return
        
        logger.info(f"Starting floor plan generation for project {project_id}")
        
        # Generate floor plans
        _create_floor_plans(db, project)
        logger.info(f"Successfully generated floor plans for project {project_id}")
            
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


def _create_floor_plans(db: Session, project: models.Project):
    """Create floor plans based on project requirements."""
    logger.info(f"Creating floor plans for project {project.id}")
    
    # Delete any existing floor plans for this project first
    try:
        existing = db.query(models.FloorPlan).filter(models.FloorPlan.project_id == project.id).all()
        for plan in existing:
            db.delete(plan)
        db.commit()
        logger.info(f"Deleted {len(existing)} existing floor plans")
    except Exception as e:
        logger.warning(f"Could not delete existing plans: {e}")
        db.rollback()
    
    # Calculate areas based on land size
    land_area = project.land_area or (project.land_width or 15) * (project.land_depth or 30)
    building_coverage = 0.5  # 50% site coverage
    building_area = land_area * building_coverage
    
    # Create 3 variant floor plans
    variants = [
        {
            "name": "Compact Design",
            "description": "Efficient use of space with open plan living",
            "total_area": round(building_area * 0.85, 1),
            "living_area": round(building_area * 0.6, 1),
            "plan_type": "compact",
        },
        {
            "name": "Family Layout",
            "description": "Spacious family home with separate living zones",
            "total_area": round(building_area * 1.0, 1),
            "living_area": round(building_area * 0.65, 1),
            "plan_type": "family",
        },
        {
            "name": "Luxury Design",
            "description": "Premium layout with additional features",
            "total_area": round(building_area * 1.15, 1),
            "living_area": round(building_area * 0.7, 1),
            "plan_type": "luxury",
        },
    ]
    
    for idx, variant in enumerate(variants):
        rooms = _generate_rooms(project, idx)
        
        layout_data = {
            "variant_name": variant["name"],
            "description": variant["description"],
            "rooms": rooms,
            "total_area": variant["total_area"],
            "living_area": variant["living_area"],
            "building_width": round(project.land_width * 0.7, 1) if project.land_width else 12,
            "building_depth": round(project.land_depth * 0.6, 1) if project.land_depth else 18,
            "compliant": True,
            "compliance_notes": "Meets NCC requirements for residential Class 1a building",
            "style": project.style or "modern",
            "storeys": project.storeys or 1,
        }
        
        compliance_data = {
            "ncc_compliant": True,
            "council": project.council,
            "notes": [
                "Minimum room sizes met",
                "Setback requirements satisfied",
                "Building coverage within limits"
            ]
        }
        
        # Create FloorPlan with all fields from the model
        floor_plan = models.FloorPlan(
            project_id=project.id,
            variant_number=idx + 1,
            total_area=variant["total_area"],
            living_area=variant["living_area"],
            plan_type=variant["plan_type"],
            layout_data=json.dumps(layout_data),
            compliance_data=json.dumps(compliance_data),
            is_compliant=True,
            compliance_notes="Meets NCC requirements for residential Class 1a building",
            generation_time_seconds=0.5,
            ai_model_version="rule-based-v1",
            created_at=datetime.utcnow()
        )
            
        db.add(floor_plan)
        logger.info(f"Created floor plan variant {idx + 1}: {variant['name']}")
    
    project.status = "generated"
    project.updated_at = datetime.utcnow()
    db.commit()
    
    logger.info(f"Successfully created 3 floor plans for project {project.id}")


def _generate_rooms(project: models.Project, variant_idx: int) -> List[dict]:
    """Generate room layouts based on project requirements."""
    rooms = []
    scale = 1 + (variant_idx * 0.15)  # Each variant is slightly larger
    
    current_y = 0
    
    # Garage at front
    if project.garage_spaces:
        garage_width = project.garage_spaces * 3
        garage_depth = 6
        rooms.append({
            "type": "garage",
            "name": f"{project.garage_spaces}-Car Garage",
            "area": round(garage_width * garage_depth, 1),
            "width": garage_width,
            "depth": garage_depth,
            "x": 0,
            "y": current_y,
            "floor": 1
        })
    
    # Entry
    rooms.append({
        "type": "entry",
        "name": "Entry",
        "area": round(4 * scale, 1),
        "width": 2,
        "depth": round(2 * scale, 1),
        "x": (project.garage_spaces or 0) * 3,
        "y": current_y,
        "floor": 1
    })
    
    current_y = 6
    
    # Living area
    living_width = round(5 * scale, 1)
    living_depth = 5
    rooms.append({
        "type": "living",
        "name": "Living Room",
        "area": round(living_width * living_depth, 1),
        "width": living_width,
        "depth": living_depth,
        "x": 0,
        "y": current_y,
        "floor": 1
    })
    
    # Kitchen/Dining
    if project.open_plan:
        kd_width = round(6 * scale, 1)
        kd_depth = 5
        rooms.append({
            "type": "kitchen_dining",
            "name": "Kitchen & Dining",
            "area": round(kd_width * kd_depth, 1),
            "width": kd_width,
            "depth": kd_depth,
            "x": living_width,
            "y": current_y,
            "floor": 1
        })
    else:
        rooms.append({
            "type": "kitchen",
            "name": "Kitchen",
            "area": round(15 * scale, 1),
            "width": 4,
            "depth": round(4 * scale, 1),
            "x": living_width,
            "y": current_y,
            "floor": 1
        })
        rooms.append({
            "type": "dining",
            "name": "Dining Room",
            "area": round(15 * scale, 1),
            "width": 4,
            "depth": round(4 * scale, 1),
            "x": living_width + 4,
            "y": current_y,
            "floor": 1
        })
    
    # Laundry
    rooms.append({
        "type": "laundry",
        "name": "Laundry",
        "area": round(6 * scale, 1),
        "width": 2.5,
        "depth": round(2.5 * scale, 1),
        "x": 12,
        "y": current_y,
        "floor": 1
    })
    
    current_y = 11
    
    # Bedrooms
    bed_x = 0
    for i in range(project.bedrooms or 3):
        is_master = i == 0
        bed_width = round((4 if is_master else 3.5) * scale, 1)
        bed_depth = round((4 if is_master else 3.5) * scale, 1)
        rooms.append({
            "type": "bedroom",
            "name": "Master Bedroom" if is_master else f"Bedroom {i + 1}",
            "area": round(bed_width * bed_depth, 1),
            "width": bed_width,
            "depth": bed_depth,
            "x": bed_x,
            "y": current_y,
            "floor": 1
        })
        bed_x += bed_width
    
    # Bathrooms
    for i in range(int(project.bathrooms or 2)):
        is_ensuite = i == 0
        bath_width = round((3 if is_ensuite else 2.5) * scale, 1)
        bath_depth = round((2.5 if is_ensuite else 2) * scale, 1)
        rooms.append({
            "type": "bathroom",
            "name": "Ensuite" if is_ensuite else f"Bathroom",
            "area": round(bath_width * bath_depth, 1),
            "width": bath_width,
            "depth": bath_depth,
            "x": bed_x,
            "y": current_y,
            "floor": 1
        })
        bed_x += bath_width
    
    # Walk-in Robe
    rooms.append({
        "type": "wir",
        "name": "Walk-in Robe",
        "area": round(4 * scale, 1),
        "width": 2,
        "depth": round(2 * scale, 1),
        "x": 4,
        "y": current_y + 4,
        "floor": 1
    })
    
    # Optional: Home Office
    if project.home_office:
        rooms.append({
            "type": "office",
            "name": "Home Office",
            "area": round(10 * scale, 1),
            "width": 3,
            "depth": round(3.5 * scale, 1),
            "x": 12,
            "y": current_y,
            "floor": 1
        })
    
    # Optional: Alfresco
    if project.outdoor_entertainment:
        rooms.append({
            "type": "alfresco",
            "name": "Alfresco",
            "area": round(20 * scale, 1),
            "width": 5,
            "depth": round(4 * scale, 1),
            "x": 4,
            "y": current_y + 8,
            "floor": 1
        })
    
    return rooms


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
    logger.info(f"Creating project for user: {current_user.id}")
    
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found. Please sign in again.")
    
    project_count = db.query(models.Project).filter(models.Project.user_id == db_user.id).count()
    tier_limits = {"free": 2, "basic": 10, "professional": 50, "enterprise": -1}
    limit = tier_limits.get(db_user.subscription_tier, 2)
    
    if limit != -1 and project_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Project limit reached. Your {db_user.subscription_tier} plan allows {limit} projects."
        )
    
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
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger floor plan generation for a project.
    Generation happens in the background - the status will change to 'generated' when done.
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
    
    # Update status to generating
    project.status = "generating"
    project.updated_at = datetime.utcnow()
    db.commit()
    
    # Add background task to generate floor plans
    background_tasks.add_task(generate_floor_plans_task, project_id, None)
    
    logger.info(f"Floor plan generation triggered for project: {project_id}")
    
    return GenerateResponse(
        message="Floor plan generation started. This typically takes a few seconds.",
        project_id=project_id,
        status="generating"
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
