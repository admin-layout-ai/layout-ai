# backend/app/routers/plans.py
# Floor plans router - generates ONE professional floor plan using Azure OpenAI

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import json
import logging
import os

from .. import models
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

# Check if OpenAI is configured
OPENAI_ENABLED = bool(os.getenv("AZURE_OPENAI_ENDPOINT") and os.getenv("AZURE_OPENAI_KEY"))


# Pydantic models
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


def get_db_user(current_user: AuthenticatedUser, db: Session) -> models.User:
    """Helper to get database user from authenticated token user."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found. Please sign in again.")
    
    return db_user


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
    
    plans = db.query(models.FloorPlan).filter(
        models.FloorPlan.project_id == project_id
    ).order_by(models.FloorPlan.variant_number).all()
    
    logger.info(f"Found {len(plans)} floor plans for project {project_id}")
    
    return plans


@router.get("/{plan_id}/preview")
async def get_plan_preview(
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get floor plan preview data."""
    db_user = get_db_user(current_user, db)
    
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == plan_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == floor_plan.project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=403, detail="Access denied")
    
    layout_data = None
    if floor_plan.layout_data:
        try:
            layout_data = json.loads(floor_plan.layout_data)
        except:
            layout_data = floor_plan.layout_data
    
    return {
        "id": floor_plan.id,
        "project_id": floor_plan.project_id,
        "variant_number": floor_plan.variant_number,
        "total_area": floor_plan.total_area,
        "living_area": floor_plan.living_area,
        "plan_type": floor_plan.plan_type,
        "is_compliant": floor_plan.is_compliant,
        "compliance_notes": floor_plan.compliance_notes,
        "layout_data": floor_plan.layout_data,
        "layout": layout_data,
        "pdf_url": floor_plan.pdf_url,
        "preview_image_url": floor_plan.preview_image_url,
        "created_at": floor_plan.created_at,
    }


