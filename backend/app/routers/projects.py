from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from ..analytics import analytics  # Add this import
from datetime import datetime

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

@router.post("/", response_model=schemas.ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: schemas.ProjectCreate, 
    user_id: int, 
    db: Session = Depends(get_db)
):
    """Create a new project"""
    # Create the project
    db_project = models.Project(
        user_id=user_id,
        name=project.name,
        land_width=project.land_width,
        land_depth=project.land_depth,
        land_area=project.land_width * project.land_depth if project.land_width and project.land_depth else None,
        bedrooms=project.bedrooms,
        bathrooms=project.bathrooms,
        living_areas=project.living_areas,
        garage_spaces=project.garage_spaces,
        storeys=project.storeys,
        style=project.style,
        state=project.state,
        status=models.ProjectStatus.DRAFT,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # Track analytics event - ADD THIS
    analytics.track_event("project_created", user_id, {
        "project_id": db_project.id,
        "bedrooms": project.bedrooms,
        "bathrooms": project.bathrooms,
        "style": project.style,
        "state": project.state,
        "land_area": db_project.land_area
    })
    
    return db_project

@router.get("/", response_model=List[schemas.ProjectResponse])
async def list_projects(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all projects for a user"""
    projects = db.query(models.Project).filter(
        models.Project.user_id == user_id
    ).offset(skip).limit(limit).all()
    
    return projects

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
async def get_project(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific project"""
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project

@router.put("/{project_id}", response_model=schemas.ProjectResponse)
async def update_project(
    project_id: int,
    project_update: schemas.ProjectUpdate,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Update a project"""
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update fields
    update_data = project_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_project, field, value)
    
    db_project.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_project)
    
    # Track analytics event
    analytics.track_event("project_updated", user_id, {
        "project_id": project_id,
        "updated_fields": list(update_data.keys())
    })
    
    return db_project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Delete a project"""
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Track analytics event before deleting
    analytics.track_event("project_deleted", user_id, {
        "project_id": project_id,
        "project_name": db_project.name
    })
    
    db.delete(db_project)
    db.commit()
    
    return None

@router.post("/{project_id}/questionnaire", response_model=schemas.ProjectResponse)
async def submit_questionnaire(
    project_id: int,
    questionnaire: schemas.QuestionnaireResponse,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Submit questionnaire for a project"""
    db_project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update project with questionnaire data
    db_project.bedrooms = questionnaire.bedrooms
    db_project.bathrooms = questionnaire.bathrooms
    db_project.living_areas = questionnaire.living_areas
    db_project.garage_spaces = questionnaire.garage_spaces
    db_project.storeys = questionnaire.storeys
    db_project.style = questionnaire.style
    db_project.open_plan = questionnaire.open_plan
    db_project.outdoor_entertainment = questionnaire.outdoor_entertainment
    db_project.home_office = questionnaire.home_office
    db_project.status = models.ProjectStatus.QUESTIONNAIRE
    db_project.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_project)
    
    # Track analytics event
    analytics.track_event("questionnaire_submitted", user_id, {
        "project_id": project_id,
        "bedrooms": questionnaire.bedrooms,
        "bathrooms": questionnaire.bathrooms,
        "style": questionnaire.style,
        "has_home_office": questionnaire.home_office
    })
    
    return db_project