from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/v1/users", tags=["users"])

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    email: str,
    azure_ad_id: str,
    full_name: str = None,
    db: Session = Depends(get_db)
):
    """Create a new user"""
    # Check if user already exists
    existing_user = db.query(models.User).filter(
        models.User.email == email
    ).first()
    
    if existing_user:
        return existing_user
    
    # Create new user
    db_user = models.User(
        azure_ad_id=azure_ad_id,
        email=email,
        full_name=full_name,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.get("/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    """Get a user by ID"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user