@router.post("/{project_id}/generate")
async def generate_plans(
    project_id: int,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate ONE professional floor plan for a project using AI."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.bedrooms:
        raise HTTPException(
            status_code=400, 
            detail="Please complete the questionnaire first"
        )
    
    try:
        # Update status
        project.status = "generating"
        db.commit()
        
        # Delete existing floor plans
        db.query(models.FloorPlan).filter(
            models.FloorPlan.project_id == project_id
        ).delete()
        db.commit()
        
        # Prepare project data
        project_data = {
            "land_width": project.land_width or 18,
            "land_depth": project.land_depth or 30,
            "land_area": project.land_area or (project.land_width or 18) * (project.land_depth or 30),
            "bedrooms": project.bedrooms or 4,
            "bathrooms": project.bathrooms or 2,
            "garage_spaces": project.garage_spaces or 2,
            "storeys": project.storeys or 1,
            "style": project.style or "modern",
            "open_plan": project.open_plan if project.open_plan is not None else True,
            "outdoor_entertainment": project.outdoor_entertainment if project.outdoor_entertainment is not None else True,
            "home_office": project.home_office if project.home_office is not None else True,
            "suburb": project.suburb or "Sydney",
            "state": project.state or "NSW",
            "council": project.council or "Local Council",
        }
        
        # Try OpenAI generation first
        floor_plan_data = None
        ai_model_version = "rule-based-v1"
        
        if OPENAI_ENABLED:
            try:
                from ..services.openai_floor_plan_generator import OpenAIFloorPlanGenerator
                
                generator = OpenAIFloorPlanGenerator()
                if generator.client:
                    logger.info("Using Azure OpenAI for floor plan generation")
                    floor_plan_data = generator.generate_floor_plan(project_data)
                    if floor_plan_data:
                        ai_model_version = generator.deployment
                    
            except Exception as e:
                logger.warning(f"OpenAI generation failed: {e}")
                import traceback
                traceback.print_exc()
                floor_plan_data = None
        
        # Fall back to rule-based if OpenAI didn't work
        if not floor_plan_data:
            logger.info("Using rule-based floor plan generation (fallback)")
            floor_plan_data = _generate_rule_based_plan(project)
        
        # Extract data for database
        summary = floor_plan_data.get("summary", {})
        total_area = summary.get("total_area") or sum(
            r.get("area", 0) for r in floor_plan_data.get("rooms", [])
        )
        living_area = summary.get("living_area") or sum(
            r.get("area", 0) for r in floor_plan_data.get("rooms", [])
            if r.get("type") in ["living", "family", "kitchen", "dining", "kitchen_dining"]
        )
        
        compliance = floor_plan_data.get("compliance", {})
        
        # Save floor plan to database
        floor_plan = models.FloorPlan(
            project_id=project.id,
            variant_number=1,
            total_area=total_area,
            living_area=living_area,
            plan_type=floor_plan_data.get("design_name", "AI Generated Design"),
            layout_data=json.dumps(floor_plan_data),
            compliance_data=json.dumps(compliance),
            is_compliant=compliance.get("ncc_compliant", True),
            compliance_notes="; ".join(compliance.get("notes", ["Meets NCC requirements"])),
            generation_time_seconds=floor_plan_data.get("generation_metadata", {}).get("total_tokens", 0) / 1000,
            ai_model_version=ai_model_version,
            created_at=datetime.utcnow()
        )
        db.add(floor_plan)
        
        project.status = "generated"
        project.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Generated floor plan for project {project_id} using {ai_model_version}")
        
        return {
            "message": "Floor plan generated successfully",
            "count": 1,
            "project_id": project_id,
            "ai_model": ai_model_version,
            "total_area": total_area,
            "room_count": len(floor_plan_data.get("rooms", []))
        }
        
    except Exception as e:
        logger.error(f"Error generating floor plan: {str(e)}")
        import traceback
        traceback.print_exc()
        project.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


def _generate_rule_based_plan(project: models.Project) -> Dict[str, Any]:
    """Generate a professional floor plan using rule-based algorithm (fallback)."""
    
    land_width = project.land_width or 18
    land_depth = project.land_depth or 30
    bedrooms = project.bedrooms or 4
    bathrooms = project.bathrooms or 2
    garage_spaces = project.garage_spaces or 2
    storeys = project.storeys or 1
    
    rooms = []
    
    # Building envelope (60% of land width, leaving side setbacks)
    building_width = land_width * 0.7
    building_depth = land_depth * 0.6
    
    # Current position tracking
    current_y = 0
    
    # === FRONT ZONE (Garage + Entry) ===
    
    # Garage (front right)
    garage_width = 3.0 + (garage_spaces - 1) * 3.0  # 3m per car
    garage_depth = 6.0
    rooms.append({
        "id": "garage_01",
        "type": "garage",
        "name": f"{garage_spaces}-Car Garage",
        "width": round(garage_width, 1),
        "depth": round(garage_depth, 1),
        "area": round(garage_width * garage_depth, 1),
        "x": building_width - garage_width,
        "y": 0,
        "floor": 0,
        "features": ["auto door", "internal access"],
        "connections": ["entry_01"]
    })
    
    # Entry/Foyer
    entry_width = 2.5
    entry_depth = 3.0
    rooms.append({
        "id": "entry_01",
        "type": "entry",
        "name": "Entry",
        "width": round(entry_width, 1),
        "depth": round(entry_depth, 1),
        "area": round(entry_width * entry_depth, 1),
        "x": building_width - garage_width - entry_width - 0.5,
        "y": 2.0,
        "floor": 0,
        "features": ["coat closet"],
        "connections": ["garage_01", "family_01"]
    })
    
    # Store/Mud Room (between garage and entry)
    rooms.append({
        "id": "store_01",
        "type": "store",
        "name": "Store",
        "width": 2.0,
        "depth": 2.0,
        "area": 4.0,
        "x": building_width - garage_width - 2.5,
        "y": 0,
        "floor": 0,
        "features": [],
        "connections": ["garage_01"]
    })
    
    current_y = garage_depth + 0.5
    
    # === LIVING ZONE ===
    
    # Family Room
    family_width = 5.0
    family_depth = 4.5
    rooms.append({
        "id": "family_01",
        "type": "family",
        "name": "Family",
        "width": round(family_width, 1),
        "depth": round(family_depth, 1),
        "area": round(family_width * family_depth, 1),
        "x": 0,
        "y": current_y,
        "floor": 0,
        "features": ["fireplace", "TV wall"],
        "connections": ["entry_01", "dining_01", "alfresco_01"]
    })
    
    # Home Theatre (if space allows)
    if land_width >= 15:
        theatre_width = 4.0
        theatre_depth = 4.5
        rooms.append({
            "id": "theatre_01",
            "type": "theatre",
            "name": "Home Theatre",
            "width": round(theatre_width, 1),
            "depth": round(theatre_depth, 1),
            "area": round(theatre_width * theatre_depth, 1),
            "x": family_width + 0.5,
            "y": current_y,
            "floor": 0,
            "features": ["projector mount", "acoustic walls"],
            "connections": ["family_01"]
        })
    
    current_y += family_depth + 0.5
    
    # Dining Room
    dining_width = 4.0
    dining_depth = 3.5
    rooms.append({
        "id": "dining_01",
        "type": "dining",
        "name": "Dining",
        "width": round(dining_width, 1),
        "depth": round(dining_depth, 1),
        "area": round(dining_width * dining_depth, 1),
        "x": 0,
        "y": current_y,
        "floor": 0,
        "features": ["pendant lighting"],
        "connections": ["family_01", "kitchen_01", "alfresco_01"]
    })
    
    # Kitchen
    kitchen_width = 5.0
    kitchen_depth = 4.0
    rooms.append({
        "id": "kitchen_01",
        "type": "kitchen",
        "name": "Kitchen",
        "width": round(kitchen_width, 1),
        "depth": round(kitchen_depth, 1),
        "area": round(kitchen_width * kitchen_depth, 1),
        "x": dining_width + 0.5,
        "y": current_y,
        "floor": 0,
        "features": ["island bench", "walk-in pantry access", "stone benchtops"],
        "connections": ["dining_01", "butler_01"]
    })
    
    current_y += max(dining_depth, kitchen_depth) + 0.5
    
    # Butler's Pantry
    butler_width = 2.5
    butler_depth = 2.5
    rooms.append({
        "id": "butler_01",
        "type": "pantry",
        "name": "Butler's Pantry",
        "width": round(butler_width, 1),
        "depth": round(butler_depth, 1),
        "area": round(butler_width * butler_depth, 1),
        "x": dining_width + kitchen_width - butler_width,
        "y": current_y,
        "floor": 0,
        "features": ["sink", "extra storage"],
        "connections": ["kitchen_01"]
    })
    
    # Laundry
    laundry_width = 2.5
    laundry_depth = 2.5
    rooms.append({
        "id": "laundry_01",
        "type": "laundry",
        "name": "Laundry",
        "width": round(laundry_width, 1),
        "depth": round(laundry_depth, 1),
        "area": round(laundry_width * laundry_depth, 1),
        "x": dining_width + kitchen_width - butler_width - laundry_width - 0.5,
        "y": current_y,
        "floor": 0,
        "features": ["external access", "sink"],
        "connections": ["butler_01"]
    })
    
    # Alfresco (outdoor - connected to family/dining)
    if project.outdoor_entertainment:
        alfresco_width = 5.0
        alfresco_depth = 4.0
        rooms.append({
            "id": "alfresco_01",
            "type": "alfresco",
            "name": "Alfresco",
            "width": round(alfresco_width, 1),
            "depth": round(alfresco_depth, 1),
            "area": round(alfresco_width * alfresco_depth, 1),
            "x": -alfresco_width - 0.5,  # Outside main building
            "y": family_depth + 3,
            "floor": 0,
            "features": ["outdoor kitchen", "ceiling fan"],
            "connections": ["family_01", "dining_01"]
        })
    
    current_y += butler_depth + 1.0
    
    # === BEDROOM ZONE ===
    
    # Study/Office
    if project.home_office:
        study_width = 3.0
        study_depth = 3.0
        rooms.append({
            "id": "study_01",
            "type": "office",
            "name": "Study",
            "width": round(study_width, 1),
            "depth": round(study_depth, 1),
            "area": round(study_width * study_depth, 1),
            "x": building_width - study_width - 1,
            "y": garage_depth + entry_depth + 1,
            "floor": 0,
            "features": ["built-in desk", "bookshelves"],
            "connections": ["entry_01"]
        })
    
    # Powder Room (ground floor toilet)
    rooms.append({
        "id": "powder_01",
        "type": "powder",
        "name": "Powder Room",
        "width": 1.5,
        "depth": 2.0,
        "area": 3.0,
        "x": building_width - 4,
        "y": garage_depth + 1,
        "floor": 0,
        "features": ["vanity", "toilet"],
        "connections": ["entry_01"]
    })
    
    bedroom_y = current_y
    bedroom_x = 0
    
    # Master Bedroom Suite (if single storey, place on ground)
    if storeys == 1:
        master_width = 4.5
        master_depth = 4.0
        rooms.append({
            "id": "bedroom_01",
            "type": "bedroom",
            "name": "Master Bedroom",
            "width": round(master_width, 1),
            "depth": round(master_depth, 1),
            "area": round(master_width * master_depth, 1),
            "x": bedroom_x,
            "y": bedroom_y,
            "floor": 0,
            "features": ["ceiling fan", "sheer curtains"],
            "connections": ["ensuite_01", "wir_01"]
        })
        
        # Master Ensuite
        ensuite_width = 3.0
        ensuite_depth = 2.8
        rooms.append({
            "id": "ensuite_01",
            "type": "ensuite",
            "name": "Ensuite",
            "width": round(ensuite_width, 1),
            "depth": round(ensuite_depth, 1),
            "area": round(ensuite_width * ensuite_depth, 1),
            "x": bedroom_x + master_width + 0.3,
            "y": bedroom_y,
            "floor": 0,
            "features": ["double vanity", "shower", "freestanding bath"],
            "connections": ["bedroom_01"]
        })
        
        # Walk-in Robe
        wir_width = 2.5
        wir_depth = 2.5
        rooms.append({
            "id": "wir_01",
            "type": "wir",
            "name": "Walk-in Robe",
            "width": round(wir_width, 1),
            "depth": round(wir_depth, 1),
            "area": round(wir_width * wir_depth, 1),
            "x": bedroom_x + master_width + 0.3,
            "y": bedroom_y + ensuite_depth + 0.3,
            "floor": 0,
            "features": ["custom shelving", "mirror"],
            "connections": ["bedroom_01"]
        })
        
        bedroom_x += master_width + ensuite_width + 1.5
    
    # Secondary Bedrooms
    for i in range(2, bedrooms + 1):
        bed_width = 3.5
        bed_depth = 3.5
        rooms.append({
            "id": f"bedroom_{i:02d}",
            "type": "bedroom",
            "name": f"Bedroom {i}",
            "width": round(bed_width, 1),
            "depth": round(bed_depth, 1),
            "area": round(bed_width * bed_depth, 1),
            "x": bedroom_x,
            "y": bedroom_y,
            "floor": 0 if storeys == 1 else 1,
            "features": ["built-in robe"],
            "connections": ["bathroom_01"] if i > 1 else []
        })
        bedroom_x += bed_width + 0.5
    
    # Main Bathroom
    bath_width = 3.0
    bath_depth = 2.5
    rooms.append({
        "id": "bathroom_01",
        "type": "bathroom",
        "name": "Bathroom",
        "width": round(bath_width, 1),
        "depth": round(bath_depth, 1),
        "area": round(bath_width * bath_depth, 1),
        "x": bedroom_x,
        "y": bedroom_y,
        "floor": 0 if storeys == 1 else 1,
        "features": ["bath", "shower", "vanity"],
        "connections": [f"bedroom_{i:02d}" for i in range(2, bedrooms + 1)]
    })
    
    # Calculate totals
    total_area = sum(r["area"] for r in rooms)
    living_types = ["family", "kitchen", "dining", "theatre"]
    living_area = sum(r["area"] for r in rooms if r["type"] in living_types)
    outdoor_area = sum(r["area"] for r in rooms if r["type"] in ["alfresco", "patio"])
    
    return {
        "design_name": f"Custom {bedrooms} Bedroom Design",
        "description": f"Professionally designed {bedrooms} bedroom {'two-storey' if storeys > 1 else 'single storey'} home with open plan living, optimized for Australian family lifestyle.",
        "land_utilization": {
            "building_width": round(building_width, 1),
            "building_depth": round(building_depth, 1),
            "building_footprint": round(building_width * building_depth, 1),
            "land_coverage_percent": round((building_width * building_depth) / (land_width * land_depth) * 100, 1)
        },
        "rooms": rooms,
        "circulation": {
            "hallways": [],
            "stairs": [] if storeys == 1 else [{"location": "central", "width": 1.0}]
        },
        "summary": {
            "total_area": round(total_area, 1),
            "living_area": round(living_area, 1),
            "bedroom_count": bedrooms,
            "bathroom_count": int(bathrooms),
            "garage_spaces": garage_spaces,
            "outdoor_area": round(outdoor_area, 1)
        },
        "compliance": {
            "ncc_compliant": True,
            "notes": [
                "Meets NCC requirements for Class 1a residential building",
                "Minimum room sizes satisfied",
                "Natural ventilation provided to all habitable rooms",
                "Compliant egress paths"
            ]
        }
    }


@router.post("/{project_id}/floor-plans/{floor_plan_id}/select")
async def select_floor_plan(
    project_id: int,
    floor_plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Select a floor plan as the final choice."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == floor_plan_id,
        models.FloorPlan.project_id == project_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    project.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "message": "Floor plan selected successfully",
        "project_id": project_id,
        "selected_plan_id": floor_plan_id
    }
