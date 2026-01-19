# backend/app/routers/plans.py
# Floor plans API router
# Orchestrates floor plan generation using modular services
#
# UPDATED: Now supports generating multiple floor plan variants (default 3)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

from .. import models
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser

# =============================================================================
# SERVICE IMPORTS
# =============================================================================

from ..services.azure_storage import (
    upload_to_blob,
    upload_floor_plan_image,
    load_all_sample_plans,
    get_sample_plan_info,
    sanitize_path
)

from ..services.geometry import (
    get_aspect_ratio,
    WALL_CALC
)

from ..services.council_validation import (
    calculate_building_envelope,
    validate_lot_requirements,
    get_all_councils,
    get_council_info,
    get_setbacks
)

from ..services.NCC import (
    get_minimum_room_sizes,
    get_ncc_requirements_summary
)

from ..services.room_sizing import (
    calculate_room_sizes
)

from ..services.sample_selection import (
    select_best_sample
)

from ..services.layout_validation import (
    validate_generated_plan,
    run_full_validation,
    get_validation_score
)

from ..services.gemini_service import (
    generate_with_validation,
    NANO_BANANA_PRO_MODEL
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

logger.info("Floor Plan Router: Modular architecture loaded - Multi-variant support enabled")


# =============================================================================
# CONFIGURATION
# =============================================================================

# Default number of floor plan variants to generate
DEFAULT_VARIANT_COUNT = 3

# Variant configurations for different design approaches
VARIANT_CONFIGS = [
    {
        'name': 'Optimal Layout',
        'description': 'Balanced design optimizing space efficiency',
        'temperature': 0.3,
        'style_emphasis': 'efficiency',
        'room_size_bias': 0.0,  # No bias - use calculated sizes
    },
    {
        'name': 'Spacious Living',
        'description': 'Emphasis on larger living areas',
        'temperature': 0.4,
        'style_emphasis': 'living_space',
        'room_size_bias': 0.1,  # 10% larger living areas
    },
    {
        'name': 'Master Retreat',
        'description': 'Emphasis on master suite and private areas',
        'temperature': 0.35,
        'style_emphasis': 'master_suite',
        'room_size_bias': 0.15,  # 15% larger master areas
    },
]


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class FloorPlanResponse(BaseModel):
    id: int
    project_id: int
    variant_number: Optional[int] = None
    total_area: Optional[float] = None
    living_area: Optional[float] = None
    plan_type: Optional[str] = None
    layout_data: Optional[str] = None
    compliance_data: Optional[str] = None
    pdf_url: Optional[str] = None
    dxf_url: Optional[str] = None
    preview_image_url: Optional[str] = None
    model_3d_url: Optional[str] = None
    is_compliant: Optional[bool] = None
    compliance_notes: Optional[str] = None
    generation_time_seconds: Optional[float] = None
    ai_model_version: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UpdateLayoutDataRequest(BaseModel):
    """Request model for updating floor plan layout_data (e.g., to ignore errors/warnings)."""
    layout_data: str


# =============================================================================
# HELPERS
# =============================================================================

def get_db_user(current_user: AuthenticatedUser, db: Session) -> models.User:
    """Get database user from authenticated user."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


def build_requirements_from_project(project: models.Project) -> dict:
    """Extract requirements dict from project model."""
    return {
        'land_width': project.land_width or 14,
        'land_depth': project.land_depth or 25,
        'bedrooms': project.bedrooms or 4,
        'bathrooms': project.bathrooms or 2,
        'garage_spaces': project.garage_spaces or 2,
        'living_areas': project.living_areas or 1,
        'home_office': project.home_office or False,
        'has_study': project.home_office or False,
        'outdoor_entertainment': project.outdoor_entertainment if project.outdoor_entertainment is not None else True,
        'open_plan': project.open_plan if project.open_plan is not None else True,
        'style': project.style or 'Modern Australian',
        'council': getattr(project, 'council', None),
        'postcode': getattr(project, 'postcode', None),
        'storeys': getattr(project, 'storeys', 1) or 1
    }


def apply_variant_config(
    room_sizes: dict, 
    config: dict
) -> dict:
    """
    Apply variant-specific adjustments to room sizes.
    
    Args:
        room_sizes: Base calculated room sizes
        config: Variant configuration dict
    
    Returns:
        Adjusted room sizes dict
    """
    if config['room_size_bias'] == 0:
        return room_sizes
    
    adjusted = room_sizes.copy()
    bias = config['room_size_bias']
    emphasis = config['style_emphasis']
    
    # Apply bias based on emphasis type
    if emphasis == 'living_space':
        # Increase living areas
        for key in ['family', 'lounge', 'living', 'dining']:
            if key in adjusted:
                adjusted[key]['area'] = int(adjusted[key]['area'] * (1 + bias))
                adjusted[key]['min_width'] = round(adjusted[key]['min_width'] * (1 + bias * 0.5), 1)
                adjusted[key]['min_depth'] = round(adjusted[key]['min_depth'] * (1 + bias * 0.5), 1)
    
    elif emphasis == 'master_suite':
        # Increase master bedroom, ensuite, WIR
        for key in ['master_bedroom', 'ensuite', 'wir']:
            if key in adjusted:
                adjusted[key]['area'] = int(adjusted[key]['area'] * (1 + bias))
                adjusted[key]['min_width'] = round(adjusted[key]['min_width'] * (1 + bias * 0.5), 1)
                adjusted[key]['min_depth'] = round(adjusted[key]['min_depth'] * (1 + bias * 0.5), 1)
    
    return adjusted


# =============================================================================
# SINGLE VARIANT GENERATION
# =============================================================================

def generate_single_variant(
    db: Session,
    project: models.Project,
    user: models.User,
    requirements: dict,
    samples: list,
    building_width: float,
    building_depth: float,
    setbacks: dict,
    variant_number: int,
    variant_config: dict,
    start_time: datetime
) -> Optional[models.FloorPlan]:
    """
    Generate a single floor plan variant.
    
    Args:
        db: Database session
        project: Project model
        user: User model
        requirements: Base requirements dict
        samples: Loaded sample plans
        building_width: Building envelope width
        building_depth: Building envelope depth
        setbacks: Calculated setbacks
        variant_number: Variant index (1, 2, 3, etc.)
        variant_config: Configuration for this variant
        start_time: Generation start time
    
    Returns:
        Created FloorPlan model or None if generation failed
    """
    logger.info(f"Generating variant {variant_number}: {variant_config['name']}")
    
    try:
        # Calculate room sizes with variant adjustments
        base_room_sizes = calculate_room_sizes(building_width, building_depth, requirements)
        room_sizes = apply_variant_config(base_room_sizes, variant_config)
        
        # Generate with validation using variant-specific temperature
        result = generate_with_validation(
            samples=samples,
            requirements=requirements,
            room_sizes=room_sizes,
            building_width=building_width,
            building_depth=building_depth,
            setbacks=setbacks,
            validation_func=validate_generated_plan,
            temperature=variant_config.get('temperature', 0.3)
        )
        
        floor_plan_json = result.get('floor_plan_json', {})
        image_bytes = result.get('image_bytes')
        validation = result.get('validation', {})
        
        # Run full validation (Council + NCC)
        land_area = requirements['land_width'] * requirements['land_depth']
        full_validation = run_full_validation(
            floor_plan_json,
            requirements,
            requirements['land_width'],
            requirements['land_depth'],
            land_area,
            requirements.get('council'),
            requirements.get('postcode')
        )
        
        # Build metadata
        end_time = datetime.utcnow()
        generation_time = (end_time - start_time).total_seconds()
        
        floor_plan_json['project_id'] = project.id
        floor_plan_json['project_name'] = project.name
        floor_plan_json['variant_number'] = variant_number
        floor_plan_json['variant_name'] = variant_config['name']
        floor_plan_json['variant_description'] = variant_config['description']
        floor_plan_json['generated_at'] = end_time.isoformat()
        floor_plan_json['ai_model'] = NANO_BANANA_PRO_MODEL
        floor_plan_json['validation'] = full_validation
        floor_plan_json['building_envelope'] = {
            'width': building_width,
            'depth': building_depth
        }
        
        # Extract summary
        summary = floor_plan_json.get('summary', {})
        total_area = summary.get('total_area', 0)
        living_area = summary.get('living_area', 0)
        
        # Build design name with variant info
        base_name = f"{project.bedrooms} Bed Modern"
        design_name = f"{base_name} - {variant_config['name']}"
        if len(design_name) > 50:
            design_name = design_name[:47] + "..."
        
        # Build compliance notes
        compliance_notes = []
        compliance_notes.append(f"Variant: {variant_config['name']}")
        if full_validation.get('overall_compliant'):
            compliance_notes.append("Full compliance (Council + NCC)")
        else:
            compliance_notes.append(
                f"Errors: {full_validation['summary']['total_errors']}, "
                f"Warnings: {full_validation['summary']['total_warnings']}"
            )
        
        # Create database record
        floor_plan = models.FloorPlan(
            project_id=project.id,
            variant_number=variant_number,
            total_area=total_area,
            living_area=living_area,
            plan_type=design_name,
            layout_data=json.dumps(floor_plan_json),
            compliance_data=json.dumps({
                'council_compliant': full_validation.get('council_validation', {}).get('valid', False),
                'ncc_compliant': full_validation.get('ncc_validation', {}).get('compliant', False),
                'overall_compliant': full_validation.get('overall_compliant', False),
                'validation': full_validation,
                'variant_config': variant_config
            }),
            is_compliant=full_validation.get('overall_compliant', False),
            compliance_notes="; ".join(compliance_notes[:3]),
            generation_time_seconds=generation_time,
            ai_model_version=NANO_BANANA_PRO_MODEL,
            created_at=end_time
        )
        
        db.add(floor_plan)
        db.flush()
        plan_id = floor_plan.id
        
        # Upload image to blob storage with variant number in filename
        if user and image_bytes:
            user_name = user.full_name or (user.email.split('@')[0] if user.email else f"user_{user.id}")
            # Use variant number in filename: floor_plan_1.png, floor_plan_2.png, etc.
            variant_filename = f"floor_plan_{variant_number}.png"
            png_url = upload_floor_plan_image(
                image_bytes, user_name, project.name, plan_id, variant_filename
            )
            
            if png_url:
                floor_plan.preview_image_url = png_url
                floor_plan_json['rendered_images'] = {'png': png_url}
                floor_plan.layout_data = json.dumps(floor_plan_json)
                logger.info(f"Variant {variant_number}: Uploaded image: {png_url}")
        
        # Fallback: use sample image
        if not floor_plan.preview_image_url and samples and user:
            best_sample = select_best_sample(samples, requirements)
            if best_sample and best_sample.get('image_bytes'):
                user_name = user.full_name or user.email.split('@')[0]
                variant_filename = f"floor_plan_{variant_number}.png"
                png_url = upload_floor_plan_image(
                    best_sample['image_bytes'], user_name, project.name, plan_id, variant_filename
                )
                if png_url:
                    floor_plan.preview_image_url = png_url
                    logger.info(f"Variant {variant_number}: Used sample image as fallback")
        
        logger.info(
            f"Created variant {variant_number} (plan_id={plan_id}) in {generation_time:.1f}s, "
            f"compliant: {full_validation.get('overall_compliant')}"
        )
        
        return floor_plan
        
    except Exception as e:
        logger.error(f"Variant {variant_number} generation failed: {type(e).__name__}: {e}")
        import traceback
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        return None


# =============================================================================
# MULTI-VARIANT GENERATION (NEW)
# =============================================================================

def create_multiple_floor_plans_for_project(
    db: Session,
    project: models.Project,
    user: models.User = None,
    variant_count: int = DEFAULT_VARIANT_COUNT
) -> List[models.FloorPlan]:
    """
    Create multiple floor plan variants for a project using AI generation.
    
    Generates different design approaches:
    1. Optimal Layout - Balanced, efficient design
    2. Spacious Living - Emphasis on living areas
    3. Master Retreat - Emphasis on master suite
    
    Args:
        db: Database session
        project: Project model
        user: Optional user model (fetched if not provided)
        variant_count: Number of variants to generate (default 3)
    
    Returns:
        List of created FloorPlan models
    """
    logger.info(f"Creating {variant_count} floor plans for project {project.id}: {project.name}")
    start_time = datetime.utcnow()
    
    # Delete existing floor plans for this project
    try:
        existing = db.query(models.FloorPlan).filter(
            models.FloorPlan.project_id == project.id
        ).all()
        for plan in existing:
            db.delete(plan)
        db.commit()
        if existing:
            logger.info(f"Deleted {len(existing)} existing floor plans")
    except Exception as e:
        logger.warning(f"Could not delete existing plans: {e}")
        db.rollback()
    
    # Build requirements from project
    requirements = build_requirements_from_project(project)
    
    logger.info(
        f"Requirements: {requirements['bedrooms']} bed, {requirements['bathrooms']} bath, "
        f"land: {requirements['land_width']}m × {requirements['land_depth']}m"
    )
    
    # Get user if not provided
    if user is None:
        user = db.query(models.User).filter(models.User.id == project.user_id).first()
    
    created_plans = []
    
    try:
        # 1. Load sample plans (once for all variants)
        logger.info("Loading sample floor plans...")
        samples = load_all_sample_plans()
        logger.info(f"Loaded {len(samples)} sample plans")
        
        # 2. Calculate building envelope (same for all variants)
        building_width, building_depth, setbacks = calculate_building_envelope(
            requirements['land_width'],
            requirements['land_depth'],
            requirements.get('council')
        )
        logger.info(f"Building envelope: {building_width:.1f}m × {building_depth:.1f}m")
        
        # 3. Generate each variant
        configs_to_use = VARIANT_CONFIGS[:variant_count]
        
        for i, config in enumerate(configs_to_use, start=1):
            logger.info(f"=== Generating Variant {i}/{variant_count}: {config['name']} ===")
            
            # Add delay between variants to avoid API rate limiting
            if i > 1:
                import time
                logger.info(f"Waiting 5 seconds before generating variant {i}...")
                time.sleep(5)
            
            try:
                floor_plan = generate_single_variant(
                    db=db,
                    project=project,
                    user=user,
                    requirements=requirements,
                    samples=samples,
                    building_width=building_width,
                    building_depth=building_depth,
                    setbacks=setbacks,
                    variant_number=i,
                    variant_config=config,
                    start_time=start_time
                )
                
                if floor_plan:
                    # Commit this variant immediately so it's saved even if next variant fails
                    db.commit()
                    created_plans.append(floor_plan)
                    logger.info(f"Variant {i} committed successfully (plan_id={floor_plan.id})")
                else:
                    logger.error(f"Variant {i} returned None - generation failed but no exception raised")
                    db.rollback()  # Rollback any pending changes from failed variant
            except Exception as variant_error:
                logger.error(f"Variant {i} generation threw exception: {type(variant_error).__name__}: {variant_error}")
                import traceback
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                db.rollback()  # Rollback this variant's changes, continue with next
        
        # Update project status (variants already committed individually)
        if created_plans:
            project.status = "generated"
            project.updated_at = datetime.utcnow()
            db.commit()
            
            total_time = (datetime.utcnow() - start_time).total_seconds()
            logger.info(
                f"Successfully created {len(created_plans)}/{variant_count} floor plans "
                f"in {total_time:.1f}s"
            )
        else:
            project.status = "error"
            project.updated_at = datetime.utcnow()
            db.commit()
            raise RuntimeError("All variant generations failed")
        
        return created_plans
        
    except Exception as e:
        logger.error(f"Multi-variant floor plan generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        project.status = "error"
        project.updated_at = datetime.utcnow()
        db.commit()
        
        # Return any plans that were created before the error
        if created_plans:
            logger.info(f"Returning {len(created_plans)} plans created before error")
            return created_plans
        
        raise RuntimeError(f"Floor plan generation failed: {str(e)}")


# =============================================================================
# LEGACY SINGLE PLAN GENERATION (kept for backwards compatibility)
# =============================================================================

def create_floor_plan_for_project(
    db: Session, 
    project: models.Project, 
    user: models.User = None
) -> models.FloorPlan:
    """
    Create a single floor plan for a project (legacy function).
    
    Now delegates to create_multiple_floor_plans_for_project with variant_count=1
    for backwards compatibility.
    
    Args:
        db: Database session
        project: Project model
        user: Optional user model
    
    Returns:
        Created FloorPlan model
    """
    plans = create_multiple_floor_plans_for_project(db, project, user, variant_count=1)
    return plans[0] if plans else None


# =============================================================================
# API ENDPOINTS - FLOOR PLANS
# =============================================================================

@router.get("/{project_id}/plans", response_model=List[FloorPlanResponse])
async def get_plans(
    project_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all floor plans for a project."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return db.query(models.FloorPlan).filter(
        models.FloorPlan.project_id == project_id
    ).order_by(models.FloorPlan.variant_number).all()


@router.get("/{project_id}/plans/{plan_id}", response_model=FloorPlanResponse)
async def get_plan(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific floor plan."""
    db_user = get_db_user(current_user, db)
    
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    return plan


@router.get("/{project_id}/plans/{plan_id}/image")
async def download_floor_plan_image(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Redirect to floor plan preview image."""
    db_user = get_db_user(current_user, db)
    
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan or not plan.preview_image_url:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return RedirectResponse(url=plan.preview_image_url)


@router.get("/{project_id}/plans/{plan_id}/validation")
async def get_plan_validation(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed validation results for a floor plan."""
    db_user = get_db_user(current_user, db)
    
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    try:
        layout_data = json.loads(plan.layout_data) if plan.layout_data else {}
        compliance_data = json.loads(plan.compliance_data) if plan.compliance_data else {}
        
        return {
            'plan_id': plan_id,
            'variant_number': plan.variant_number,
            'is_compliant': plan.is_compliant,
            'council_compliant': compliance_data.get('council_compliant'),
            'ncc_compliant': compliance_data.get('ncc_compliant'),
            'validation': compliance_data.get('validation', {}),
            'building_envelope': layout_data.get('building_envelope', {}),
            'variant_config': compliance_data.get('variant_config', {}),
            'score': get_validation_score(compliance_data.get('validation', {}))
        }
    except Exception as e:
        return {'error': str(e)}


@router.put("/{project_id}/plans/{plan_id}/layout-data")
async def update_plan_layout_data(
    project_id: int,
    plan_id: int,
    request: UpdateLayoutDataRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the layout_data for a floor plan.
    Used to persist ignored errors/warnings.
    """
    db_user = get_db_user(current_user, db)
    
    # Verify plan exists and belongs to user
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    try:
        # Validate that the layout_data is valid JSON
        json.loads(request.layout_data)
        
        # Update the layout_data
        plan.layout_data = request.layout_data
        plan.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(plan)
        
        logger.info(f"Updated layout_data for plan {plan_id} (project {project_id})")
        
        return {
            'success': True,
            'message': 'Layout data updated successfully',
            'plan_id': plan_id,
            'project_id': project_id
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in layout_data")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update layout_data for plan {plan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update layout data: {str(e)}")


# =============================================================================
# API ENDPOINTS - SAMPLES
# =============================================================================

@router.get("/samples/info")
async def get_sample_plans_info_endpoint(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get info about available sample plans."""
    samples = load_all_sample_plans()
    info = get_sample_plan_info(samples)
    
    return {
        'sample_count': len(samples),
        'samples': info
    }


# =============================================================================
# API ENDPOINTS - COUNCILS
# =============================================================================

@router.get("/councils")
async def list_councils(
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """List all configured councils."""
    return {
        'councils': get_all_councils(),
        'default': 'Default (NSW Standard)'
    }


@router.get("/councils/{council_name}")
async def get_council_details(
    council_name: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get requirements for a specific council."""
    return get_council_info(council_name)


@router.get("/councils/{council_name}/setbacks")
async def get_council_setbacks_endpoint(
    council_name: str,
    land_width: float = 14.0,
    land_depth: float = 25.0,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Calculate building envelope for a council and land size."""
    building_width, building_depth, setbacks = calculate_building_envelope(
        land_width, land_depth, council_name
    )
    
    return {
        'council': council_name,
        'land': {
            'width': land_width, 
            'depth': land_depth, 
            'area': land_width * land_depth
        },
        'setbacks': setbacks,
        'building_envelope': {
            'width': building_width,
            'depth': building_depth,
            'area': building_width * building_depth
        }
    }


# =============================================================================
# API ENDPOINTS - NCC
# =============================================================================

@router.get("/ncc/requirements")
async def get_ncc_requirements_endpoint(
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get NCC requirements summary."""
    return get_ncc_requirements_summary()


@router.get("/ncc/room-sizes")
async def get_ncc_room_sizes_endpoint(
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get NCC minimum room sizes."""
    return get_minimum_room_sizes()


# =============================================================================
# API ENDPOINTS - VALIDATION
# =============================================================================

@router.post("/validate-lot")
async def validate_lot_endpoint(
    land_width: float,
    land_depth: float,
    council: Optional[str] = None,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Validate that a lot meets council requirements."""
    land_area = land_width * land_depth
    return validate_lot_requirements(land_width, land_depth, land_area, council)


# =============================================================================
# API ENDPOINTS - VARIANT INFO
# =============================================================================

@router.get("/variants/configs")
async def get_variant_configs(
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Get available variant configurations."""
    return {
        'default_count': DEFAULT_VARIANT_COUNT,
        'variants': [
            {
                'number': i + 1,
                'name': config['name'],
                'description': config['description'],
                'style_emphasis': config['style_emphasis']
            }
            for i, config in enumerate(VARIANT_CONFIGS)
        ]
    }
