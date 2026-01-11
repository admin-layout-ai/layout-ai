# backend/app/services/__init__.py
"""
Services package for floor plan generation.

Available services:
- GeminiFloorPlanService: Main generation with Nano Banana Pro + Gemini Vision
- FloorPlanValidator: Requirement and NCC compliance validation
- NCCComplianceChecker: Australian National Construction Code checker
- generate_optimized_floor_plan: Constraint-based fallback optimizer
"""

from .gemini_floor_plan_service import (
    GeminiFloorPlanService, 
    create_gemini_service,
    GenerationResult
)
from .floor_plan_validator import (
    FloorPlanValidator, 
    create_validator,
    NCCComplianceChecker,
    ValidationResult,
    ValidationIssue,
    ValidationSeverity
)

__all__ = [
    # Gemini service
    "GeminiFloorPlanService",
    "create_gemini_service",
    "GenerationResult",
    # Validator
    "FloorPlanValidator", 
    "create_validator",
    "NCCComplianceChecker",
    "ValidationResult",
    "ValidationIssue",
    "ValidationSeverity",
]
