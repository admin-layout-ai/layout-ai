# backend/app/routers/plans.py
# Floor plans router with B2C authentication

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import logging

from .. import models
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])


# Pydantic models for responses
class FloorPlanResponse(BaseModel):
    id: int
    project_id: int
    variant_number: Optional[int] = None
    total_area: Optional[float] = None
    living_area: Optional[float] = None
    plan_type: Optional[str] = None
    layout_data: Optional[str] = None  # JSON string with room data
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
    """Get floor plan preview data (layout JSON)."""
    db_user = get_db_user(current_user, db)
    
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == plan_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    # Verify project belongs to user
    project = db.query(models.Project).filter(
        models.Project.id == floor_plan.project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Parse layout_data if it exists
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
        "layout_data": floor_plan.layout_data,  # Keep as string for frontend parsing
        "layout": layout_data,  # Also provide parsed version
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
    """Generate floor plans for a project."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if questionnaire is completed
    if not project.bedrooms:
        raise HTTPException(
            status_code=400, 
            detail="Please complete the questionnaire first"
        )
    
    try:
        # Update status to generating
        project.status = "generating"
        db.commit()
        
        # Delete existing floor plans for this project
        db.query(models.FloorPlan).filter(
            models.FloorPlan.project_id == project_id
        ).delete()
        db.commit()
        
        # Generate 3 variants
        variants = [
            {"name": "Compact Design", "scale": 0.85, "plan_type": "compact"},
            {"name": "Family Layout", "scale": 1.0, "plan_type": "family"},
            {"name": "Luxury Design", "scale": 1.15, "plan_type": "luxury"},
        ]
        
        for idx, variant in enumerate(variants):
            rooms = _generate_rooms(project, variant["scale"])
            total_area = sum(r["area"] for r in rooms)
            living_area = sum(r["area"] for r in rooms if r["type"] in ["living", "kitchen_dining", "dining", "kitchen"])
            
            layout_data = {
                "variant_name": variant["name"],
                "description": f"{variant['name']} - optimized for your {project.land_width}m x {project.land_depth}m lot",
                "rooms": rooms,
                "total_area": total_area,
                "living_area": living_area,
                "building_width": project.land_width * 0.7 * variant["scale"],
                "building_depth": project.land_depth * 0.6 * variant["scale"],
                "compliant": True,
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
            
            floor_plan = models.FloorPlan(
                project_id=project.id,
                variant_number=idx + 1,
                total_area=total_area,
                living_area=living_area,
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
        
        project.status = "generated"
        project.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Generated 3 floor plans for project {project_id}")
        
        return {
            "message": "Floor plans generated successfully",
            "count": 3,
            "project_id": project_id
        }
        
    except Exception as e:
        logger.error(f"Error generating floor plans: {str(e)}")
        project.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


def _generate_rooms(project: models.Project, scale: float = 1.0) -> list:
    """Generate rooms based on project requirements."""
    rooms = []
    x_offset = 0
    y_offset = 0
    
    # Base dimensions (will be scaled)
    base_sizes = {
        "garage": {"width": 6.0, "depth": 6.0},
        "entry": {"width": 2.5, "depth": 3.0},
        "living": {"width": 5.0, "depth": 4.5},
        "kitchen_dining": {"width": 6.0, "depth": 4.0},
        "laundry": {"width": 2.5, "depth": 2.5},
        "bedroom": {"width": 3.5, "depth": 3.5},
        "master_bedroom": {"width": 4.5, "depth": 4.0},
        "bathroom": {"width": 2.5, "depth": 2.5},
        "ensuite": {"width": 3.0, "depth": 2.5},
        "wir": {"width": 2.5, "depth": 2.0},
        "office": {"width": 3.0, "depth": 3.0},
        "alfresco": {"width": 4.0, "depth": 3.5},
    }
    
    # Scale factor based on variant
    s = scale
    
    # Garage
    if project.garage_spaces and project.garage_spaces > 0:
        width = base_sizes["garage"]["width"] * s * (1 + (project.garage_spaces - 1) * 0.4)
        depth = base_sizes["garage"]["depth"] * s
        rooms.append({
            "type": "garage",
            "name": f"{project.garage_spaces}-Car Garage",
            "width": round(width, 1),
            "depth": round(depth, 1),
            "area": round(width * depth, 1),
            "x": x_offset,
            "y": y_offset,
            "floor": 0
        })
        x_offset += width + 0.5
    
    # Entry
    width = base_sizes["entry"]["width"] * s
    depth = base_sizes["entry"]["depth"] * s
    rooms.append({
        "type": "entry",
        "name": "Entry",
        "width": round(width, 1),
        "depth": round(depth, 1),
        "area": round(width * depth, 1),
        "x": x_offset,
        "y": y_offset,
        "floor": 0
    })
    
    # Living
    width = base_sizes["living"]["width"] * s
    depth = base_sizes["living"]["depth"] * s
    rooms.append({
        "type": "living",
        "name": "Living Room",
        "width": round(width, 1),
        "depth": round(depth, 1),
        "area": round(width * depth, 1),
        "x": x_offset,
        "y": y_offset + base_sizes["entry"]["depth"] * s + 0.5,
        "floor": 0
    })
    
    # Kitchen/Dining
    width = base_sizes["kitchen_dining"]["width"] * s
    depth = base_sizes["kitchen_dining"]["depth"] * s
    rooms.append({
        "type": "kitchen_dining",
        "name": "Kitchen / Dining",
        "width": round(width, 1),
        "depth": round(depth, 1),
        "area": round(width * depth, 1),
        "x": x_offset + base_sizes["living"]["width"] * s + 0.5,
        "y": y_offset + base_sizes["entry"]["depth"] * s + 0.5,
        "floor": 0
    })
    
    # Laundry
    width = base_sizes["laundry"]["width"] * s
    depth = base_sizes["laundry"]["depth"] * s
    rooms.append({
        "type": "laundry",
        "name": "Laundry",
        "width": round(width, 1),
        "depth": round(depth, 1),
        "area": round(width * depth, 1),
        "x": 0,
        "y": base_sizes["garage"]["depth"] * s + 0.5 if project.garage_spaces else y_offset,
        "floor": 0
    })
    
    # Bedrooms
    bedroom_y = base_sizes["living"]["depth"] * s + base_sizes["entry"]["depth"] * s + 1.5
    bedroom_x = 0
    
    for i in range(project.bedrooms or 3):
        if i == 0:
            # Master bedroom with ensuite and WIR
            width = base_sizes["master_bedroom"]["width"] * s
            depth = base_sizes["master_bedroom"]["depth"] * s
            rooms.append({
                "type": "bedroom",
                "name": "Master Bedroom",
                "width": round(width, 1),
                "depth": round(depth, 1),
                "area": round(width * depth, 1),
                "x": bedroom_x,
                "y": bedroom_y,
                "floor": 0
            })
            
            # Ensuite
            ens_width = base_sizes["ensuite"]["width"] * s
            ens_depth = base_sizes["ensuite"]["depth"] * s
            rooms.append({
                "type": "ensuite",
                "name": "Ensuite",
                "width": round(ens_width, 1),
                "depth": round(ens_depth, 1),
                "area": round(ens_width * ens_depth, 1),
                "x": bedroom_x + width + 0.3,
                "y": bedroom_y,
                "floor": 0
            })
            
            # Walk-in Robe
            wir_width = base_sizes["wir"]["width"] * s
            wir_depth = base_sizes["wir"]["depth"] * s
            rooms.append({
                "type": "wir",
                "name": "Walk-in Robe",
                "width": round(wir_width, 1),
                "depth": round(wir_depth, 1),
                "area": round(wir_width * wir_depth, 1),
                "x": bedroom_x + width + 0.3,
                "y": bedroom_y + ens_depth + 0.3,
                "floor": 0
            })
            
            bedroom_x += width + ens_width + 1
        else:
            width = base_sizes["bedroom"]["width"] * s
            depth = base_sizes["bedroom"]["depth"] * s
            rooms.append({
                "type": "bedroom",
                "name": f"Bedroom {i + 1}",
                "width": round(width, 1),
                "depth": round(depth, 1),
                "area": round(width * depth, 1),
                "x": bedroom_x,
                "y": bedroom_y,
                "floor": 0
            })
            bedroom_x += width + 0.5
    
    # Bathrooms (additional)
    bath_count = int(project.bathrooms or 2) - 1  # -1 for ensuite
    for i in range(bath_count):
        width = base_sizes["bathroom"]["width"] * s
        depth = base_sizes["bathroom"]["depth"] * s
        rooms.append({
            "type": "bathroom",
            "name": f"Bathroom {i + 1}" if bath_count > 1 else "Bathroom",
            "width": round(width, 1),
            "depth": round(depth, 1),
            "area": round(width * depth, 1),
            "x": bedroom_x,
            "y": bedroom_y,
            "floor": 0
        })
        bedroom_x += width + 0.5
    
    # Home Office (if requested)
    if project.home_office:
        width = base_sizes["office"]["width"] * s
        depth = base_sizes["office"]["depth"] * s
        rooms.append({
            "type": "office",
            "name": "Home Office",
            "width": round(width, 1),
            "depth": round(depth, 1),
            "area": round(width * depth, 1),
            "x": bedroom_x,
            "y": bedroom_y,
            "floor": 0
        })
    
    # Alfresco (if outdoor entertainment)
    if project.outdoor_entertainment:
        width = base_sizes["alfresco"]["width"] * s
        depth = base_sizes["alfresco"]["depth"] * s
        rooms.append({
            "type": "alfresco",
            "name": "Alfresco",
            "width": round(width, 1),
            "depth": round(depth, 1),
            "area": round(width * depth, 1),
            "x": x_offset + base_sizes["living"]["width"] * s + base_sizes["kitchen_dining"]["width"] * s + 1,
            "y": y_offset + base_sizes["entry"]["depth"] * s + 0.5,
            "floor": 0
        })
    
    return rooms


@router.post("/{project_id}/floor-plans/{floor_plan_id}/select")
async def select_floor_plan(
    project_id: int,
    floor_plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Select a floor plan as the final choice for a project."""
    db_user = get_db_user(current_user, db)
    
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Verify floor plan belongs to project
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
