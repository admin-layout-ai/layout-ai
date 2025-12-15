from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
from .validators import ProjectValidators

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    land_width: float = Field(..., gt=0)
    land_depth: float = Field(..., gt=0)
    bedrooms: Optional[int] = Field(None, ge=1, le=10)
    bathrooms: Optional[float] = Field(None, ge=1, le=10)
    
    @validator('land_width', 'land_depth')
    def validate_dimensions(cls, v, values):
        if 'land_width' in values and 'land_depth' in values:
            ProjectValidators.validate_land_dimensions(
                values['land_width'], 
                values.get('land_depth', v)
            )
        return v
    
    @validator('bedrooms')
    def validate_bedrooms(cls, v):
        if v:
            ProjectValidators.validate_bedrooms(v)
        return v
    
    @validator('bathrooms')
    def validate_bathrooms(cls, v):
        if v:
            ProjectValidators.validate_bathrooms(v)
        return v

# Enums
class ProjectStatusEnum(str, Enum):
    DRAFT = "draft"
    QUESTIONNAIRE = "questionnaire"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"

class PlanTypeEnum(str, Enum):
    BASIC = "basic"
    STANDARD = "standard"
    PREMIUM = "premium"

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    is_builder: bool = False

class UserCreate(UserBase):
    azure_ad_id: str

class UserResponse(UserBase):
    id: int
    azure_ad_id: str
    is_active: bool
    subscription_tier: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Project Schemas
class ProjectBase(BaseModel):
    name: str
    land_width: Optional[float] = None
    land_depth: Optional[float] = None
    land_area: Optional[float] = None
    land_slope: Optional[str] = None
    orientation: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    living_areas: Optional[int] = None
    garage_spaces: Optional[int] = None
    storeys: int = 1
    style: Optional[str] = None
    open_plan: bool = True
    state: Optional[str] = None
    council: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[ProjectStatusEnum] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    # ... other optional fields

class ProjectResponse(ProjectBase):
    id: int
    user_id: int
    status: ProjectStatusEnum
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Floor Plan Schemas
class FloorPlanBase(BaseModel):
    variant_number: int
    total_area: Optional[float] = None
    plan_type: PlanTypeEnum

class FloorPlanResponse(FloorPlanBase):
    id: int
    project_id: int
    pdf_url: Optional[str] = None
    preview_image_url: Optional[str] = None
    is_compliant: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Questionnaire Response
class QuestionnaireResponse(BaseModel):
    bedrooms: int = Field(ge=1, le=10)
    bathrooms: float = Field(ge=1, le=10)
    living_areas: int = Field(ge=1, le=5)
    garage_spaces: int = Field(ge=0, le=4)
    storeys: int = Field(ge=1, le=3)
    style: str
    open_plan: bool
    outdoor_entertainment: bool
    home_office: bool
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None