from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from ..services.floor_plan_generator import generate_floor_plans
from ..services.pdf_generator import generate_floor_plan_pdf
from ..services.azure_storage import storage_service
import json

# CREATE THE ROUTER FIRST - This was missing!
router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

@router.post("/{project_id}/generate")
async def generate_plans(
    project_id: int,
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generate floor plans for a project"""
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        project_data = {
            'land_width': project.land_width,
            'land_depth': project.land_depth,
            'bedrooms': project.bedrooms,
            'bathrooms': project.bathrooms,
            'living_areas': project.living_areas,
            'garage_spaces': project.garage_spaces,
            'open_plan': project.open_plan,
        }
        
        layouts = generate_floor_plans(project_data)
        
        for idx, layout in enumerate(layouts):
            floor_plan = models.FloorPlan(
                project_id=project_id,
                variant_number=idx + 1,
                total_area=layout['total_area'],
                living_area=layout['living_area'],
                plan_type=models.PlanType.BASIC,
                layout_data=json.dumps(layout),
                is_compliant=layout['compliant'],
                compliance_notes=layout['compliance_notes'],
                generation_time_seconds=0.5,
                ai_model_version='rule-based-v1'
            )
            db.add(floor_plan)
        
        project.status = models.ProjectStatus.COMPLETED
        db.commit()
        
        return {"message": "Floor plans generated successfully", "count": len(layouts)}
        
    except Exception as e:
        project.status = models.ProjectStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/plans", response_model=List[schemas.FloorPlanResponse])
async def get_plans(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get all floor plans for a project"""
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    plans = db.query(models.FloorPlan).filter(
        models.FloorPlan.project_id == project_id
    ).all()
    
    return plans

@router.get("/{plan_id}/download/pdf")
async def download_pdf(plan_id: int, user_id: int, db: Session = Depends(get_db)):
    """Generate and download PDF for a floor plan"""
    floor_plan = db.query(models.FloorPlan).filter(
        models.FloorPlan.id == plan_id
    ).first()
    
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    
    project = db.query(models.Project).filter(
        models.Project.id == floor_plan.project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
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
    
    # Upload to Azure if not already uploaded
    if not floor_plan.pdf_url:
        pdf_buffer.seek(0)
        pdf_url = storage_service.upload_pdf(pdf_buffer, project.id, floor_plan.id)
        floor_plan.pdf_url = pdf_url
        db.commit()
        pdf_buffer.seek(0)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=floor_plan_{floor_plan.variant_number}.pdf"
        }
    )