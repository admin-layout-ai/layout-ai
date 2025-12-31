# backend/app/routers/plans.py
# UPDATED: Plans router with B2C authentication
# This replaces your current plans.py - now uses token auth instead of user_id param

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import json

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser
from ..services.floor_plan_generator import generate_floor_plans
from ..services.pdf_generator import generate_floor_plan_pdf
from ..services.azure_storage import storage_service
from ..analytics import analytics

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])


def get_db_user(current_user: AuthenticatedUser, db: Session) -> models.User:
    """Helper to get database user from authenticated token user."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found. Please sign in again.")
    
    return db_user


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
        project.status = models.ProjectStatus.GENERATING
        db.commit()
        
        project_data = {
            'land_width': project.land_width,
            'land_depth': project.land_depth,
            'bedrooms': project.bedrooms,
            'bathrooms': project.bathrooms,
            'living_areas': project.living_areas,
            'garage_spaces': project.garage_spaces,
            'open_plan': project.open_plan,
            'storeys': project.storeys,
            'style': project.style,
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
                plan_type=models.PlanType.BASIC,
                layout_data=json.dumps(layout),
                is_compliant=layout.get('compliant', False),
                compliance_notes=layout.get('compliance_notes', ''),
                generation_time_seconds=0.5,
                ai_model_version='rule-based-v1',
                created_at=datetime.utcnow()
            )
            db.add(floor_plan)
        
        project.status = models.ProjectStatus.COMPLETED
        project.updated_at = datetime.utcnow()
        db.commit()
        
        # Track analytics
        analytics.track_event("plans_generated", db_user.id, {
            "project_id": project_id,
            "plan_count": len(layouts)
        })
        
        return {
            "message": "Floor plans generated successfully",
            "count": len(layouts),
            "project_id": project_id
        }
        
    except Exception as e:
        project.status = models.ProjectStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/plans", response_model=List[schemas.FloorPlanResponse])
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
    
    return plans


@router.get("/{plan_id}/download/pdf")
async def download_pdf(
    plan_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate and download PDF for a floor plan."""
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
    
    # Generate PDF
    project_data = {
        'name': project.name,
        'land_width': project.land_width,
        'land_depth': project.land_depth,
        'bedrooms': project.bedrooms,
        'bathrooms': project.bathrooms,
        'style': project.style,
    }
    
    floor_plan_data = {
        'layout_data': floor_plan.layout_data,
        'total_area': floor_plan.total_area,
    }
    
    pdf_buffer = generate_floor_plan_pdf(project_data, floor_plan_data)
    
    # Upload to Azure Storage if not already uploaded
    if not floor_plan.pdf_url:
        try:
            pdf_buffer.seek(0)
            pdf_url = storage_service.upload_pdf(pdf_buffer, project.id, floor_plan.id)
            floor_plan.pdf_url = pdf_url
            db.commit()
            pdf_buffer.seek(0)
        except Exception as e:
            # Continue even if upload fails - still return the PDF
            pass
    
    # Track download
    analytics.track_event("pdf_downloaded", db_user.id, {
        "project_id": project.id,
        "plan_id": plan_id
    })
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={project.name.replace(' ', '_')}_plan_{floor_plan.variant_number}.pdf"
        }
    )


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
    
    layout_data = json.loads(floor_plan.layout_data) if floor_plan.layout_data else {}
    
    return {
        "id": floor_plan.id,
        "project_id": floor_plan.project_id,
        "variant_number": floor_plan.variant_number,
        "total_area": floor_plan.total_area,
        "living_area": floor_plan.living_area,
        "is_compliant": floor_plan.is_compliant,
        "compliance_notes": floor_plan.compliance_notes,
        "layout": layout_data,
        "pdf_url": floor_plan.pdf_url,
        "preview_image_url": floor_plan.preview_image_url
    }


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
    
    # TODO: Add selected_plan_id to Project model if not exists
    # project.selected_plan_id = floor_plan_id
    project.updated_at = datetime.utcnow()
    db.commit()
    
    # Track selection
    analytics.track_event("plan_selected", db_user.id, {
        "project_id": project_id,
        "plan_id": floor_plan_id
    })
    
    return {
        "message": "Floor plan selected successfully",
        "project_id": project_id,
        "selected_plan_id": floor_plan_id
    }
