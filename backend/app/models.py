from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    azure_ad_id = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255))
    company_name = Column(String(255))
    phone = Column(String(50))
    address = Column(String(500))
    is_active = Column(Boolean, default=True)
    is_builder = Column(Boolean, default=False)
    abn_acn = Column(String(20))
    builder_logo_url = Column(String(500))
    subscription_tier = Column(String(50), default="free")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(13), default="draft")
    
    # Land details
    land_width = Column(Float)
    land_depth = Column(Float)
    land_area = Column(Float)
    land_slope = Column(String(50))
    orientation = Column(String(50))
    street_frontage = Column(String(50))
    
    # Building requirements
    bedrooms = Column(Integer)
    bathrooms = Column(Float)
    living_areas = Column(Integer)
    garage_spaces = Column(Integer)
    storeys = Column(Integer, default=1)
    
    # Preferences
    style = Column(String(100))
    open_plan = Column(Boolean, default=True)
    outdoor_entertainment = Column(Boolean, default=False)
    home_office = Column(Boolean, default=False)
    
    # Location details
    lot_dp = Column(String(100))
    street_address = Column(String(200))
    suburb = Column(String(100))
    state = Column(String(50))
    postcode = Column(String(10))
    council = Column(String(255))
    bal_rating = Column(String(20))
    
    # Files
    contour_plan_url = Column(Text)
    developer_guidelines_url = Column(Text)  # NEW: Developer guidelines document
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", back_populates="projects")
    plans = relationship("FloorPlan", back_populates="project", cascade="all, delete-orphan")


class FloorPlan(Base):
    __tablename__ = "floor_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    
    variant_number = Column(Integer)
    total_area = Column(Float)
    living_area = Column(Float)
    plan_type = Column(String(50))
    
    layout_data = Column(Text)
    compliance_data = Column(Text)
    
    pdf_url = Column(Text)
    dxf_url = Column(Text)
    preview_image_url = Column(Text)
    model_3d_url = Column(Text)
    
    is_compliant = Column(Boolean, default=False)
    compliance_notes = Column(Text)
    
    generation_time_seconds = Column(Float)
    ai_model_version = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    project = relationship("Project", back_populates="plans")


class Payment(Base):
    __tablename__ = "payments"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    
    amount = Column(Integer)
    currency = Column(String(3), default="AUD")
    status = Column(String(50))
    payment_method = Column(String(50))
    
    stripe_payment_intent_id = Column(String(255))
    stripe_customer_id = Column(String(255))
    
    plan_type = Column(String(50))
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", back_populates="payments")


class ComplianceRule(Base):
    __tablename__ = "compliance_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    state = Column(String(50), nullable=False)
    council = Column(String(255))
    rule_type = Column(String(100))
    rule_name = Column(String(255))
    rule_value = Column(Text)
    description = Column(Text)
    ncc_reference = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
