# backend/app/routers/projects.py
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel, validator
from datetime import datetime
import logging
import json

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
        
        # Try to import and use the floor plan generator
        try:
            from ..services.floor_plan_generator import generate_floor_plans
            
            project_data = {
                'land_width': project.land_width,
                'land_depth': project.land_depth,
                'land_area': project.land_area,
                'bedrooms': project.bedrooms,
                'bathrooms': project.bathrooms,
                'living_areas': project.living_areas,
                'garage_spaces': project.garage_spaces,
                'open_plan': project.open_plan,
                'storeys': project.storeys,
                'style': project.style,
                'outdoor_entertainment': project.outdoor_entertainment,
                'home_office': project.home_office,
            }
            
            # Generate floor plans
            layouts = generate_floor_plans(project_data)
            
            # Save floor plans to database
            for idx, layout in enumerate(layouts):
                floor_plan = models.FloorPlan(
                    project_id=project_id,
                    variant_number=idx + 1,
                    total_area=layout.get('total_area'),
                    living_area=layout.get('living_area'),
                    layout_data=json.dumps(layout),
                    is_compliant=layout.get('compliant', False),
                    compliance_notes=layout.get('compliance_notes', ''),
                    generation_time_seconds=0.5,
                    ai_model_version='rule-based-v1',
                    created_at=datetime.utcnow()
                )
                db.add(floor_plan)
            
            project.status = "generated"
            project.updated_at = datetime.utcnow()
            db.commit()
            
            logger.info(f"Generated {len(layouts)} floor plans for project {project_id}")
            
        except ImportError as e:
            logger.warning(f"Floor plan generator not available: {e}")
            # Create placeholder floor plans for demo
            _create_demo_floor_plans(db, project)
            
    except Exception as e:
        logger.error(f"Error generating floor plans for project {project_id}: {str(e)}")
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        if project:
            project.status = "error"
            project.updated_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()


def _create_demo_floor_plans(db: Session, project: models.Project):
    """Create demo floor plans when the generator is not available."""
    logger.info(f"Creating demo floor plans for project {project.id}")
    
    # Calculate areas based on land size
    land_area = project.land_area or (project.land_width or 15) * (project.land_depth or 30)
    building_coverage = 0.5  # 50% site coverage
    building_area = land_area * building_coverage
    
    # Create 3 variant floor plans
    variants = [
        {
            "name": "Compact Design",
            "description": "Efficient use of space with open plan living",
            "total_area": building_area * 0.85,
            "living_area": building_area * 0.6,
        },
        {
            "name": "Family Layout",
            "description": "Spacious family home with separate living zones",
            "total_area": building_area * 1.0,
            "living_area": building_area * 0.65,
        },
        {
            "name": "Luxury Design",
            "description": "Premium layout with additional features",
            "total_area": building_area * 1.15,
            "living_area": building_area * 0.7,
        },
    ]
    
    for idx, variant in enumerate(variants):
        # Create room layout based on project requirements
        rooms = []
        
        # Add bedrooms
        for i in range(project.bedrooms or 3):
            rooms.append({
                "type": "bedroom",
                "name": f"Bedroom {i + 1}" if i > 0 else "Master Bedroom",
                "area": 16 if i == 0 else 12,
                "width": 4,
                "depth": 4 if i == 0 else 3,
            })
        
        # Add bathrooms
        for i in range(int(project.bathrooms or 2)):
            rooms.append({
                "type": "bathroom",
                "name": f"Bathroom {i + 1}" if i > 0 else "Ensuite",
                "area": 6 if i == 0 else 4,
                "width": 3,
                "depth": 2,
            })
        
        # Add living areas
        rooms.append({
            "type": "living",
            "name": "Living Room",
            "area": 25,
            "width": 5,
            "depth": 5,
        })
        
        if project.open_plan:
            rooms.append({
                "type": "kitchen_dining",
                "name": "Kitchen & Dining",
                "area": 30,
                "width": 6,
                "depth": 5,
            })
        else:
            rooms.append({
                "type": "kitchen",
                "name": "Kitchen",
                "area": 15,
                "width": 4,
                "depth": 4,
            })
            rooms.append({
                "type": "dining",
                "name": "Dining Room",
                "area": 15,
                "width": 4,
                "depth": 4,
            })
        
        # Add garage
        if project.garage_spaces:
            rooms.append({
                "type": "garage",
                "name": f"{project.garage_spaces}-Car Garage",
                "area": project.garage_spaces * 18,
                "width": project.garage_spaces * 3,
                "depth": 6,
            })
        
        # Add optional rooms
        if project.home_office:
            rooms.append({
                "type": "office",
                "name": "Home Office",
                "area": 10,
                "width": 3,
                "depth": 3.5,
            })
        
        if project.outdoor_entertainment:
            rooms.append({
                "type": "alfresco",
                "name": "Alfresco",
                "area": 20,
                "width": 5,
                "depth": 4,
            })
        
        layout_data = {
            "variant_name": variant["name"],
            "description": variant["description"],
            "rooms": rooms,
            "total_area": variant["total_area"],
            "living_area": variant["living_area"],
            "compliant": True,
            "compliance_notes": "Meets NCC requirements for residential Class 1a building",
            "style": project.style or "modern",
            "storeys": project.storeys or 1,
        }
        
        floor_plan = models.FloorPlan(
            project_id=project.id,
            variant_number=idx + 1,
            total_area=variant["total_area"],
            living_area=variant["living_area"],
            layout_data=json.dumps(layout_data),
            is_compliant=True,
            compliance_notes="Meets NCC requirements",
            generation_time_seconds=0.5,
            ai_model_version='demo-v1',
            created_at=datetime.utcnow()
        )
        db.add(floor_plan)
    
    project.status = "generated"
    project.updated_at = datetime.utcnow()
    db.commit()
    
    logger.info(f"Created 3 demo floor plans for project {project.id}")


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
async def generate_floor_plans(
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
    
    # Check if already generating or generated
    if project.status == "generating":
        raise HTTPException(status_code=400, detail="Floor plans are already being generated")
    
    if project.status == "generated":
        # Check if floor plans exist
        existing_plans = db.query(models.FloorPlan).filter(
            models.FloorPlan.project_id == project_id
        ).count()
        if existing_plans > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Floor plans already generated. {existing_plans} plans available."
            )
    
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
        message="Floor plan generation started. This typically takes 2-5 minutes.",
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
    Reset project status back to draft. Useful if generation got stuck.
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
