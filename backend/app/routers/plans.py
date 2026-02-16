# backend/app/routers/plans.py
# Floor plans API router
# Orchestrates floor plan generation using modular services
#
# UPDATED: Now supports generating multiple floor plan variants (default 3)

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
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

from ..services.layout_validation import (
    validate_generated_plan,
    run_full_validation,
    get_validation_score,
    validate_specific_error
)

from ..services.tile_layout_engine import (
    generate_tile_layout,
    layout_to_floor_plan_json
)

from ..services.cad_floor_plan_generator import (
    generate_cad_svg_bytes
)

from ..services.floor_plan_optimizer import (
    get_error_category,
    estimate_fix_difficulty
)

# Model version label for DB records (replaces Gemini model name)
CAD_GENERATOR_VERSION = "CAD-TileEngine-v1"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

logger.info("Floor Plan Router: Modular architecture loaded - Multi-variant support enabled")


# =============================================================================
# CONFIGURATION
# =============================================================================

# Default number of floor plan variants to generate
DEFAULT_VARIANT_COUNT = 3

# Variant configurations for different design approaches
# Each variant uses slightly different tile sizes and envelope adjustments
# to produce genuinely different floor plan layouts from the tile engine.
VARIANT_CONFIGS = [
    {
        'name': 'Optimal Layout',
        'description': 'Balanced design optimizing space efficiency',
        'temperature': 0.3,
        'style_emphasis': 'efficiency',
        'room_size_bias': 0.0,  # No bias - use calculated sizes
        'tile_size': 0.90,       # Default tile size
        'envelope_adjust_w': 0.0,
        'envelope_adjust_d': 0.0,
    },
    {
        'name': 'Spacious Living',
        'description': 'Emphasis on larger living areas',
        'temperature': 0.4,
        'style_emphasis': 'living_space',
        'room_size_bias': 0.1,  # 10% larger living areas
        'tile_size': 0.85,       # Slightly smaller tiles = more granularity
        'envelope_adjust_w': 0.3,
        'envelope_adjust_d': -0.2,
    },
    {
        'name': 'Master Retreat',
        'description': 'Emphasis on master suite and private areas',
        'temperature': 0.35,
        'style_emphasis': 'master_suite',
        'room_size_bias': 0.15,  # 15% larger master areas
        'tile_size': 0.95,       # Slightly larger tiles = bigger rooms
        'envelope_adjust_w': -0.2,
        'envelope_adjust_d': 0.3,
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


class FixErrorRequest(BaseModel):
    """Request model for fixing a specific error/warning in a floor plan."""
    error_text: str
    error_type: str = "error"  # "error" or "warning"


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
    Generate a single floor plan variant using tile engine + CAD renderer.
    
    Flow:
    1. Generate tile-based layout (algorithmic, no AI)
    2. Convert to floor plan JSON
    3. Run full validation (Council + NCC)
    4. Render CAD SVG → PNG
    5. Upload PNG to blob storage
    6. Save database record
    
    Args:
        db: Database session
        project: Project model
        user: User model
        requirements: Base requirements dict
        samples: Loaded sample plans (kept for interface compat, not used for generation)
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
        # =====================================================================
        # STEP 1: Generate tile layout with variant-specific adjustments
        # =====================================================================
        
        # Each variant uses slightly different building dimensions and tile sizes
        # to produce genuinely different layouts
        adj_width = building_width + variant_config.get('envelope_adjust_w', 0)
        adj_depth = building_depth + variant_config.get('envelope_adjust_d', 0)
        tile_size = variant_config.get('tile_size', 0.90)
        
        # Clamp to reasonable bounds
        adj_width = max(8.0, adj_width)
        adj_depth = max(15.0, adj_depth)
        
        logger.info(
            f"Variant {variant_number} envelope: {adj_width:.1f}m × {adj_depth:.1f}m "
            f"(tile={tile_size}m)"
        )
        
        tile_layout = generate_tile_layout(
            adj_width, adj_depth, requirements, tile_size
        )
        floor_plan_json = layout_to_floor_plan_json(tile_layout, requirements)
        
        logger.info(
            f"Tile layout generated: {len(tile_layout.rooms)} rooms, "
            f"{tile_layout.cols}×{tile_layout.rows} grid"
        )
        
        # =====================================================================
        # STEP 2: Run full validation (Council + NCC)
        # =====================================================================
        
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
        
        # =====================================================================
        # STEP 3: Render CAD floor plan → PNG bytes
        # =====================================================================
        
        image_bytes = generate_cad_svg_bytes(floor_plan_json)
        
        if image_bytes:
            logger.info(f"CAD SVG generated: {len(image_bytes)} bytes")
        else:
            logger.warning(f"CAD SVG generation returned empty bytes")
        
        # =====================================================================
        # STEP 4: Build metadata and create DB record
        # =====================================================================
        
        end_time = datetime.utcnow()
        generation_time = (end_time - start_time).total_seconds()
        
        floor_plan_json['project_id'] = project.id
        floor_plan_json['project_name'] = project.name
        floor_plan_json['variant_number'] = variant_number
        floor_plan_json['variant_name'] = variant_config['name']
        floor_plan_json['variant_description'] = variant_config['description']
        floor_plan_json['generated_at'] = end_time.isoformat()
        floor_plan_json['ai_model'] = CAD_GENERATOR_VERSION
        floor_plan_json['validation'] = full_validation
        floor_plan_json['building_envelope'] = {
            'width': adj_width,
            'depth': adj_depth
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
            ai_model_version=CAD_GENERATOR_VERSION,
            created_at=end_time
        )
        
        db.add(floor_plan)
        db.flush()
        plan_id = floor_plan.id
        
        # =====================================================================
        # STEP 5: Upload PNG to blob storage
        # =====================================================================
        
        if user and image_bytes:
            user_name = user.full_name or (user.email.split('@')[0] if user.email else f"user_{user.id}")
            variant_filename = f"floor_plan_{variant_number}.svg"
            svg_url = upload_floor_plan_image(
                image_bytes, user_name, project.name, plan_id, variant_filename
            )
            
            if svg_url:
                floor_plan.preview_image_url = svg_url
                floor_plan_json['rendered_images'] = {'svg': svg_url}
                floor_plan.layout_data = json.dumps(floor_plan_json)
                logger.info(f"Variant {variant_number}: Uploaded CAD SVG: {svg_url}")
        
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
        # 1. Samples are no longer needed for generation (kept for interface compat)
        samples = []
        
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


# =============================================================================
# API ENDPOINTS - ERROR FIXING
# =============================================================================


def fix_floor_plan_task(
    plan_id: int,
    project_id: int,
    user_id: int,
    error_text: str,
    error_type: str
):
    """
    Background task to fix a floor plan error by regenerating the layout + CAD.
    
    Flow:
    1. Parse the error to determine what adjustment is needed
    2. Regenerate tile layout with adjusted parameters
    3. Re-render with CAD generator → PNG
    4. Upload new PNG (replaces existing)
    5. Re-validate and update DB
    """
    from ..database import SessionLocal
    from ..services.azure_storage import AzureStorageService
    
    db = SessionLocal()
    try:
        # Get plan, project, and user
        plan = db.query(models.FloorPlan).filter(models.FloorPlan.id == plan_id).first()
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        user = db.query(models.User).filter(models.User.id == user_id).first()
        
        if not plan or not project:
            logger.error(f"Plan {plan_id} or Project {project_id} not found for fix")
            return
        
        requirements = build_requirements_from_project(project)
        
        # Get building envelope
        building_width, building_depth, setbacks_dict = calculate_building_envelope(
            requirements.get('land_width', 14),
            requirements.get('land_depth', 25),
            requirements.get('council')
        )
        
        # Parse current layout_data
        layout_data = json.loads(plan.layout_data) if plan.layout_data else {}
        
        logger.info(f"Starting fix for plan {plan_id}: {error_text}")
        logger.info(f"Building envelope: {building_width}m x {building_depth}m")
        
        # =================================================================
        # DETERMINE ADJUSTMENT based on error type
        # =================================================================
        
        is_custom_command = error_text.startswith('Custom:')
        error_lower = error_text.lower()
        
        # Adjust building dimensions based on error
        adj_width = building_width
        adj_depth = building_depth
        tile_size = 0.90
        
        if 'site coverage' in error_lower and 'exceeds' in error_lower:
            # Reduce building footprint by 5%
            adj_width *= 0.95
            adj_depth *= 0.95
            logger.info(f"Fix: Reducing envelope to {adj_width:.1f}m × {adj_depth:.1f}m for coverage")
        elif 'room' in error_lower and ('small' in error_lower or 'minimum' in error_lower):
            # Slightly larger tiles = bigger rooms
            tile_size = 0.95
            logger.info(f"Fix: Increasing tile size to {tile_size}m for larger rooms")
        elif 'parking' in error_lower or 'garage' in error_lower:
            # Widen building for garage
            adj_width = max(adj_width, 12.0)
            logger.info(f"Fix: Ensuring minimum width {adj_width:.1f}m for garage")
        elif is_custom_command:
            # Custom command: use a slightly different tile size for a fresh layout
            tile_size = 0.88
            logger.info(f"Fix: Custom command - regenerating with tile_size={tile_size}m")
        else:
            # General: try a slightly different tile size for fresh layout
            tile_size = 0.92
            logger.info(f"Fix: General regeneration with tile_size={tile_size}m")
        
        # Clamp
        adj_width = max(8.0, adj_width)
        adj_depth = max(15.0, adj_depth)
        
        # =================================================================
        # REGENERATE: Tile layout → CAD → PNG
        # =================================================================
        
        tile_layout = generate_tile_layout(adj_width, adj_depth, requirements, tile_size)
        updated_layout_data = layout_to_floor_plan_json(tile_layout, requirements)
        
        # Carry over project metadata from original layout
        updated_layout_data['project_id'] = layout_data.get('project_id', project.id)
        updated_layout_data['project_name'] = layout_data.get('project_name', project.name)
        updated_layout_data['variant_number'] = layout_data.get('variant_number', plan.variant_number)
        updated_layout_data['variant_name'] = layout_data.get('variant_name', plan.plan_type)
        updated_layout_data['ai_model'] = CAD_GENERATOR_VERSION
        updated_layout_data['building_envelope'] = {
            'width': adj_width,
            'depth': adj_depth
        }
        
        # Render CAD → PNG
        new_image_bytes = generate_cad_svg_bytes(updated_layout_data)
        
        if not new_image_bytes:
            raise Exception("CAD generator returned empty SVG")
        
        logger.info(f"Regenerated CAD SVG: {len(new_image_bytes)} bytes")
        
        # =================================================================
        # UPLOAD new PNG to Azure Storage (replace existing)
        # =================================================================
        
        storage_service = AzureStorageService()
        
        # Use original filename to replace existing file
        original_url = plan.preview_image_url
        if original_url:
            original_filename = original_url.split('/')[-1]
            if '?' in original_filename:
                original_filename = original_filename.split('?')[0]
            filename = original_filename
        else:
            variant_num = plan.variant_number or 1
            filename = f"floor_plan_{variant_num}.svg"
        
        logger.info(f"Replacing image file: {filename}")
        
        if user:
            user_name = getattr(user, 'full_name', None) or getattr(user, 'name', None) or (user.email.split('@')[0] if user.email else f"user_{user.id}")
        else:
            user_name = "unknown_user"
        
        new_image_url = storage_service.upload_floor_plan_image(
            new_image_bytes,
            user_name,
            project.name,
            plan_id,
            filename
        )
        
        if not new_image_url:
            raise Exception("Failed to upload corrected image to Azure Storage")
        
        logger.info(f"Uploaded corrected image: {new_image_url}")
        
        # =================================================================
        # RE-VALIDATE and update DB
        # =================================================================
        
        # Clear the fixing status
        if updated_layout_data.get('_fixing'):
            del updated_layout_data['_fixing']
        
        # Run full validation on the new layout
        land_area = requirements['land_width'] * requirements['land_depth']
        full_validation = run_full_validation(
            updated_layout_data,
            requirements,
            requirements['land_width'],
            requirements['land_depth'],
            land_area,
            requirements.get('council'),
            requirements.get('postcode')
        )
        
        updated_layout_data['validation'] = full_validation
        
        # Check if the specific error was fixed
        if is_custom_command:
            error_fixed = True
        else:
            error_fixed = validate_specific_error(
                error_text=error_text,
                error_type=error_type,
                layout_data=updated_layout_data,
                requirements=requirements,
                building_width=adj_width,
                building_depth=adj_depth
            )
            
            if error_fixed:
                logger.info(f"Targeted validation PASSED - error is fixed!")
            else:
                logger.warning(f"Targeted validation FAILED - error may still be present")
        
        # Get current errors/warnings from new validation
        current_errors = list(full_validation.get('all_errors', []))
        current_warnings = list(full_validation.get('all_warnings', []))
        
        # Update metadata
        updated_layout_data['_last_fix_timestamp'] = datetime.utcnow().isoformat()
        updated_layout_data['_last_fix_error'] = error_text
        updated_layout_data['_last_fix_resolved'] = error_fixed
        
        # Determine overall compliance
        is_now_compliant = len(current_errors) == 0
        
        # Build compliance_data
        has_council_errors = any('council' in err.lower() for err in current_errors)
        has_ncc_errors = any('ncc' in err.lower() for err in current_errors)
        
        compliance_data = {
            'overall_compliant': is_now_compliant,
            'council_compliant': not has_council_errors,
            'ncc_compliant': not has_ncc_errors,
            'validation': full_validation,
            'all_errors': current_errors,
            'all_warnings': current_warnings,
            'last_validated': datetime.utcnow().isoformat(),
            'fix_applied': {
                'error_text': error_text,
                'error_type': error_type,
                'fixed_at': datetime.utcnow().isoformat(),
                'error_resolved': error_fixed
            }
        }
        
        # Update database
        plan.preview_image_url = new_image_url
        plan.layout_data = json.dumps(updated_layout_data)
        plan.compliance_data = json.dumps(compliance_data)
        plan.is_compliant = is_now_compliant
        plan.updated_at = datetime.utcnow()
        
        # Update compliance notes
        fix_status = "RESOLVED" if error_fixed else "FAILED"
        new_note = f"\n[{datetime.utcnow().isoformat()}] CAD Fix {fix_status}: {error_text}"
        new_note += f"\n  - Remaining errors: {len(current_errors)}"
        new_note += f"\n  - Remaining warnings: {len(current_warnings)}"
        new_note += f"\n  - Overall compliant: {is_now_compliant}"
        plan.compliance_notes = (plan.compliance_notes or "") + new_note
        
        db.commit()
        logger.info(f"Successfully fixed plan {plan_id} - is_compliant: {plan.is_compliant}, errors remaining: {len(current_errors)}")
        
    except Exception as e:
        logger.error(f"Error fixing plan {plan_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Update plan to mark fix as failed
        try:
            plan = db.query(models.FloorPlan).filter(models.FloorPlan.id == plan_id).first()
            if plan and plan.layout_data:
                layout_data = json.loads(plan.layout_data)
                layout_data['_fix_error'] = str(e)
                if layout_data.get('_fixing'):
                    del layout_data['_fixing']
                plan.layout_data = json.dumps(layout_data)
                plan.updated_at = datetime.utcnow()
                db.commit()
        except Exception as inner_e:
            logger.error(f"Failed to save error status: {inner_e}")
    finally:
        db.close()


@router.post("/{project_id}/plans/{plan_id}/fix-error")
async def fix_plan_error(
    project_id: int,
    plan_id: int,
    request: FixErrorRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger fix for a specific error/warning in a floor plan using AI.
    
    Returns immediately and runs the fix in the background.
    Poll GET /fix-status to check completion.
    """
    db_user = get_db_user(current_user, db)
    
    # Get the floor plan and verify ownership
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Check if already fixing
    if plan.layout_data:
        layout_data = json.loads(plan.layout_data)
        if layout_data.get('_fixing'):
            raise HTTPException(status_code=400, detail="A fix is already in progress")
    
    # Get project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Mark as fixing in layout_data
    layout_data = json.loads(plan.layout_data) if plan.layout_data else {}
    layout_data['_fixing'] = {
        'error_text': request.error_text,
        'error_type': request.error_type,
        'started_at': datetime.utcnow().isoformat()
    }
    plan.layout_data = json.dumps(layout_data)
    plan.updated_at = datetime.utcnow()
    db.commit()
    
    # Log for analytics
    error_category = get_error_category(request.error_text)
    difficulty = estimate_fix_difficulty(request.error_text)
    logger.info(f"Fix triggered for plan {plan_id} (category: {error_category}, difficulty: {difficulty})")
    
    # Add background task
    background_tasks.add_task(
        fix_floor_plan_task,
        plan_id,
        project_id,
        db_user.id,
        request.error_text,
        request.error_type
    )
    
    return {
        'success': True,
        'message': 'Fix started. This typically takes 30-60 seconds.',
        'plan_id': plan_id,
        'status': 'fixing',
        'error_text': request.error_text,
        'error_category': error_category
    }


@router.get("/{project_id}/plans/{plan_id}/fix-status")
async def get_fix_status(
    project_id: int,
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current fix status for a floor plan.
    Poll this endpoint to check when fix is complete.
    """
    db_user = get_db_user(current_user, db)
    
    plan = db.query(models.FloorPlan).join(models.Project).filter(
        models.FloorPlan.id == plan_id,
        models.FloorPlan.project_id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    layout_data = json.loads(plan.layout_data) if plan.layout_data else {}
    
    # Check if fixing is in progress
    if layout_data.get('_fixing'):
        return {
            'status': 'fixing',
            'plan_id': plan_id,
            'error_text': layout_data['_fixing'].get('error_text'),
            'started_at': layout_data['_fixing'].get('started_at'),
            'preview_image_url': plan.preview_image_url
        }
    
    # Check if there was an error
    if layout_data.get('_fix_error'):
        error_msg = layout_data.pop('_fix_error')
        plan.layout_data = json.dumps(layout_data)
        db.commit()
        return {
            'status': 'error',
            'plan_id': plan_id,
            'error': error_msg,
            'preview_image_url': plan.preview_image_url
        }
    
    # Fix completed - return all updated data including compliance
    return {
        'status': 'completed',
        'plan_id': plan_id,
        'preview_image_url': plan.preview_image_url,
        'layout_data': plan.layout_data,
        'compliance_data': plan.compliance_data,
        'is_compliant': plan.is_compliant,
        'updated_at': plan.updated_at.isoformat() if plan.updated_at else None,
        'fix_resolved': layout_data.get('_last_fix_resolved', False)
    }
